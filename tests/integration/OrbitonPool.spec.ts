import { Blockchain, printTransactionFees, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, fromNano, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import {
  encodePriceSqrt,
  expandTo18Decimals,
  getMaxTick,
  getMinTick,
  MAX_SQRT_RATIO,
  MIN_SQRT_RATIO,
} from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';
import { FeeAmount, TICK_SPACINGS } from '../libraries/TickTest.spec';
import { loadInfo } from '../../tlb/tick';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';
import BigNumber from 'bignumber.js';
import PositionWrapper from '../../wrappers/core/Position';
import { TickInfo } from '../../tlb/pool';

describe('Pool Test', () => {
  let poolCode: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;
  let positionCode: Cell;
  let routerCode: Cell;

  beforeAll(async () => {
    poolCode = await compile('Pool');
    // console.log(poolCode.toBoc().toString('hex').length);
    lpAccountCode = await compile('LpAccount');
    tickMathCode = await compile('TickMathTest');
    positionCode = await compile('Position');
    routerCode = await compile('Router');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<RouterWrapper.RouterTest>;
  let token0MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let token1MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token1WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let pool: SandboxContract<PoolWrapper.PoolTest>;
  let tickMath: SandboxContract<TickMathTest>;
  const tickMin = getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  const tickMax = getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  let tickSpacing = TICK_SPACINGS[FeeAmount.MEDIUM];
  let poolContract: SandboxContract<PoolWrapper.PoolTest>;
  let routerJetton0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let routerJetton1WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    router = blockchain.openContract(
      RouterWrapper.RouterTest.create(routerCode, {
        adminAddress: deployer.address,
        lpAccountCode: lpAccountCode,
        positionCode: positionCode,
        poolCode: poolCode,
      }),
    );

    token0MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token0')).endCell(),
      }),
    );
    token1MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token1')).endCell(),
      }),
    );
    let deployResult = await router.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      deploy: true,
      success: true,
    });
    deployResult = await token0MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token0MasterContract.address,
      deploy: true,
      success: true,
    });
    deployResult = await token1MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token1MasterContract.address,
      deploy: true,
      success: true,
    });
    await token0MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: expandTo18Decimals(50),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );
    await token1MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: expandTo18Decimals(50),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );

    const token0Wallet = await token0MasterContract.getWalletAddress(deployer.address);
    const token0WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token0Wallet);
    token0WalletContract = blockchain.openContract(token0WalletInstance);

    const token1Wallet = await token1MasterContract.getWalletAddress(deployer.address);
    const token1WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token1Wallet);
    token1WalletContract = blockchain.openContract(token1WalletInstance);
  });

  it('should deploy successfully', async () => {
    console.log(router.address);
  });

  describe('#mint', () => {
    let routerJetton0WalletAddress: Address;
    let routerJetton1WalletAddress: Address;
    let poolAddress: Address;

    beforeEach(async () => {
      routerJetton0WalletAddress = await token0MasterContract.getWalletAddress(router.address);
      routerJetton1WalletAddress = await token1MasterContract.getWalletAddress(router.address);
    });
    it('fails if not initialized', async () => {
      const pool = await router.getPoolAddress(routerJetton0WalletAddress, routerJetton1WalletAddress, 3000n, 60n);
      const poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(pool));
      let transfer0: SendMessageResult;
      let transfer1: SendMessageResult;
      if (
        BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) <
        BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
      ) {
        transfer0 = await token0WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: 9996n,
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton1WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: 3161n,
            },
          },
          {
            value: toNano(1),
          },
        );

        transfer1 = await token1WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: 2000n,
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton0WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: 3161n,
            },
          },
          {
            value: toNano(1),
          },
        );
      } else {
        transfer0 = await token1WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: 9996n,
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton0WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: 3161n,
            },
          },
          {
            value: toNano(1),
          },
        );

        transfer1 = await token0WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: 2000n,
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton1WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: 3161n,
            },
          },
          {
            value: toNano(1),
          },
        );
      }
      expect(transfer0.transactions).toHaveTransaction({
        from: router.address,
        to: poolContract.address,
        success: false,
        exitCode: undefined,
      });
      expect(transfer1.transactions).toHaveTransaction({
        from: router.address,
        to: poolContract.address,
        success: false,
        exitCode: undefined,
      });
    });

    describe('after initialization', () => {
      beforeEach(async () => {
        console.log('initialize the pool at price of 10:1');
        const createPool = await router.sendCreatePool(
          deployer.getSender(),
          {
            kind: 'OpCreatePool',
            query_id: 0,
            jetton0_wallet: routerJetton0WalletAddress,
            jetton1_wallet: routerJetton1WalletAddress,
            fee: 3000,
            sqrt_price_x96: encodePriceSqrt(1n, 10n),
            tick_spacing: 60,
            jetton_master_ref: {
              kind: 'JettonMasterRef',
              jetton0_master: token0MasterContract.address,
              jetton1_master: token1MasterContract.address,
            },
          },
          {
            value: toNano('0.1'),
          },
        );
        poolAddress = await router.getPoolAddress(routerJetton0WalletAddress, routerJetton1WalletAddress, 3000n, 60n);
        poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(poolAddress));
        expect(createPool.transactions).toHaveTransaction({
          from: router.address,
          to: poolAddress,
          success: true,
        });
        const lpAccount = await poolContract.getLpAccountAddress(deployer.address, BigInt(tickMin), BigInt(tickMax));
        // Create position
        let transfer0;
        let transfer1;
        if (
          BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) <
          BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
        ) {
          transfer0 = await token0WalletContract.sendTransferMint(
            deployer.getSender(),
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 9996n,
              to_address: router.address,
              response_address: deployer.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerJetton1WalletAddress,
                tick_lower: tickMin,
                tick_upper: tickMax,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 3161n,
              },
            },
            {
              value: toNano(1),
            },
          );

          transfer1 = await token1WalletContract.sendTransferMint(
            deployer.getSender(),
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 2000n,
              to_address: router.address,
              response_address: deployer.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerJetton0WalletAddress,
                tick_lower: tickMin,
                tick_upper: tickMax,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 3161n,
              },
            },
            {
              value: toNano(1),
            },
          );
        } else {
          transfer0 = await token1WalletContract.sendTransferMint(
            deployer.getSender(),
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 9996n,
              to_address: router.address,
              response_address: deployer.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerJetton0WalletAddress,
                tick_lower: tickMin,
                tick_upper: tickMax,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 3161n,
              },
            },
            {
              value: toNano(1),
            },
          );

          transfer1 = await token0WalletContract.sendTransferMint(
            deployer.getSender(),
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 2000n,
              to_address: router.address,
              response_address: deployer.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerJetton1WalletAddress,
                tick_lower: tickMin,
                tick_upper: tickMax,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 3161n,
              },
            },
            {
              value: toNano(1),
            },
          );
          const tmp = routerJetton0WalletAddress;
          routerJetton0WalletAddress = routerJetton1WalletAddress;
          routerJetton1WalletAddress = tmp;
          const tokenTmp = token0WalletContract;
          token0WalletContract = token1WalletContract;
          token1WalletContract = tokenTmp;
        }

        printTransactionFees(transfer0.transactions);
        printTransactionFees(transfer1.transactions);

        routerJetton0WalletContract = blockchain.openContract(
          JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0WalletAddress),
        );
        routerJetton1WalletContract = blockchain.openContract(
          JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1WalletAddress),
        );
        const { fee, liquidity, sqrtPriceX96 } = await poolContract.getPoolInfo();

        expect(liquidity).toEqual(3161n);
        expect(fee).toEqual(3000n);
        expect(sqrtPriceX96).toEqual(encodePriceSqrt(1n, 10n));

        expect(transfer0.transactions).toHaveTransaction({
          from: poolContract.address,
          to: lpAccount,
          success: true,
        });
        expect(transfer1.transactions).toHaveTransaction({
          from: poolContract.address,
          to: lpAccount,
          success: true,
        });
        expect(transfer1.transactions).toHaveTransaction({
          from: lpAccount,
          to: poolContract.address,
          success: true,
        });
      });
      describe('success cases', () => {
        it('initial balances', async () => {
          const token0Balance = await routerJetton0WalletContract.getBalance();
          const token1Balance = await routerJetton1WalletContract.getBalance();
          expect(token0Balance.amount).toEqual(9996n);
          expect(token1Balance.amount).toEqual(1000n);
        });

        it('initial tick', async () => {
          const { tick } = await poolContract.getPoolInfo();
          expect(tick).toEqual(-23028n);
        });
        describe('above current price', () => {
          it('transfers token0 only', async () => {
            const transfer0 = await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 1000000n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -22980,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            // const transfer1 = await token1WalletContract.sendTransferMint(
            //   deployer.getSender(),
            //   {
            //     kind: 'OpJettonTransferMint',
            //     query_id: 0,
            //     jetton_amount: 1000000n,
            //     to_address: router.address,
            //     response_address: deployer.address,
            //     custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            //     forward_ton_amount: toNano(0.8),
            //     either_payload: true,
            //     mint: {
            //       kind: 'MintParams',
            //       forward_opcode: PoolWrapper.Opcodes.Mint,
            //       jetton1_wallet: routerJetton0WalletAddress,
            //       tick_lower: -22980,
            //       tick_upper: 0,
            //       tick_spacing: 60,
            //       fee: 3000,
            //       liquidity_delta: 10000n,
            //     },
            //   },
            //   {
            //     value: toNano(1),
            //   },
            // );
            printTransactionFees(transfer0.transactions);
            const totalFees0 = transfer0.transactions.reduce((acc, tx) => acc + tx.totalFees.coins, 0n);
            // printTransactionFees(transfer1.transactions);
            // const totalFees1 = transfer1.transactions.reduce((acc, tx) => acc + tx.totalFees.coins , 0n);
            // console.log({totalFees0: fromNano(totalFees0), totalFees1: fromNano(totalFees1)});

            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();
            expect(token1Balance.amount).toEqual(1000n);
            expect(token0Balance.amount).toEqual(9996n + 21549n);
          });

          it('max tick with max leverage', async () => {
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMax - tickSpacing,
                  tick_upper: tickMax,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 2n ** 102n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMax - tickSpacing,
                  tick_upper: tickMax,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 2n ** 102n,
                },
              },
              {
                value: toNano(1),
              },
            );

            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();
            expect(token0Balance.amount).toEqual(9996n + 828011525n);
            expect(token1Balance.amount).toEqual(1000n);
          });

          it('works for max tick', async () => {
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -22980,
                  tick_upper: tickMax,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -22980,
                  tick_upper: tickMax,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();
            expect(token0Balance.amount).toEqual(9996n + 31549n);
            expect(token1Balance.amount).toEqual(1000n);
          });

          it('removing works', async () => {
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            const positionAddress = await poolContract.getPositionAddress(-240n, 0n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );
            const burnResult = await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 10000n);
            printTransactionFees(burnResult.transactions);
            const { tokenOwed0, tokenOwed1 } = await positionContract.getTokensOwed();
            console.log(tokenOwed0, tokenOwed1);
            expect(tokenOwed0).toEqual(120n);
            expect(tokenOwed1).toEqual(0n);
          });

          it('adds liquidity to liquidityGross', async () => {
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(100n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(100n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing))).liquidity_gross).toEqual(0n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing * 2))).liquidity_gross).toEqual(0n);

            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 150n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 150n,
                },
              },
              {
                value: toNano(1),
              },
            );

            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(250n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(100n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing))).liquidity_gross).toEqual(150n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing * 2))).liquidity_gross).toEqual(0n);

            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: 0,
                  tick_upper: tickSpacing * 2,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 60n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: 0,
                  tick_upper: tickSpacing * 2,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 60n,
                },
              },
              {
                value: toNano(1),
              },
            );

            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(250n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(160n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing))).liquidity_gross).toEqual(150n);
            expect((await poolContract.getTickInfo(BigInt(tickSpacing * 2))).liquidity_gross).toEqual(60n);
          });

          it('removes liquidity from liquidityGross', async () => {
            // First mint: add 100 liquidity
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Second mint: add 40 more liquidity to the same position
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 40n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 40n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify the liquidity was added correctly
            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(140n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(140n);

            // Get the position address and contract
            const positionAddress = await poolContract.getPositionAddress(-240n, 0n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn 90 liquidity from the position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 90n);

            // Verify the liquidityGross at both ticks is now 50 (100 + 40 - 90)
            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(50n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(50n);
          });

          it('clears tick lower if last position is removed', async () => {
            // First mint a position with 100 liquidity
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify the tick was initialized with liquidity
            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(100n);

            // Get the position address and contract
            const positionAddress = await poolContract.getPositionAddress(-240n, 0n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn all liquidity from the position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 100n);

            // Verify the tick was cleared (liquidity_gross and fee growth values should be 0)
            const tickInfo = await poolContract.getTickInfo(-240n);
            expect(tickInfo.liquidity_gross).toEqual(0n);
            expect(tickInfo.fee_growth_outside_0_x128).toEqual(0n);
            expect(tickInfo.fee_growth_outside_1_x128).toEqual(0n);
            expect(tickInfo.initialized).toEqual(false);
          });

          it('clears tick upper if last position is removed', async () => {
            // First mint a position with 100 liquidity
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify the tick was initialized with liquidity
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(100n);

            // Get the position address and contract
            const positionAddress = await poolContract.getPositionAddress(-240n, 0n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn all liquidity from the position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 100n);

            // Verify the tick was cleared (liquidity_gross and fee growth values should be 0)
            const tickInfo = await poolContract.getTickInfo(0n);
            expect(tickInfo.liquidity_gross).toEqual(0n);
            expect(tickInfo.fee_growth_outside_0_x128).toEqual(0n);
            expect(tickInfo.fee_growth_outside_1_x128).toEqual(0n);
            expect(tickInfo.initialized).toEqual(false);
          });

          it('only clears the tick that is not used at all', async () => {
            // First mint a position with 100 liquidity from -240 to 0
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -240,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Then mint another position with 250 liquidity from -tickSpacing to 0
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -tickSpacing,
                  tick_upper: 0,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 250n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -tickSpacing,
                  tick_upper: 0,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 250n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify both ticks have the expected liquidity
            expect((await poolContract.getTickInfo(-240n)).liquidity_gross).toEqual(100n);
            expect((await poolContract.getTickInfo(-BigInt(tickSpacing))).liquidity_gross).toEqual(250n);
            expect((await poolContract.getTickInfo(0n)).liquidity_gross).toEqual(350n); // 100 + 250

            // Get the position address and contract for the first position
            const positionAddress = await poolContract.getPositionAddress(-240n, 0n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn all liquidity from the first position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 100n);

            // Verify the -240 tick was cleared (not used by any position anymore)
            let tickInfo = await poolContract.getTickInfo(-240n);
            expect(tickInfo.liquidity_gross).toEqual(0n);
            expect(tickInfo.fee_growth_outside_0_x128).toEqual(0n);
            expect(tickInfo.fee_growth_outside_1_x128).toEqual(0n);
            expect(tickInfo.initialized).toEqual(false);

            // Verify the -tickSpacing tick still has its liquidity (still used by the second position)
            tickInfo = await poolContract.getTickInfo(-BigInt(tickSpacing));
            expect(tickInfo.liquidity_gross).toEqual(250n);
            expect(tickInfo.initialized).toEqual(true);

            // Verify the 0 tick still has liquidity from the second position
            tickInfo = await poolContract.getTickInfo(0n);
            expect(tickInfo.liquidity_gross).toEqual(250n);
            expect(tickInfo.initialized).toEqual(true);
          });
        });

        describe('including current price', () => {
          it('price within range: transfers current price of both tokens', async () => {
            // await mint(wallet.address, minTick + tickSpacing, maxTick - tickSpacing, 100)
            // expect(await token0.balanceOf(pool.address)).to.eq(9996 + 317)
            // expect(await token1.balanceOf(pool.address)).to.eq(1000 + 32)

            // Mint a position with 100 liquidity that includes the current price
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Check the token balances in the router's wallets
            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();

            // Verify that both tokens were transferred (since the position includes the current price)
            expect(token0Balance.amount).toEqual(9996n + 317n);
            expect(token1Balance.amount).toEqual(1000n + 32n);
          });

          it('initializes lower tick', async () => {
            // await mint(wallet.address, minTick + tickSpacing, maxTick - tickSpacing, 100)
            // const { liquidityGross } = await pool.ticks(minTick + tickSpacing)
            // expect(liquidityGross).to.eq(100)

            // Mint a position with 100 liquidity that includes the current price
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify the lower tick was initialized with the correct liquidity
            const lowerTickInfo = await poolContract.getTickInfo(BigInt(tickMin + tickSpacing));
            expect(lowerTickInfo.liquidity_gross).toEqual(100n);
          });

          it('initializes upper tick', async () => {
            // await mint(wallet.address, minTick + tickSpacing, maxTick - tickSpacing, 100)
            // const { liquidityGross } = await pool.ticks(maxTick - tickSpacing)
            // expect(liquidityGross).to.eq(100)

            // Mint a position with 100 liquidity that includes the current price
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Verify the upper tick was initialized with the correct liquidity
            const upperTickInfo = await poolContract.getTickInfo(BigInt(tickMax - tickSpacing));
            expect(upperTickInfo.liquidity_gross).toEqual(100n);
          });

          it('works for min/max tick', async () => {
            // await mint(wallet.address, minTick, maxTick, 10000)
            // expect(await token0.balanceOf(pool.address)).to.eq(9996 + 31623)
            // expect(await token1.balanceOf(pool.address)).to.eq(1000 + 3163)

            // Mint a position with 10000 liquidity that spans the entire range (min to max tick)
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: tickMax,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: tickMax,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Check the token balances in the router's wallets
            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();

            // Verify that both tokens were transferred in the expected amounts
            expect(token0Balance.amount).toEqual(9996n + 31623n);
            expect(token1Balance.amount).toEqual(1000n + 3163n);
          });

          it('removing works', async () => {
            // await mint(wallet.address, minTick + tickSpacing, maxTick - tickSpacing, 100)
            // await pool.burn(minTick + tickSpacing, maxTick - tickSpacing, 100)
            // const { amount0, amount1 } = await pool.callStatic.collect(
            //   wallet.address,
            //   minTick + tickSpacing,
            //   maxTick - tickSpacing,
            //   MaxUint128,
            //   MaxUint128
            // )
            // expect(amount0, 'amount0').to.eq(316)
            // expect(amount1, 'amount1').to.eq(31)

            // First mint a position with 100 liquidity that includes the current price
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin + tickSpacing,
                  tick_upper: tickMax - tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 100n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Get the position address and contract
            const positionAddress = await poolContract.getPositionAddress(
              BigInt(tickMin + tickSpacing),
              BigInt(tickMax - tickSpacing),
              deployer.address,
            );
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn all liquidity from the position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 100n);

            // Check the tokens owed to the position owner
            const { tokenOwed0, tokenOwed1 } = await positionContract.getTokensOwed();

            // Verify the correct amounts were returned
            expect(tokenOwed0).toEqual(316n);
            expect(tokenOwed1).toEqual(31n);
          });
        });

        describe('below current price', () => {
          it('transfers token1 only', async () => {
            // await mint(wallet.address, -46080, -23040, 10000)
            // expect(await token0.balanceOf(pool.address)).to.eq(9996)
            // expect(await token1.balanceOf(pool.address)).to.eq(1000 + 2162)
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -46080,
                  tick_upper: -23040,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Check the token balances in the router's wallets
            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();

            // Verify that only token1 was transferred (since the position is below current price)
            expect(token0Balance.amount).toEqual(9996n); // No change in token0
            expect(token1Balance.amount).toEqual(1000n + 2162n); // Only token1 is used
          });

          it('min tick with max leverage', async () => {
            // await mint(wallet.address, minTick, minTick + tickSpacing, BigNumber.from(2).pow(102))
            // expect(await token0.balanceOf(pool.address)).to.eq(9996)
            // expect(await token1.balanceOf(pool.address)).to.eq(1000 + 828011520)

            // Mint a position with maximum leverage at the minimum tick
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: tickMin + tickSpacing,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 2n ** 102n, // Maximum leverage
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: tickMin + tickSpacing,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 2n ** 102n, // Maximum leverage
                },
              },
              {
                value: toNano(1),
              },
            );

            // Check the token balances in the router's wallets
            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();

            // Verify that only token1 was transferred in a large amount
            expect(token0Balance.amount).toEqual(9996n); // No change in token0
            expect(token1Balance.amount).toEqual(1000n + 828011520n); // Large amount of token1
          });

          it('works for min tick', async () => {
            // await mint(wallet.address, minTick, -23040, 10000)
            // expect(await token0.balanceOf(pool.address)).to.eq(9996)
            // expect(await token1.balanceOf(pool.address)).to.eq(1000 + 3161)

            // Mint a position with 10000 liquidity from min tick to -23040
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: -23040,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: tickMin,
                  tick_upper: -23040,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Check the token balances in the router's wallets
            const token0Balance = await routerJetton0WalletContract.getBalance();
            const token1Balance = await routerJetton1WalletContract.getBalance();

            // Verify that only token1 was transferred
            expect(token0Balance.amount).toEqual(9996n); // No change in token0
            expect(token1Balance.amount).toEqual(1000n + 3161n); // Only token1 is used
          });

          it('removing works', async () => {
            // await mint(wallet.address, -46080, -46020, 10000)
            // await pool.burn(-46080, -46020, 10000)
            // const { amount0, amount1 } = await pool.callStatic.collect(
            //   wallet.address,
            //   -46080,
            //   -46020,
            //   MaxUint128,
            //   MaxUint128
            // )
            // expect(amount0, 'amount0').to.eq(0)
            // expect(amount1, 'amount1').to.eq(3)

            // First mint a position with 10000 liquidity that is entirely below the current price
            await token0WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton1WalletAddress,
                  tick_lower: -46080,
                  tick_upper: -46020,
                  tick_spacing: 60,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );
            await token1WalletContract.sendTransferMint(
              deployer.getSender(),
              {
                kind: 'OpJettonTransferMint',
                query_id: 0,
                jetton_amount: 828011525n,
                to_address: router.address,
                response_address: deployer.address,
                custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                forward_ton_amount: toNano(0.8),
                either_payload: true,
                mint: {
                  kind: 'MintParams',
                  forward_opcode: PoolWrapper.Opcodes.Mint,
                  jetton1_wallet: routerJetton0WalletAddress,
                  tick_lower: -46080,
                  tick_upper: -46020,
                  tick_spacing: tickSpacing,
                  fee: 3000,
                  liquidity_delta: 10000n,
                },
              },
              {
                value: toNano(1),
              },
            );

            // Get the position address and contract
            const positionAddress = await poolContract.getPositionAddress(-46080n, -46020n, deployer.address);
            const positionContract = blockchain.openContract(
              PositionWrapper.Position.createFromAddress(positionAddress),
            );

            // Burn all liquidity from the position
            await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), 10000n);

            // Check the tokens owed to the position owner
            const { tokenOwed0, tokenOwed1 } = await positionContract.getTokensOwed();

            // Verify the correct amounts were returned
            expect(tokenOwed0).toEqual(0n); // No token0 should be returned
            expect(tokenOwed1).toEqual(3n); // Only a small amount of token1 is returned
          });
        });
      });
    });
  });

  describe('#burn', () => {
    let routerJetton0WalletAddress: Address;
    let routerJetton1WalletAddress: Address;
    let poolAddress: Address;

    beforeEach(async () => {
      console.log('initialize at zero tick');
      routerJetton0WalletAddress = await token0MasterContract.getWalletAddress(router.address);
      routerJetton1WalletAddress = await token1MasterContract.getWalletAddress(router.address);
      await router.sendCreatePool(
        deployer.getSender(),
        {
          kind: 'OpCreatePool',
          query_id: 0,
          jetton0_wallet: routerJetton0WalletAddress,
          jetton1_wallet: routerJetton1WalletAddress,
          fee: 3000,
          sqrt_price_x96: encodePriceSqrt(1n, 1n),
          tick_spacing: 60,
          jetton_master_ref: {
            kind: 'JettonMasterRef',
            jetton0_master: token0MasterContract.address,
            jetton1_master: token1MasterContract.address,
          },
        },
        {
          value: toNano('0.1'),
        },
      );

      // Create position
      let transfer0;
      let transfer1;
      if (
        BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) <
        BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
      ) {
        transfer0 = await token0WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: expandTo18Decimals(5),
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton1WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: expandTo18Decimals(2),
            },
          },
          {
            value: toNano(1),
          },
        );

        transfer1 = await token1WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: expandTo18Decimals(5),
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton0WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: expandTo18Decimals(2),
            },
          },
          {
            value: toNano(1),
          },
        );
      } else {
        transfer0 = await token1WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: expandTo18Decimals(5),
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton0WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: expandTo18Decimals(2),
            },
          },
          {
            value: toNano(1),
          },
        );

        transfer1 = await token0WalletContract.sendTransferMint(
          deployer.getSender(),
          {
            kind: 'OpJettonTransferMint',
            query_id: 0,
            jetton_amount: expandTo18Decimals(5),
            to_address: router.address,
            response_address: deployer.address,
            custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
            forward_ton_amount: toNano(0.8),
            either_payload: true,
            mint: {
              kind: 'MintParams',
              forward_opcode: PoolWrapper.Opcodes.Mint,
              jetton1_wallet: routerJetton1WalletAddress,
              tick_lower: tickMin,
              tick_upper: tickMax,
              tick_spacing: 60,
              fee: 3000,
              liquidity_delta: expandTo18Decimals(2),
            },
          },
          {
            value: toNano(1),
          },
        );
        const tmp = routerJetton0WalletAddress;
        routerJetton0WalletAddress = routerJetton1WalletAddress;
        routerJetton1WalletAddress = tmp;
        const tokenTmp = token0WalletContract;
        token0WalletContract = token1WalletContract;
        token1WalletContract = tokenTmp;
      }
      routerJetton0WalletContract = blockchain.openContract(
        JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0WalletAddress),
      );
      routerJetton1WalletContract = blockchain.openContract(
        JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1WalletAddress),
      );
      poolAddress = await router.getPoolAddress(routerJetton0WalletAddress, routerJetton1WalletAddress, 3000n, 60n);
      poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(poolAddress));
    });

    async function checkTickIsClear(tick: bigint) {
      const { liquidity_gross, fee_growth_outside_0_x128, fee_growth_outside_1_x128, liquidity_net } =
        await poolContract.getTickInfo(tick);
      expect(liquidity_gross).toEqual(0n);
      expect(fee_growth_outside_0_x128).toEqual(0n);
      expect(fee_growth_outside_1_x128).toEqual(0n);
      expect(liquidity_net).toEqual(0n);
    }

    async function checkTickIsNotClear(tick: bigint) {
      const { liquidity_gross } = await poolContract.getTickInfo(tick);
      expect(liquidity_gross).not.toEqual(0n);
    }

    it('does not clear the position fee growth snapshot if no more liquidity', async () => {
      // some activity that would make the ticks non-zero
      // await mint(other.address, minTick, maxTick, expandTo18Decimals(1))
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickMin,
            tick_upper: tickMax,
            tick_spacing: 60,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1), // Maximum leverage
          },
        },
        {
          value: toNano(1),
        },
      );
      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickMin,
            tick_upper: tickMax,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1), // Maximum leverage
          },
        },
        {
          value: toNano(1),
        },
      );
      // await swapExact0For1(expandTo18Decimals(1), wallet.address)
      await token0WalletContract.sendTransferSwap(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferSwap',
          query_id: 0,
          jetton_amount: expandTo18Decimals(1),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(2.0),
          either_payload: true,
          swap: {
            kind: 'SwapParams',
            forward_opcode: PoolWrapper.Opcodes.Swap,
            fee: 3000,
            jetton1_wallet: routerJetton1WalletContract!.address,
            //eslint-di
            sqrt_price_limit: MIN_SQRT_RATIO + 1n,
            tick_spacing: 60,
            zero_for_one: -1,
          },
        },
        {
          value: toNano(2.5),
        },
      );
      // await swapExact1For0(expandTo18Decimals(1), wallet.address)
      await token1WalletContract.sendTransferSwap(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferSwap',
          query_id: 0,
          jetton_amount: expandTo18Decimals(1),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(2.0),
          either_payload: true,
          swap: {
            kind: 'SwapParams',
            forward_opcode: PoolWrapper.Opcodes.Swap,
            fee: 3000,
            jetton1_wallet: routerJetton0WalletContract.address,
            //eslint-di
            sqrt_price_limit: MAX_SQRT_RATIO - 1n,
            tick_spacing: 60,
            zero_for_one: 0,
          },
        },
        {
          value: toNano(2.5),
        },
      );
      // await pool.connect(other).burn(minTick, maxTick, expandTo18Decimals(1))
      const positionAddress = await poolContract.getPositionAddress(BigInt(tickMin), BigInt(tickMax), deployer.address);
      const positionContract = blockchain.openContract(PositionWrapper.Position.createFromAddress(positionAddress));
      await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), expandTo18Decimals(1));
      // const {
      //   liquidity,
      //   tokensOwed0,
      //   tokensOwed1,
      //   feeGrowthInside0LastX128,
      //   feeGrowthInside1LastX128,
      // } = await pool.positions(getPositionKey(other.address, minTick, maxTick))
      // expect(liquidity).to.eq(0)
      // expect(tokensOwed0).to.not.eq(0)
      // expect(tokensOwed1).to.not.eq(0)
      // expect(feeGrowthInside0LastX128).to.eq('340282366920938463463374607431768211')
      // expect(feeGrowthInside1LastX128).to.eq('340282366920938576890830247744589365')
      const { tokenOwed0, tokenOwed1 } = await positionContract.getTokensOwed();
      expect(tokenOwed0).not.toEqual(0n);
      expect(tokenOwed1).not.toEqual(0n);
      const { feeGrowthInside0LastX128, feeGrowthInside1LastX128 } = await positionContract.getFeeGrowthInside();
      expect(feeGrowthInside0LastX128).toEqual(340282366920938463463374607431768211n);
      expect(feeGrowthInside1LastX128).toEqual(340282366920938463463374607431768211n);
    });

    it('clears the tick if its the last position using it', async () => {
      const tickLower = tickMin + tickSpacing;
      const tickUpper = tickMax - tickSpacing;

      // Mint a position with the specified ticks
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      // Perform a swap to generate some fees
      await token0WalletContract.sendTransferSwap(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferSwap',
          query_id: 0,
          jetton_amount: expandTo18Decimals(1),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(2.0),
          either_payload: true,
          swap: {
            kind: 'SwapParams',
            forward_opcode: PoolWrapper.Opcodes.Swap,
            fee: 3000,
            jetton1_wallet: routerJetton1WalletContract!.address,
            sqrt_price_limit: MIN_SQRT_RATIO + 1n,
            tick_spacing: tickSpacing,
            zero_for_one: -1,
          },
        },
        {
          value: toNano(2.5),
        },
      );

      // Get the position address and contract
      const positionAddress = await poolContract.getPositionAddress(
        BigInt(tickLower),
        BigInt(tickUpper),
        deployer.address,
      );
      const positionContract = blockchain.openContract(PositionWrapper.Position.createFromAddress(positionAddress));

      // Burn all liquidity from the position
      await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), expandTo18Decimals(1));

      // Check that both ticks are cleared
      await checkTickIsClear(BigInt(tickLower));
      await checkTickIsClear(BigInt(tickUpper));
    });

    it('clears only the lower tick if upper is still used', async () => {
      const tickLower = tickMin + tickSpacing;
      const tickUpper = tickMax - tickSpacing;

      // First position: tickLower to tickUpper
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      // Second position: (tickLower + tickSpacing) to tickUpper
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickLower + tickSpacing,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickLower + tickSpacing,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      // Perform a swap to generate some fees
      await token0WalletContract.sendTransferSwap(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferSwap',
          query_id: 0,
          jetton_amount: expandTo18Decimals(1),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(2.0),
          either_payload: true,
          swap: {
            kind: 'SwapParams',
            forward_opcode: PoolWrapper.Opcodes.Swap,
            fee: 3000,
            jetton1_wallet: routerJetton1WalletContract!.address,
            sqrt_price_limit: MIN_SQRT_RATIO + 1n,
            tick_spacing: tickSpacing,
            zero_for_one: -1,
          },
        },
        {
          value: toNano(2.5),
        },
      );

      // Get the first position address and contract
      const positionAddress = await poolContract.getPositionAddress(
        BigInt(tickLower),
        BigInt(tickUpper),
        deployer.address,
      );
      const positionContract = blockchain.openContract(PositionWrapper.Position.createFromAddress(positionAddress));

      // Burn all liquidity from the first position
      await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), expandTo18Decimals(1));

      // Check that the lower tick is cleared but the upper tick is not
      await checkTickIsClear(BigInt(tickLower));
      await checkTickIsNotClear(BigInt(tickUpper));
    });

    it('clears only the upper tick if lower is still used', async () => {
      const tickLower = tickMin + tickSpacing;
      const tickUpper = tickMax - tickSpacing;

      // First position: tickLower to tickUpper
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      // Second position: tickLower to (tickUpper - tickSpacing)
      await token0WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton1WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper - tickSpacing,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      await token1WalletContract.sendTransferMint(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferMint',
          query_id: 0,
          jetton_amount: expandTo18Decimals(5),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(0.8),
          either_payload: true,
          mint: {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickLower,
            tick_upper: tickUpper - tickSpacing,
            tick_spacing: tickSpacing,
            fee: 3000,
            liquidity_delta: expandTo18Decimals(1),
          },
        },
        {
          value: toNano(1),
        },
      );

      // Perform a swap to generate some fees
      await token0WalletContract.sendTransferSwap(
        deployer.getSender(),
        {
          kind: 'OpJettonTransferSwap',
          query_id: 0,
          jetton_amount: expandTo18Decimals(1),
          to_address: router.address,
          response_address: deployer.address,
          custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
          forward_ton_amount: toNano(2.0),
          either_payload: true,
          swap: {
            kind: 'SwapParams',
            forward_opcode: PoolWrapper.Opcodes.Swap,
            fee: 3000,
            jetton1_wallet: routerJetton1WalletContract!.address,
            sqrt_price_limit: MIN_SQRT_RATIO + 1n,
            tick_spacing: tickSpacing,
            zero_for_one: -1,
          },
        },
        {
          value: toNano(2.5),
        },
      );

      // Get the first position address and contract
      const positionAddress = await poolContract.getPositionAddress(
        BigInt(tickLower),
        BigInt(tickUpper),
        deployer.address,
      );
      const positionContract = blockchain.openContract(PositionWrapper.Position.createFromAddress(positionAddress));

      // Burn all liquidity from the first position
      await positionContract.sendBurnPosition(deployer.getSender(), toNano(1), expandTo18Decimals(1));

      // Check that the upper tick is cleared but the lower tick is not
      await checkTickIsNotClear(BigInt(tickLower));
      await checkTickIsClear(BigInt(tickUpper));
    });
  });

  // describe('#collect', () => {
  //   let routerJetton0WalletAddress: Address;
  //   let routerJetton1WalletAddress: Address;
  //   let poolAddress: Address;
  //   beforeEach(async () => {
  //     routerJetton0WalletAddress = await token0MasterContract.getWalletAddress(router.address);
  //     routerJetton1WalletAddress = await token1MasterContract.getWalletAddress(router.address);
  //     await router.sendCreatePool(
  //       deployer.getSender(),
  //       {
  //         kind: 'OpCreatePool',
  //         query_id: 0,
  //         jetton0_wallet: routerJetton0WalletAddress,
  //         jetton1_wallet: routerJetton1WalletAddress,
  //         fee: FeeAmount.LOW,
  //         sqrt_price_x96: encodePriceSqrt(1n, 1n),
  //         tick_spacing: TICK_SPACINGS[FeeAmount.LOW],
  //         jetton_master_ref: {
  //           kind: 'JettonMasterRef',
  //           jetton0_master: token0MasterContract.address,
  //           jetton1_master: token1MasterContract.address,
  //         },
  //       },
  //       {
  //         value: toNano('0.1'),
  //       },
  //     );
  //     if (
  //       BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) >
  //       BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
  //     ) {
  //       const tmp = routerJetton0WalletAddress;
  //        routerJetton0WalletAddress = routerJetton1WalletAddress;
  //        routerJetton1WalletAddress = tmp;
  //        const tokenTmp = token0WalletContract;
  //        token0WalletContract = token1WalletContract;
  //        token1WalletContract = tokenTmp;
  //     }
  //   })

  //   it('works with multiple LPs', async () => {
  //     // await mint(wallet.address, minTick, maxTick, expandTo18Decimals(1))
  //     // await mint(wallet.address, minTick + tickSpacing, maxTick - tickSpacing, expandTo18Decimals(2))

  //     // await swapExact0For1(expandTo18Decimals(1), wallet.address)

  //     // // poke positions
  //     // await pool.burn(minTick, maxTick, 0)
  //     // await pool.burn(minTick + tickSpacing, maxTick - tickSpacing, 0)

  //     // const { tokensOwed0: tokensOwed0Position0 } = await pool.positions(
  //     //   getPositionKey(wallet.address, minTick, maxTick)
  //     // )
  //     // const { tokensOwed0: tokensOwed0Position1 } = await pool.positions(
  //     //   getPositionKey(wallet.address, minTick + tickSpacing, maxTick - tickSpacing)
  //     // )

  //     // expect(tokensOwed0Position0).to.be.eq('166666666666667')
  //     // expect(tokensOwed0Position1).to.be.eq('333333333333334')
  //   })

  //   describe('works across large increases', () => {
  //     beforeEach(async () => {
  //       // await mint(wallet.address, minTick, maxTick, expandTo18Decimals(1))
  //     })

  //     // type(uint128).max * 2**128 / 1e18
  //     // https://www.wolframalpha.com/input/?i=%282**128+-+1%29+*+2**128+%2F+1e18
  //     // const magicNumber = BigNumber.from('115792089237316195423570985008687907852929702298719625575994')

  //     it('works just before the cap binds', async () => {
  //       // await pool.setFeeGrowthGlobal0X128(magicNumber)
  //       // await pool.burn(minTick, maxTick, 0)

  //       // const { tokensOwed0, tokensOwed1 } = await pool.positions(getPositionKey(wallet.address, minTick, maxTick))

  //       // expect(tokensOwed0).to.be.eq(MaxUint128.sub(1))
  //       // expect(tokensOwed1).to.be.eq(0)
  //     })

  //     it('works just after the cap binds', async () => {
  //       // await pool.setFeeGrowthGlobal0X128(magicNumber.add(1))
  //       // await pool.burn(minTick, maxTick, 0)

  //       // const { tokensOwed0, tokensOwed1 } = await pool.positions(getPositionKey(wallet.address, minTick, maxTick))

  //       // expect(tokensOwed0).to.be.eq(MaxUint128)
  //       // expect(tokensOwed1).to.be.eq(0)
  //     })

  //     it('works well after the cap binds', async () => {
  //       // await pool.setFeeGrowthGlobal0X128(constants.MaxUint256)
  //       // await pool.burn(minTick, maxTick, 0)

  //       // const { tokensOwed0, tokensOwed1 } = await pool.positions(getPositionKey(wallet.address, minTick, maxTick))

  //       // expect(tokensOwed0).to.be.eq(MaxUint128)
  //       // expect(tokensOwed1).to.be.eq(0)
  //     })
  //   })

  //   describe('works across overflow boundaries', () => {
  //     beforeEach(async () => {
  //       // await pool.setFeeGrowthGlobal0X128(constants.MaxUint256)
  //       // await pool.setFeeGrowthGlobal1X128(constants.MaxUint256)
  //       // await mint(wallet.address, minTick, maxTick, expandTo18Decimals(10))
  //     })

  //     it('token0', async () => {
  //       // await swapExact0For1(expandTo18Decimals(1), wallet.address)
  //       // await pool.burn(minTick, maxTick, 0)
  //       // const { amount0, amount1 } = await pool.callStatic.collect(
  //       //   wallet.address,
  //       //   minTick,
  //       //   maxTick,
  //       //   MaxUint128,
  //       //   MaxUint128
  //       // )
  //       // expect(amount0).to.be.eq('499999999999999')
  //       // expect(amount1).to.be.eq(0)
  //     })
  //     it('token1', async () => {
  //       // await swapExact1For0(expandTo18Decimals(1), wallet.address)
  //       // await pool.burn(minTick, maxTick, 0)
  //       // const { amount0, amount1 } = await pool.callStatic.collect(
  //       //   wallet.address,
  //       //   minTick,
  //       //   maxTick,
  //       //   MaxUint128,
  //       //   MaxUint128
  //       // )
  //       // expect(amount0).to.be.eq(0)
  //       // expect(amount1).to.be.eq('499999999999999')
  //     })
  //     it('token0 and token1', async () => {
  //       // await swapExact0For1(expandTo18Decimals(1), wallet.address)
  //       // await swapExact1For0(expandTo18Decimals(1), wallet.address)
  //       // await pool.burn(minTick, maxTick, 0)
  //       // const { amount0, amount1 } = await pool.callStatic.collect(
  //       //   wallet.address,
  //       //   minTick,
  //       //   maxTick,
  //       //   MaxUint128,
  //       //   MaxUint128
  //       // )
  //       // expect(amount0).to.be.eq('499999999999999')
  //       // expect(amount1).to.be.eq('500000000000000')
  //     })
  //   })
  // })
});
