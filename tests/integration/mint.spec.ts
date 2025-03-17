import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import { encodePriceSqrt, getMaxTick, getMinTick } from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';
import { FeeAmount, TICK_SPACINGS } from '../libraries/TickTest.spec';
import { loadInfo } from '../../tlb/tick';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';

describe('Pool Test', () => {
  let poolCode: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;
  let positionCode: Cell;
  let routerCode: Cell;

  beforeAll(async () => {
    poolCode = await compile('Pool');
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
        jettonAmount: toNano(1000000),
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
        jettonAmount: toNano(1000000),
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
    it('Jettons pool', async () => {
      const routerJetton0Wallet = await token0MasterContract.getWalletAddress(router.address);
      console.log('Router wallet address', routerJetton0Wallet.toString());
      const routerJetton1Wallet = await token1MasterContract.getWalletAddress(router.address);
      console.log('Router wallet address', routerJetton1Wallet.toString());
      const createPool = await router.sendCreatePool(
        deployer.getSender(),
        {
          kind: 'OpCreatePool',
          query_id: 0,
          jetton0_wallet: routerJetton0Wallet,
          jetton1_wallet: routerJetton1Wallet,
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
      const pool = await router.getPoolAddress(routerJetton0Wallet, routerJetton1Wallet, 3000n, 60n);
      const poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(pool));
      const lpAccount = await poolContract.getLpAccountAddress(deployer.address, BigInt(tickMin), BigInt(tickMax));
      const position0Address = await poolContract.getPositionAddress(
        BigInt(tickMin),
        BigInt(tickMax),
        deployer.address,
      );

      expect(createPool.transactions).toHaveTransaction({
        from: router.address,
        to: pool,
        success: true,
      });

      // Create position
      let transfer0;
      let transfer1;
      if (
        BigInt(`0x${beginCell().storeAddress(routerJetton0Wallet).endCell().hash().toString('hex')}`) <
        BigInt(`0x${beginCell().storeAddress(routerJetton1Wallet).endCell().hash().toString('hex')}`)
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
              jetton1_wallet: routerJetton1Wallet,
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
              jetton1_wallet: routerJetton0Wallet,
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
              jetton1_wallet: routerJetton0Wallet,
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
              jetton1_wallet: routerJetton1Wallet,
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
      const { fee, liquidity, sqrtPriceX96 } = await poolContract.getPoolInfo();

      expect(liquidity).toEqual(3161n);
      expect(fee).toEqual(3000n);
      expect(sqrtPriceX96).toEqual(encodePriceSqrt(1n, 10n));

      expect(transfer0.transactions).toHaveTransaction({
        from: pool,
        to: lpAccount,
        success: true,
      });
      expect(transfer1.transactions).toHaveTransaction({
        from: pool,
        to: lpAccount,
        success: true,
      });
      expect(transfer1.transactions).toHaveTransaction({
        from: lpAccount,
        to: pool,
        success: true,
      });
      expect(transfer1.transactions).toHaveTransaction({
        from: pool,
        to: position0Address,
        success: true,
      });
      // printTransactionFees(transfer1.transactions);
    });
  });
});
