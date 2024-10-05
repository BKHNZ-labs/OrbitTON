import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { TickMathTest } from '../wrappers/tests/TickMathTest';
import { encodePriceSqrt } from './shared/utils';
import Decimal from 'decimal.js';

const MIN_TICK = -887272n;
const MAX_TICK = 887272n;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
Decimal.config({ toExpNeg: -500, toExpPos: 500 });

describe('TickMathTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('TickMathTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let tickMath: SandboxContract<TickMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    tickMath = blockchain.openContract(TickMathTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await tickMath.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: tickMath.address,
      deploy: true,
      success: true,
    });
  });

  describe('#getSqrtRatioAtTick', () => {
    it('throws for too low', async () => {
      expect(tickMath.getSqrtRatioAtTick(MIN_TICK - 1n)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x1000).toString(10)}`,
      );
    });

    it('throws for too low', async () => {
      expect(tickMath.getSqrtRatioAtTick(MAX_TICK + 1n)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x1000).toString(10)}`,
      );
    });

    it('min tick', async () => {
      expect(tickMath.getSqrtRatioAtTick(MIN_TICK)).resolves.toBe(4295128739n);
    });

    it('min tick +1', async () => {
      expect(tickMath.getSqrtRatioAtTick(MIN_TICK + 1n)).resolves.toBe(4295343490n);
    });

    it('max tick - 1', async () => {
      expect(tickMath.getSqrtRatioAtTick(MAX_TICK - 1n)).resolves.toBe(
        1461373636630004318706518188784493106690254656249n,
      );
    });
    it('min tick ratio is less than js implementation', async () => {
      expect(tickMath.getSqrtRatioAtTick(MIN_TICK)).resolves.toBeLessThan(encodePriceSqrt(1n, 2n ** 127n));
    });

    it('max tick ratio is greater than js implementation', async () => {
      expect(tickMath.getSqrtRatioAtTick(MAX_TICK)).resolves.toBeGreaterThan(encodePriceSqrt(2n ** 127n, 1n));
    });

    it('max tick', async () => {
      expect(tickMath.getSqrtRatioAtTick(MAX_TICK)).resolves.toBe(1461446703485210103287273052203988822378723970342n);
    });

    for (const absTick of [
      50, 100, 250, 500, 1_000, 2_500, 3_000, 4_000, 5_000, 50_000, 150_000, 250_000, 500_000, 738_203,
    ]) {
      for (const tick of [-absTick, absTick]) {
        describe(`tick ${tick}`, () => {
          it('is at most off by 1/100th of a bips', async () => {
            const jsResult = new Decimal(1.0001).pow(tick).sqrt().mul(new Decimal(2).pow(96));
            const result = await tickMath.getSqrtRatioAtTick(BigInt(tick));
            const absDiff = new Decimal(result.toString()).sub(jsResult).abs();
            expect(absDiff.div(jsResult).toNumber()).toBeLessThan(0.000001);
          });
        });
      }
    }
  });

  describe('#getTickAtSqrtRatio', () => {
    it('throws for too low', async () => {
      expect(tickMath.getTickAtSqrtRatio(MIN_SQRT_RATIO - 1n)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x1001).toString(10)}`,
      );
    });

    it('throws for too high', async () => {
      await expect(tickMath.getTickAtSqrtRatio(MAX_SQRT_RATIO)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x1001).toString(10)}`,
      );
    });

    it('ratio of min tick', async () => {
      expect(tickMath.getTickAtSqrtRatio(MIN_SQRT_RATIO)).resolves.toBe(MIN_TICK);
    });
    it('ratio of min tick + 1', async () => {
      expect(tickMath.getTickAtSqrtRatio(4295343490n)).resolves.toBe(MIN_TICK + 1n);
    });
    it('ratio of max tick - 1', async () => {
      expect(tickMath.getTickAtSqrtRatio(1461373636630004318706518188784493106690254656249n)).resolves.toBe(
        MAX_TICK - 1n,
      );
    });
    it('ratio closest to max tick', async () => {
      expect(tickMath.getTickAtSqrtRatio(MAX_SQRT_RATIO - 1n)).resolves.toBe(MAX_TICK - 1n);
    });
    for (const ratio of [
      MIN_SQRT_RATIO,
      encodePriceSqrt(BigInt(10 ** 12), 1n),
      encodePriceSqrt(BigInt(10 ** 6), 1n),
      encodePriceSqrt(1n, 64n),
      encodePriceSqrt(1n, 8n),
      encodePriceSqrt(1n, 2n),
      encodePriceSqrt(1n, 1n),
      encodePriceSqrt(2n, 1n),
      encodePriceSqrt(8n, 1n),
      encodePriceSqrt(64n, 1n),
      encodePriceSqrt(1n, BigInt(10 ** 6)),
      encodePriceSqrt(1n, BigInt(10 ** 12)),
      MAX_SQRT_RATIO - 1n,
    ]) {
      describe(`ratio ${ratio}`, () => {
        it('is at most off by 1', async () => {
          const jsResult = new Decimal(ratio.toString()).div(new Decimal(2).pow(96)).pow(2).log(1.0001).floor();
          const result = await tickMath.getTickAtSqrtRatio(ratio);
          const absDiff = new Decimal(result.toString()).sub(jsResult).abs();
          expect(absDiff.toNumber()).toBeLessThanOrEqual(1);
        });
        it('ratio is between the tick and tick+1', async () => {
          const tick = await tickMath.getTickAtSqrtRatio(ratio);
          const ratioOfTick = await tickMath.getSqrtRatioAtTick(tick);
          const ratioOfTickPlusOne = await tickMath.getSqrtRatioAtTick(tick + 1n);
          expect(ratio).toBeGreaterThanOrEqual(ratioOfTick);
          expect(ratio).toBeLessThan(ratioOfTickPlusOne);
        });
      });
    }
  });
});
