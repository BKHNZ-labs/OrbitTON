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

describe('Pool Test', () => {
  let code: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;
  let batchTickCode: Cell;
  let positionCode: Cell;

  beforeAll(async () => {
    code = await compile('Pool');
    lpAccountCode = await compile('LpAccount');
    tickMathCode = await compile('TickMathTest');
    batchTickCode = await compile('BatchTick');
    positionCode = await compile('Position');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<TreasuryContract>;
  let pool: SandboxContract<PoolWrapper.PoolTest>;
  let tickMath: SandboxContract<TickMathTest>;
  const tickMin = getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  const tickMax = getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    router = await blockchain.treasury('router');
    tickMath = blockchain.openContract(TickMathTest.createFromData(tickMathCode, beginCell().endCell()));
    await tickMath.sendDeploy(deployer.getSender(), toNano('0.05'));
    const sqrtPrice = encodePriceSqrt(1n, 10n);
    const tick = await tickMath.getTickAtSqrtRatio(sqrtPrice);
    pool = blockchain.openContract(
      PoolWrapper.PoolTest.create(code, {
        batchTickCode,
        positionCode,
        lpAccountCode,
        routerAddress: router.address,
        fee: BigInt(FeeAmount.MEDIUM),
        jetton0Wallet: deployer.address,
        jetton1Wallet: deployer.address,
        protocolFee: 0n,
        sqrtPriceX96: sqrtPrice,
        maxLiquidity: 11505743598341114571880798222544994n,
        tick,
        tickSpacing: BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]),
      }),
    );
    const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: pool.address,
      deploy: true,
      success: true,
    });
  });

  it('should deploy successfully', async () => {
    console.log(pool.address);
  });

  describe('#mint', () => {
    it('should receive op::mint success', async () => {
      const result = await pool.sendMint(router.getSender(), toNano(0.05), {
        kind: 'InMsgBody',
        query_id: 0,
        body: {
          kind: 'MintParams',
          jetton_amount_0: 0n,
          jetton_amount_1: 1n,
          tick_lower: -10,
          tick_upper: 10,
          liquidity_delta: 1000n,
          recipient: deployer.address,
        },
      });
      const lpAddress = await pool.getLpAccountAddress(deployer.address, -10n, 10n);
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: pool.address,
        success: true,
      });
      expect(result.transactions).toHaveTransaction({
        from: pool.address,
        to: lpAddress,
        success: true,
      });
      // printTransactionFees(result.transactions);
    });

    it('should receive op::mint unauthorized', async () => {
      const result = await pool.sendMint(deployer.getSender(), toNano(0.05), {
        kind: 'InMsgBody',
        query_id: 0,
        body: {
          kind: 'MintParams',
          jetton_amount_0: 0n,
          jetton_amount_1: 1n,
          tick_lower: -10,
          tick_upper: 10,
          liquidity_delta: 1000n,
          recipient: deployer.address,
        },
      });

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: pool.address,
        op: 0xecad15c4,
        exitCode: 1000,
        success: false,
      });
    });

    it('initialize the pool at price of 10:1', async () => {
      const lpAccount = await pool.getLpAccountAddress(deployer.address, BigInt(tickMin), BigInt(tickMax));
      await pool.sendMint(router.getSender(), toNano(0.05), {
        kind: 'InMsgBody',
        query_id: 0,
        body: {
          kind: 'MintParams',
          jetton_amount_0: 9996n,
          jetton_amount_1: 0n,
          tick_lower: tickMin,
          tick_upper: tickMax,
          liquidity_delta: 3161n,
          recipient: deployer.address,
        },
      });
      const result = await pool.sendMint(router.getSender(), toNano(1), {
        kind: 'InMsgBody',
        query_id: 0,
        body: {
          kind: 'MintParams',
          jetton_amount_0: 0n,
          jetton_amount_1: 2000n,
          tick_lower: tickMin,
          tick_upper: tickMax,
          liquidity_delta: 3161n,
          recipient: deployer.address,
        },
      });
      printTransactionFees(result.transactions);
      expect(result.transactions).toHaveTransaction({
        from: lpAccount,
        to: pool.address,
      });
    });

    describe('failure cases', () => {
      it('fails if tickLower greater than tickUpper', async () => {
        await pool.sendMint(router.getSender(), toNano(0.05), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 9996n,
            jetton_amount_1: 0n,
            tick_lower: 1,
            tick_upper: 0,
            liquidity_delta: 1n,
            recipient: deployer.address,
          },
        });
        const result = await pool.sendMint(router.getSender(), toNano(1), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 0n,
            jetton_amount_1: 2000n,
            tick_lower: 1,
            tick_upper: 0,
            liquidity_delta: 1n,
            recipient: deployer.address,
          },
        });
        expect(result.transactions).toHaveTransaction({
          from: pool.address,
          op: 0xd2886eee,
          success: false,
          exitCode: 201,
        });
      });
    });

    describe('success cases', () => {
      it('adds liquidity to liquidityGross', async () => {
        await pool.sendMint(router.getSender(), toNano(0.05), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 9996n,
            jetton_amount_1: 0n,
            tick_lower: -240,
            tick_upper: 0,
            liquidity_delta: 100n,
            recipient: deployer.address,
          },
        });
        await pool.sendMint(router.getSender(), toNano(1), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 0n,
            jetton_amount_1: 2000n,
            tick_lower: -240,
            tick_upper: 0,
            liquidity_delta: 100n,
            recipient: deployer.address,
          },
        });
        let batchTickIndexLower = await pool.getBatchTickIndex(-240n);
        let batchTickLowerAddress = await pool.getBatchTickAddress(batchTickIndexLower);
        let bathTickLowerContract = blockchain.openContract(
          BatchTickWrapper.BatchTickTest.createFromAddress(batchTickLowerAddress),
        );
        let batchTickIndexUpper = await pool.getBatchTickIndex(0n);
        let batchTickUpperAddress = await pool.getBatchTickAddress(batchTickIndexUpper);
        let bathTickUpperContract = blockchain.openContract(
          BatchTickWrapper.BatchTickTest.createFromAddress(batchTickUpperAddress),
        );
        let sliceLower = await bathTickLowerContract.getTick(-240n);
        let { liquidity_gross: liquidity_gross_lower } = loadInfo(sliceLower.beginParse());
        let sliceUpper = await bathTickUpperContract.getTick(0n);
        let { liquidity_gross: liquidity_gross_upper } = loadInfo(sliceUpper.beginParse());

        expect(liquidity_gross_lower).toBe(100n);
        expect(liquidity_gross_upper).toBe(100n);
        expect(
          loadInfo((await bathTickLowerContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]))).beginParse())
            .liquidity_gross,
        ).toBe(0n);
        expect(
          loadInfo((await bathTickLowerContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]) * 2n)).beginParse())
            .liquidity_gross,
        ).toBe(0n);
        await pool.sendMint(router.getSender(), toNano(0.05), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 9996n,
            jetton_amount_1: 0n,
            tick_lower: -240,
            tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity_delta: 150n,
            recipient: deployer.address,
          },
        });
        await pool.sendMint(router.getSender(), toNano(1), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 0n,
            jetton_amount_1: 2000n,
            tick_lower: -240,
            tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM],
            liquidity_delta: 150n,
            recipient: deployer.address,
          },
        });

        sliceLower = await bathTickLowerContract.getTick(-240n);
        ({ liquidity_gross: liquidity_gross_lower } = loadInfo(sliceLower.beginParse()));
        expect(liquidity_gross_lower).toBe(250n);
        expect(
          loadInfo((await bathTickUpperContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]))).beginParse())
            .liquidity_gross,
        ).toBe(150n);

        await pool.sendMint(router.getSender(), toNano(0.05), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 9996n,
            jetton_amount_1: 0n,
            tick_lower: 0,
            tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM] * 2,
            liquidity_delta: 60n,
            recipient: deployer.address,
          },
        });
        await pool.sendMint(router.getSender(), toNano(1), {
          kind: 'InMsgBody',
          query_id: 0,
          body: {
            kind: 'MintParams',
            jetton_amount_0: 0n,
            jetton_amount_1: 2000n,
            tick_lower: 0,
            tick_upper: TICK_SPACINGS[FeeAmount.MEDIUM] * 2,
            liquidity_delta: 60n,
            recipient: deployer.address,
          },
        });
        expect(
          loadInfo((await bathTickUpperContract.getTick(BigInt(TICK_SPACINGS[FeeAmount.MEDIUM]) * 2n)).beginParse())
            .liquidity_gross,
        ).toBe(60n);
        expect(loadInfo((await bathTickUpperContract.getTick(0n)).beginParse()).liquidity_gross).toBe(160n);
      });
    });
  });
});
