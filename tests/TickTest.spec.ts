import {
  Blockchain,
  prettyLogTransaction,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { TickTest } from '../wrappers/tests/TickTest';
const maxUint256 = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');

export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};

describe('TickTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('TickTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let tickTest: SandboxContract<TickTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    tickTest = blockchain.openContract(
      TickTest.createFromData(
        code,
        beginCell()
          .storeDict(Dictionary.empty()) // empty dict
          .endCell(),
      ),
    );

    deployer = await blockchain.treasury('deployer');

    const deployResult = await tickTest.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tickTest.address,
      deploy: true,
      success: true,
    });
  });

  describe('#tickSpacingToMaxLiquidityPerTick', () => {
    it('returns the correct value for low fee', async () => {
      const maxLiquidityPerTick = await tickTest.getTickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.LOW]);
      expect(maxLiquidityPerTick).toBe(1917569901783203986719870431555990n); // 110.8 bits
    });
    it('returns the correct value for medium fee', async () => {
      const maxLiquidityPerTick = await tickTest.getTickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.MEDIUM]);
      expect(maxLiquidityPerTick).toBe(11505743598341114571880798222544994n);
    });

    it('returns the correct value for high fee', async () => {
      const maxLiquidityPerTick = await tickTest.getTickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.HIGH]);
      expect(maxLiquidityPerTick).toBe(38350317471085141830651933667504588n); // 114.7 bits
    });
    it('returns the correct value for entire range', async () => {
      const maxLiquidityPerTick = await tickTest.getTickSpacingToMaxLiquidityPerTick(887272);
      expect(maxLiquidityPerTick).toBe((2n ** 128n - 1n) / 3n); // 126 bits
    });
    it('returns the correct value for 2302', async () => {
      const maxLiquidityPerTick = await tickTest.getTickSpacingToMaxLiquidityPerTick(2302);
      expect(maxLiquidityPerTick).toBe(441351967472034323558203122479595605n); // 118 bits
    });
  });

  describe('#getFeeGrowthInside', () => {
    it('returns all for two uninitialized ticks if tick is inside', async () => {
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(15n);
      expect(feeGrowthInside1X128).toBe(15n);
    });
    it('returns 0 for two uninitialized ticks if tick is above', async () => {
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 4n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(0n);
      expect(feeGrowthInside1X128).toBe(0n);
    });
    it('returns 0 for two uninitialized ticks if tick is below', async () => {
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, -4n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(0n);
      expect(feeGrowthInside1X128).toBe(0n);
    });

    it('subtracts upper tick if below', async () => {
      const tx = await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        liquidity_gross: 0n,
        liquidity_net: 0n,
        fee_growth_outside_0_x128: 2n,
        fee_growth_outside_1_x128: 3n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      printTransactionFees(tx.transactions);
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(13n);
      expect(feeGrowthInside1X128).toBe(12n);
    });

    it('subtracts lower tick if above', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), -2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 2n,
        fee_growth_outside_1_x128: 3n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(13n);
      expect(feeGrowthInside1X128).toBe(12n);
    });

    it('subtracts upper and lower tick if inside', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), -2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 2n,
        fee_growth_outside_1_x128: 3n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 4n,
        fee_growth_outside_1_x128: 1n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(9n);
      expect(feeGrowthInside1X128).toBe(11n);
    });

    it('works correctly with overflow on inside tick', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), -2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: maxUint256 - BigInt(3),
        fee_growth_outside_1_x128: maxUint256 - BigInt(2),
        liquidity_gross: 0n,
        liquidity_net: 0n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 3n,
        fee_growth_outside_1_x128: 5n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
        tick_cumulative_outside: 0,
        initialized: true,
      });
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(16n);
      expect(feeGrowthInside1X128).toBe(13n);
    });
  });

  describe('#update', () => {
    it('flips from zero to nonzero', async () => {
      const result = await tickTest.sendSetUpdate(
        deployer.getSender(),
        toNano(0.05),
        0n,
        0n,
        1n,
        0n,
        0n,
        0n,
        false,
        3n,
      );
    });
  });
});
