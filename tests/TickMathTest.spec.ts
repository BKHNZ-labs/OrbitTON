import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { TickMathTest } from '../wrappers/tests/TickMathTest';
import { encodePriceSqrt } from './shared/utils';
import Decimal from 'decimal.js';

const MIN_TICK = -887272n;
const MAX_TICK = 887272n;
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
