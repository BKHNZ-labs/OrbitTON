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
import { TickTest } from '../../wrappers/tests/TickTest';
import { loadInfo } from '../../tlb/tick';
const maxUint256 = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');

export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

const MaxUint128 = 2n ** 128n - 1n;

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
        initialized: true,
      });
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 4n,
        fee_growth_outside_1_x128: 1n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
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
        initialized: true,
      });
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 3n,
        fee_growth_outside_1_x128: 5n,
        liquidity_gross: 0n,
        liquidity_net: 0n,
        initialized: true,
      });
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2n, 2n, 0n, 15n, 15n);
      expect(feeGrowthInside0X128).toBe(16n);
      expect(feeGrowthInside1X128).toBe(13n);
    });
  });

  describe('#update', () => {
    it('flips from zero to nonzero', async () => {
      const tx = await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 3n);
      printTransactionFees(tx.transactions);
      expect(tx.externals[0].body.beginParse().loadBoolean());
      await tickTest.sendClearTick(deployer.getSender(), toNano(0.05), 0n);
    });
    it('does not flip from nonzero to greater nonzero', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 3n);
      const tx = await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 3n);
      expect(tx.externals[0].body.beginParse().loadBoolean()).toBeFalsy();
      await tickTest.sendClearTick(deployer.getSender(), toNano(0.05), 0n);
    });
    it('flips from nonzero to zero', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 3n);
      const tx = await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, -1n, 0n, 0n, false, 3n);
      expect(tx.externals[0].body.beginParse().loadBoolean());
      await tickTest.sendClearTick(deployer.getSender(), toNano(0.05), 0n);
    });
    it('does not flip from nonzero to lesser nonzero', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 2n, 0n, 0n, false, 3n);
      const tx = await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, -1n, 0n, 0n, false, 3n);
      expect(tx.externals[0].body.beginParse().loadBoolean()).toBeFalsy();
      await tickTest.sendClearTick(deployer.getSender(), toNano(0.05), 0n);
    });
    it('reverts if total liquidity gross is greater than max', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 2n, 0n, 0n, false, 3n);
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, true, 3n);
      const tx = await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 3n);
      expect(tx.transactions).toHaveTransaction({
        exitCode: 0x3000,
      });
      await tickTest.sendClearTick(deployer.getSender(), toNano(0.05), 0n);
    });
    it('nets the liquidity based on upper flag', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 2n, 0n, 0n, false, 10n);
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, true, 10n);
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 3n, 0n, 0n, true, 10n);
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 0n, 0n, 1n, 0n, 0n, false, 10n);
      const slice = await tickTest.getTick(0n);
      const { liquidity_gross, liquidity_net } = loadInfo(slice.beginParse());
      expect(liquidity_gross).toEqual(BigInt(2 + 1 + 3 + 1));
      expect(liquidity_net).toEqual(BigInt(2 - 1 - 3 + 1));
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 0n);
    });
    it('reverts on overflow liquidity gross', async () => {
      await tickTest.sendSetUpdate(
        deployer.getSender(),
        toNano(0.05),
        0n,
        0n,
        MaxUint128 / 2n - 1n,
        0n,
        0n,
        false,
        MaxUint128,
      );
      const tx = await tickTest.sendSetUpdate(
        deployer.getSender(),
        toNano(0.05),
        0n,
        0n,
        MaxUint128 / 2n - 1n,
        0n,
        0n,
        false,
        MaxUint128,
      );
      expect(tx.transactions).toHaveTransaction({
        exitCode: 5,
      });
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 0n);
    });

    it('assumes all growth happens below ticks lte current tick', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 1n, 1n, 1n, 1n, 2n, false, MaxUint128);
      const slice = await tickTest.getTick(1n);
      const { fee_growth_outside_0_x128, fee_growth_outside_1_x128, initialized } = loadInfo(slice.beginParse());
      expect(fee_growth_outside_0_x128).toEqual(1n);
      expect(fee_growth_outside_1_x128).toEqual(2n);
      expect(initialized).toEqual(true);

      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 1n);
    });
    it('does not set any growth fields if tick is already initialized', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 1n, 1n, 1n, 1n, 2n, false, MaxUint128);
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 1n, 1n, 1n, 6n, 7n, false, MaxUint128);
      const slice = await tickTest.getTick(1n);
      const { fee_growth_outside_0_x128, fee_growth_outside_1_x128, initialized } = loadInfo(slice.beginParse());
      expect(fee_growth_outside_0_x128).toEqual(1n);
      expect(fee_growth_outside_1_x128).toEqual(2n);
      expect(initialized).toEqual(true);
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 1n);
    });

    it('does not set any growth fields for ticks gt current tick', async () => {
      await tickTest.sendSetUpdate(deployer.getSender(), toNano(0.05), 2n, 1n, 1n, 1n, 2n, false, MaxUint128);
      const slice = await tickTest.getTick(2n);
      const { fee_growth_outside_0_x128, fee_growth_outside_1_x128, initialized } = loadInfo(slice.beginParse());
      expect(fee_growth_outside_0_x128).toEqual(0n);
      expect(fee_growth_outside_1_x128).toEqual(0n);
      expect(initialized).toEqual(true);
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 2n);
    });
  });

  describe('#clear', () => {
    it('deletes all the data in the tick', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 1n,
        fee_growth_outside_1_x128: 2n,
        liquidity_gross: 3n,
        liquidity_net: 4n,
        initialized: true,
      });
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 2n);
      const slice = await tickTest.getTick(2n);
      const { liquidity_gross, liquidity_net, fee_growth_outside_0_x128, fee_growth_outside_1_x128, initialized } =
        loadInfo(slice.beginParse());

      expect(fee_growth_outside_0_x128).toEqual(0n);
      expect(fee_growth_outside_1_x128).toEqual(0n);
      expect(liquidity_gross).toEqual(0n);
      expect(liquidity_net).toEqual(0n);
      expect(initialized).toEqual(false);
    });
  });
  describe('#cross', () => {
    it('flips the growth variables', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 1n,
        fee_growth_outside_1_x128: 2n,
        liquidity_gross: 3n,
        liquidity_net: 4n,
        initialized: true,
      });
      await tickTest.sendCross(deployer.getSender(), toNano('0.05'), 2n, 7n, 9n);
      const slice = await tickTest.getTick(2n);
      const { fee_growth_outside_0_x128, fee_growth_outside_1_x128 } = loadInfo(slice.beginParse());

      expect(fee_growth_outside_0_x128).toEqual(6n);
      expect(fee_growth_outside_1_x128).toEqual(7n);
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 2n);
    });
    it('two flips are no op', async () => {
      await tickTest.sendSetTick(deployer.getSender(), toNano('0.05'), 2n, {
        kind: 'Info',
        fee_growth_outside_0_x128: 1n,
        fee_growth_outside_1_x128: 2n,
        liquidity_gross: 3n,
        liquidity_net: 4n,
        initialized: true,
      });
      await tickTest.sendCross(deployer.getSender(), toNano('0.05'), 2n, 7n, 9n);
      await tickTest.sendCross(deployer.getSender(), toNano('0.05'), 2n, 7n, 9n);
      const slice = await tickTest.getTick(2n);
      const { fee_growth_outside_0_x128, fee_growth_outside_1_x128 } = loadInfo(slice.beginParse());
      expect(fee_growth_outside_0_x128).toEqual(1n);
      expect(fee_growth_outside_1_x128).toEqual(2n);
      await tickTest.sendClearTick(deployer.getSender(), toNano('0.05'), 2n);
    });
  });
});
