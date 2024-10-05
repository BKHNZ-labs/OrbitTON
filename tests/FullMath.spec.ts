import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { FullMathTest } from '../wrappers/tests/FullMathTest';
import Decimal from 'decimal.js';
import { MaxUint256, Q128 } from './shared/utils';

describe('FullMath', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('FullMathTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<FullMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(FullMathTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  describe('#mulDiv', () => {
    it('reverts if denominator is 0', async () => {
      await expect(contract.getMulDiv(Q128, 5n, 0n)).rejects.toThrow();
    });
    it('reverts if denominator is 0 and numerator overflows', async () => {
      await expect(contract.getMulDiv(Q128, Q128, 0n)).rejects.toThrow();
    });
    it('reverts if output overflows uint256', async () => {
      await expect(contract.getMulDiv(Q128, Q128, 1n)).rejects.toThrow();
    });
    it('reverts if output overflows uint256', async () => {
      await expect(contract.getMulDiv(Q128, Q128, 1n)).rejects.toThrow();
    });
    it('reverts on overflow with all max inputs', async () => {
      await expect(contract.getMulDiv(MaxUint256, MaxUint256, MaxUint256 - 1n)).rejects.toThrow();
    });

    it('all max inputs', async () => {
      expect(await contract.getMulDiv(MaxUint256, MaxUint256, MaxUint256)).toBe(MaxUint256);
    });

    it('accurate without phantom overflow', async () => {
      const result = Q128 / 3n;
      expect(await contract.getMulDiv(Q128, (50n * Q128) / 100n, (150n * Q128) / 100n)).toBe(result);
    });

    it('accurate with phantom overflow', async () => {
      const result = (4375n * Q128) / 1000n;
      expect(await contract.getMulDiv(Q128, 35n * Q128, 8n * Q128)).toBe(result);
    });

    it('accurate with phantom overflow and repeating decimal', async () => {
      const result = (1n * Q128) / 3n;
      expect(await contract.getMulDiv(Q128, 1000n * Q128, 3000n * Q128)).toBe(result);
    });
  });

  describe('#mulDivRoundingUp', () => {
    it('reverts if denominator is 0', async () => {
      await expect(contract.getMulDivRoundingUp(Q128, 5n, 0n)).rejects.toThrow();
    });
    it('reverts if denominator is 0 and numerator overflows', async () => {
      await expect(contract.getMulDivRoundingUp(Q128, Q128, 0n)).rejects.toThrow();
    });
    it('reverts if output overflows uint256', async () => {
      await expect(contract.getMulDivRoundingUp(Q128, Q128, 1n)).rejects.toThrow();
    });
    it('reverts on overflow with all max inputs', async () => {
      await expect(contract.getMulDivRoundingUp(MaxUint256, MaxUint256, MaxUint256 - 1n)).rejects.toThrow();
    });

    it('reverts if mulDiv overflows 256 bits after rounding up', async () => {
      await expect(
        contract.getMulDivRoundingUp(
          535006138814359n,
          432862656469423142931042426214547535783388063929571229938474969n,
          2n,
        ),
      ).rejects.toThrow();
    });

    it('reverts if mulDiv overflows 256 bits after rounding up case 2', async () => {
      await expect(
        contract.getMulDivRoundingUp(
          115792089237316195423570985008687907853269984659341747863450311749907997002549n,
          115792089237316195423570985008687907853269984659341747863450311749907997002550n,
          115792089237316195423570985008687907853269984653042931687443039491902864365164n,
        ),
      ).rejects.toThrow();
    });

    it('all max inputs', async () => {
      expect(await contract.getMulDivRoundingUp(MaxUint256, MaxUint256, MaxUint256)).toBe(MaxUint256);
    });

    it('accurate without phantom overflow', async () => {
      const result = Q128 / 3n + 1n;
      expect(await contract.getMulDivRoundingUp(Q128, (50n * Q128) / 100n, (150n * Q128) / 100n)).toBe(result);
    });

    it('accurate with phantom overflow', async () => {
      const result = (4375n * Q128) / 1000n;
      expect(await contract.getMulDivRoundingUp(Q128, 35n * Q128, 8n * Q128)).toBe(result);
    });

    it('accurate with phantom overflow and repeating decimal', async () => {
      const result = (1n * Q128) / 3n + 1n;
      expect(await contract.getMulDivRoundingUp(Q128, 1000n * Q128, 3000n * Q128)).toBe(result);
    });
  });

  function pseudoRandomBigNumber() {
    const pad = new Decimal(10).pow(9);
    const randomDecimal = new Decimal(Math.random().toString());
    const result = (MaxUint256 * BigInt(pad.mul(randomDecimal).round().toString())) / BigInt(pad.toString());
    return result;
  }

  it('check a bunch of random inputs against JS implementation', async () => {
    // generates random inputs
    const tests = Array(1_000)
      .fill(null)
      .map(() => {
        return {
          x: pseudoRandomBigNumber(),
          y: pseudoRandomBigNumber(),
          d: pseudoRandomBigNumber(),
        };
      })
      .map(({ x, y, d }) => {
        return {
          input: {
            x,
            y,
            d,
          },
          floored: contract.getMulDiv(x, y, d),
          ceiled: contract.getMulDivRoundingUp(x, y, d),
        };
      });

    await Promise.all(
      tests.map(async ({ input: { x, y, d }, floored, ceiled }) => {
        if (d == 0n) {
          await expect(floored).rejects.toThrow();
          await expect(ceiled).rejects.toThrow();
          return;
        }

        if (x == 0n || y == 0n) {
          await expect(floored).toBe(0n);
          await expect(ceiled).toBe(0n);
        } else if ((x * y) / d > MaxUint256) {
          await expect(floored).rejects.toThrow();
          await expect(ceiled).rejects.toThrow();
        } else {
          expect(await floored).toBe((x * y) / d);
          expect(await ceiled).toBe((x * y) / d + ((x * y) % d > 0 ? 1n : 0n));
        }
      }),
    );
  });
});
