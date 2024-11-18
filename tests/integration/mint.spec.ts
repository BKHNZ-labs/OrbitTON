import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import {
  encodePriceSqrt,
  getMaxTick,
  getMinTick,
  MaxUint128,
  pseudoRandomBigNumberOnUint128,
  pseudoRandomBigNumberOnUint256,
} from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';
import { FeeAmount, TICK_SPACINGS } from '../libraries/TickTest.spec';
import BatchTickWrapper from '../../wrappers/core/BatchTick';
import { loadInfo } from '../../tlb/tick';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';

describe('Pool Test', () => {
  let poolCode: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;
  let batchTickCode: Cell;
  let positionCode: Cell;
  let routerCode: Cell;

  beforeAll(async () => {
    poolCode = await compile('Pool');
    lpAccountCode = await compile('LpAccount');
    tickMathCode = await compile('TickMathTest');
    batchTickCode = await compile('BatchTick');
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
        batchTickCode: batchTickCode,
        lpAccountCode: lpAccountCode,
        positionCode: positionCode,
        poolCode: poolCode,
      }),
    );
    tickMath = blockchain.openContract(TickMathTest.createFromData(tickMathCode, beginCell().endCell()));
    await tickMath.sendDeploy(deployer.getSender(), toNano('0.05'));
    const sqrtPrice = encodePriceSqrt(1n, 10n);
    const tick = await tickMath.getTickAtSqrtRatio(sqrtPrice);

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
        },
        {
          value: toNano('0.1'),
        },
      );
      //   let batchTickIndexLower = await pool.getBatchTickIndex(-240n);
      //   let batchTickLowerAddress = await pool.getBatchTickAddress(batchTickIndexLower);
      //   let bathTickLowerContract = blockchain.openContract(
      //     BatchTickWrapper.BatchTickTest.createFromAddress(batchTickLowerAddress),
      //   );
      //   let batchTickIndexUpper = await pool.getBatchTickIndex(0n);
      //   let batchTickUpperAddress = await pool.getBatchTickAddress(batchTickIndexUpper);
      //   let bathTickUpperContract = blockchain.openContract(
      //     BatchTickWrapper.BatchTickTest.createFromAddress(batchTickUpperAddress),
      //   );
      //   let sliceLower = await bathTickLowerContract.getTick(-240n);
      //   let { liquidity_gross: liquidity_gross_lower } = loadInfo(sliceLower.beginParse());
      //   let sliceUpper = await bathTickUpperContract.getTick(0n);
      //   let { liquidity_gross: liquidity_gross_upper } = loadInfo(sliceUpper.beginParse());
      //   expect(liquidity_gross_lower).toBe(100n);
      //   expect(liquidity_gross_upper).toBe(100n);
      //   expect(
      //     loadInfo((await bathTickLowerContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]))).beginParse())
      //       .liquidity_gross,
      //   ).toBe(0n);
      //   expect(
      //     loadInfo((await bathTickLowerContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]) * 2n)).beginParse())
      //       .liquidity_gross,
      //   ).toBe(0n);
      //   await pool.sendMint(router.getSender(), toNano(0.05), {
      //     kind: 'InMsgBody',
      //     query_id: 0,
      //     body: {
      //       kind: 'MintParams',
      //       jetton_amount_0: 9996n,
      //       jetton_amount_1: 0n,
      //       tick_lower: -240,
      //       tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM],
      //       liquidity_delta: 150n,
      //       recipient: deployer.address,
      //     },
      //   });
      //   await pool.sendMint(router.getSender(), toNano(1), {
      //     kind: 'InMsgBody',
      //     query_id: 0,
      //     body: {
      //       kind: 'MintParams',
      //       jetton_amount_0: 0n,
      //       jetton_amount_1: 2000n,
      //       tick_lower: -240,
      //       tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM],
      //       liquidity_delta: 150n,
      //       recipient: deployer.address,
      //     },
      //   });
      //   sliceLower = await bathTickLowerContract.getTick(-240n);
      //   ({ liquidity_gross: liquidity_gross_lower } = loadInfo(sliceLower.beginParse()));
      //   expect(liquidity_gross_lower).toBe(250n);
      //   expect(
      //     loadInfo((await bathTickUpperContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]))).beginParse())
      //       .liquidity_gross,
      //   ).toBe(150n);
      //   await pool.sendMint(router.getSender(), toNano(0.05), {
      //     kind: 'InMsgBody',
      //     query_id: 0,
      //     body: {
      //       kind: 'MintParams',
      //       jetton_amount_0: 9996n,
      //       jetton_amount_1: 0n,
      //       tick_lower: 0,
      //       tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM] * 2,
      //       liquidity_delta: 60n,
      //       recipient: deployer.address,
      //     },
      //   });
      //   await pool.sendMint(router.getSender(), toNano(1), {
      //     kind: 'InMsgBody',
      //     query_id: 0,
      //     body: {
      //       kind: 'MintParams',
      //       jetton_amount_0: 0n,
      //       jetton_amount_1: 2000n,
      //       tick_lower: 0,
      //       tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM] * 2,
      //       liquidity_delta: 60n,
      //       recipient: deployer.address,
      //     },
      //   });
      //   expect(
      //     loadInfo((await bathTickUpperContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]) * 2n)).beginParse())
      //       .liquidity_gross,
      //   ).toBe(60n);
      //   expect(loadInfo((await bathTickUpperContract.getTick(0n)).beginParse()).liquidity_gross).toBe(160n);
    });
  });
});
