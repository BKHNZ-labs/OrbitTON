import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, Slice, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import { encodePriceSqrt, expandTo18Decimals, getMaxTick, getMinTick, MAX_SQRT_RATIO, MIN_SQRT_RATIO } from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';
import { FeeAmount, TICK_SPACINGS } from '../libraries/TickTest.spec';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';
import PositionWrapper from '../../wrappers/core/Position';
import { PTonWalletWrapper } from '../../wrappers/core/PTonWallet';
import PTonMinterWrapper from '../../wrappers/core/PTonMinter';
import { PTON_WALLET_BOC } from '../../wrappers/helpers';
import { MintParams, storeMintParams, storeSwapParams, SwapParams } from '../../tlb/jetton/transfer';

describe('pTON Pool Test', () => {
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
  let pTONMasterContract: SandboxContract<PTonMinterWrapper.PTonMinterV2>;
  let token0MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let tonWalletContract: SandboxContract<TreasuryContract>;
  let pool: SandboxContract<PoolWrapper.PoolTest>;
  let tickMath: SandboxContract<TickMathTest>;
  const tickMin = getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  const tickMax = getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  let tickSpacing = TICK_SPACINGS[FeeAmount.MEDIUM];
  let poolContract: SandboxContract<PoolWrapper.PoolTest>;
  let routerPTONWalletContract: SandboxContract<PTonWalletWrapper.PTonWalletV2>;
  let isPTonIsZero: boolean;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer', {
      balance: expandTo18Decimals(50),
    });
    tonWalletContract = await blockchain.treasury('ton_holder');
    
    // Deploy router contract
    router = blockchain.openContract(
      RouterWrapper.RouterTest.create(routerCode, {
        adminAddress: deployer.address,
        lpAccountCode: lpAccountCode,
        positionCode: positionCode,
        poolCode: poolCode,
      }),
    );
    let deployResult = await router.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      deploy: true,
      success: true,
    });

    // Deploy pTON (ProxyTon) - This is a special jetton that acts as a wrapper for native TON
    pTONMasterContract = blockchain.openContract(
      PTonMinterWrapper.PTonMinterV2.createPtonMinterFromConfig({
        walletCode: Cell.fromBoc(Buffer.from(PTON_WALLET_BOC, 'hex'))[0],
        content: beginCell().endCell(),
        id: 0
      }),
    );

    await pTONMasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    // deploy router pTON wallet
    await pTONMasterContract.sendDeployWallet(deployer.getSender(), {
      value: toNano('0.05'),
      ownerAddress: router.address,
    });
    const routerPTONWallet = await pTONMasterContract.getWalletAddress(router.address);
    routerPTONWalletContract = blockchain.openContract(PTonWalletWrapper.PTonWalletV2.createFromAddress(routerPTONWallet));

    // deploy token0 master contract
    token0MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token0')).endCell(),
      }),
    );
    deployResult = await token0MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token0MasterContract.address,
      deploy: true,
      success: true,
    });
    token0WalletContract = blockchain.openContract(JettonWalletWrapper.JettonWallet.createFromAddress(await token0MasterContract.getWalletAddress(deployer.address)));
    // Fund the deployer's TON wallet
    await tonWalletContract.send({
      to: deployer.address,
      value: expandTo18Decimals(50),
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

  });

  it('should deploy successfully', async () => {
    console.log('Router address:', router.address);
    console.log('pTON master contract address:', pTONMasterContract.address);
  });

  describe('#mint', () => {
    let routerJetton0WalletAddress: Address;
    let routerJetton1WalletAddress: Address;
    let poolAddress: Address;

    beforeEach(async () => {
      // support token0 and token1
      routerJetton0WalletAddress = await token0MasterContract.getWalletAddress(router.address);
      routerJetton1WalletAddress = await pTONMasterContract.getWalletAddress(router.address);
      isPTonIsZero = BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) >
      BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
    });

    describe('after initialization', () => {
      beforeEach(async() => {
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
              jetton1_master: pTONMasterContract.address,
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
          !isPTonIsZero
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
          const mintParams:MintParams = {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerJetton0WalletAddress,
                tick_lower: tickMin,
                tick_upper: tickMax,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 3161n,
          };
          let cell1 = beginCell();
          storeMintParams(mintParams)(cell1);
          transfer1 = await routerPTONWalletContract.sendTonTransfer(
            deployer.getSender(),
            {
              tonAmount: 2000n,
              refundAddress: deployer.address,
              fwdPayload: cell1.endCell(),
              gas: toNano(1),
            },
          );
          
        } else {
          const mintParams:MintParams = {
            kind: 'MintParams',
            forward_opcode: PoolWrapper.Opcodes.Mint,
            jetton1_wallet: routerJetton0WalletAddress,
            tick_lower: tickMin,
            tick_upper: tickMax,
            tick_spacing: 60,
            fee: 3000,
            liquidity_delta: 3161n,
      };
          let cell1 = beginCell();
          storeMintParams(mintParams)(cell1);
          transfer0 = await routerPTONWalletContract.sendTonTransfer(
            deployer.getSender(),
            {
              tonAmount: 10000n,
              refundAddress: deployer.address,
              fwdPayload: cell1.endCell(),
              gas: toNano(1),
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
      describe('success cases', ()=>{
        it('initial balances', async()=>{
          const pRouterTonBalance = await routerPTONWalletContract.getBalance();
          const routerJettonContract = blockchain.openContract(JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0WalletAddress));
       
          if(isPTonIsZero){
            expect(pRouterTonBalance.amount).toEqual(9996n);
            expect((await routerJettonContract.getBalance()).amount).toEqual(1000n);
          } else {
            expect((await routerJettonContract.getBalance()).amount).toEqual(9996n);
            expect(pRouterTonBalance.amount).toEqual(1000n);
          }
        });

        it('initial tick', async()=>{
          const  {tick} = await poolContract.getPoolInfo();
          expect(tick).toEqual(-23028n);
        })
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
      routerJetton1WalletAddress = await pTONMasterContract.getWalletAddress(router.address);
      isPTonIsZero = BigInt(`0x${beginCell().storeAddress(routerJetton0WalletAddress).endCell().hash().toString('hex')}`) >
      BigInt(`0x${beginCell().storeAddress(routerJetton1WalletAddress).endCell().hash().toString('hex')}`)
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
            jetton1_master: pTONMasterContract.address,
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
        !isPTonIsZero
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

        const mintParams:MintParams = {
          kind: 'MintParams',
          forward_opcode: PoolWrapper.Opcodes.Mint,
          jetton1_wallet: routerJetton0WalletAddress,
          tick_lower: tickMin,
          tick_upper: tickMax,
          fee: 3000,
          tick_spacing: 60,
          liquidity_delta: expandTo18Decimals(2)
        };

        let cell1 = beginCell();
        storeMintParams(mintParams)(cell1);

        transfer1 = await routerPTONWalletContract.sendTonTransfer(
          deployer.getSender(),
          {
            tonAmount: expandTo18Decimals(5),
            refundAddress: deployer.address,
            fwdPayload: cell1.endCell(),
            gas: toNano(1),
          },
        );
         
      } else {
        const mintParams:MintParams = {
          kind: 'MintParams',
          forward_opcode: PoolWrapper.Opcodes.Mint,
          jetton1_wallet: routerJetton0WalletAddress,
          tick_lower: tickMin,
          tick_upper: tickMax,
          fee: 3000,
          tick_spacing: 60,
          liquidity_delta: expandTo18Decimals(2)
        };
        let cell1 = beginCell();
        storeMintParams(mintParams)(cell1);
        transfer0 = await routerPTONWalletContract.sendTonTransfer(
          deployer.getSender(),
          {
            tonAmount: expandTo18Decimals(5),
            refundAddress: deployer.address,
            fwdPayload: cell1.endCell(),
            gas: toNano(1),
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
      }
      poolAddress = await router.getPoolAddress(routerJetton0WalletAddress, routerJetton1WalletAddress, 3000n, 60n);
      poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(poolAddress));
    });

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
            jetton1_wallet: routerPTONWalletContract.address,
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
      const mintParams:MintParams = {
        kind: 'MintParams',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerJetton0WalletAddress,
        tick_lower: tickMin,
        tick_upper: tickMax,
        fee: 3000,
        tick_spacing: 60,
        liquidity_delta: expandTo18Decimals(1)
      };
      let cell1 = beginCell();
      storeMintParams(mintParams)(cell1);

      const sendTonPosition = await routerPTONWalletContract.sendTonTransfer(
        deployer.getSender(),
        {
          tonAmount: expandTo18Decimals(5),
          refundAddress: deployer.address,
          fwdPayload: cell1.endCell(),
          gas: toNano(1),
        },
      );
   
      // await swapExactJettonForTon(expandTo18Decimals(1), wallet.address)
      const jettonToTonSwap = await token0WalletContract.sendTransferSwap(
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
            jetton1_wallet: routerPTONWalletContract.address,
            //eslint-di
            sqrt_price_limit: isPTonIsZero ? MAX_SQRT_RATIO - 1n  : MIN_SQRT_RATIO + 1n,
            tick_spacing: 60,
            zero_for_one: isPTonIsZero ? 0 : -1,
          },
        },
        {
          value: toNano(2.5),
        },
      );
      printTransactionFees(jettonToTonSwap.transactions);
      // await swapExactTonForJetton(expandTo18Decimals(1), wallet.address)
      const swapParams:SwapParams =  {
        kind: 'SwapParams',
        forward_opcode: PoolWrapper.Opcodes.Swap,
        jetton1_wallet: routerJetton0WalletAddress,
        fee: 3000,
        tick_spacing: 60,
        zero_for_one: isPTonIsZero ? -1 : 0,
        sqrt_price_limit: isPTonIsZero ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n
      }

      let cell2 = beginCell();
      storeSwapParams(swapParams)(cell2);

      const tonToJettonSwap = await routerPTONWalletContract.sendTonTransfer(
        deployer.getSender(),
        {
          tonAmount: expandTo18Decimals(1),
          refundAddress: deployer.address,
          fwdPayload: cell2.endCell(),
          gas: toNano(1),
        },
      );
      console.log("tonToJettonSwap.transactions")
      printTransactionFees(tonToJettonSwap.transactions);
      // await pool.connect(other).burn(minTick, maxTick, expandTo18Decimals(1))
      const positionAddress = await poolContract.getPositionAddress(BigInt(tickMin), BigInt(tickMax), deployer.address);
      const positionContract = blockchain.openContract(PositionWrapper.Position.createFromAddress(positionAddress));
      await positionContract.sendBurnPosition(
        deployer.getSender(),
        toNano(1),
        expandTo18Decimals(1)
      );
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

  });

}); 