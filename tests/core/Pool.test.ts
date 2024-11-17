import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import {
  encodePriceSqrt,
  MaxUint128,
  pseudoRandomBigNumberOnUint128,
  pseudoRandomBigNumberOnUint256,
} from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';

describe('Pool Test', () => {
  let code: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;

  beforeAll(async () => {
    code = await compile('Pool');
    lpAccountCode = await compile('LpAccount');
    tickMathCode = await compile('TickMathTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<TreasuryContract>;
  let pool: SandboxContract<PoolWrapper.PoolTest>;
  let tickMath: SandboxContract<TickMathTest>;

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
        batchTickCode: beginCell().endCell(),
        positionCode: beginCell().endCell(),
        lpAccountCode,
        routerAddress: router.address,
        fee: 3000n,
        jetton0Wallet: deployer.address,
        jetton1Wallet: deployer.address,
        protocolFee: 0n,
        sqrtPriceX96: sqrtPrice,
        tick,
        tickSpacing: 300n,
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
      await pool.sendMint(router.getSender(), toNano(0.05), {
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
    });
  });
});
