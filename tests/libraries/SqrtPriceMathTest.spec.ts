import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { SqrtPriceMathTest } from '../../wrappers/tests/SqrtPriceMathTest';
import Decimal from 'decimal.js';
import { encodePriceSqrt, expandTo18Decimals, MaxUint128, MaxUint256 } from '../shared/utils';
import BigNumber from 'bignumber.js';

describe('SqrtPriceMathTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('SqrtPriceMathTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<SqrtPriceMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(SqrtPriceMathTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  describe('#getNextSqrtPriceFromInput', () => {
    it('fails if price is zero', async () => {
      await expect(contract.getNextSqrtPriceFromInput(0n, 0n, expandTo18Decimals(1) / 10n, false)).rejects.toThrow();
    });

    it('fails if liquidity is zero', async () => {
      await expect(contract.getNextSqrtPriceFromInput(1n, 0n, expandTo18Decimals(1) / 10n, true)).rejects.toThrow();
    });

    it('fails if input amount overflows the price', async () => {
      const price = BigInt(BigNumber(2).pow(160).minus(1).toString());
      const liquidity = 1024n;
      const amountIn = 1024n;
      await expect(contract.getNextSqrtPriceFromInput(price, liquidity, amountIn, false)).rejects.toThrow();
    });

    it('any input amount cannot underflow the price', async () => {
      const price = 1n;
      const liquidity = 1n;
      const amountIn = BigInt(BigNumber(2).pow(255).toString());
      expect(await contract.getNextSqrtPriceFromInput(price, liquidity, amountIn, true)).toBe(1n);
    });

    it('returns input price if amount in is zero and zeroForOne = true', async () => {
      const price = encodePriceSqrt(1n, 1n);
      expect(await contract.getNextSqrtPriceFromInput(price, expandTo18Decimals(1) / 10n, 0n, true)).toBe(price);
    });

    it('returns input price if amount in is zero and zeroForOne = false', async () => {
      const price = encodePriceSqrt(1n, 1n);
      expect(await contract.getNextSqrtPriceFromInput(price, expandTo18Decimals(1) / 10n, 0n, false)).toBe(price);
    });

    it('returns the minimum price for max inputs', async () => {
      const sqrtP = BigInt(BigNumber(2).pow(160).minus(1).toString());
      const liquidity = MaxUint128;
      const maxAmountNoOverflow = BigInt(
        BigNumber(MaxUint256.toString())
          .minus(BigNumber(((liquidity << 96n) / sqrtP).toString()))
          .toString(),
      );
      expect(await contract.getNextSqrtPriceFromInput(sqrtP, liquidity, maxAmountNoOverflow, true)).toBe(1n);
    });

    it('input amount of 0.1 token1', async () => {
      const sqrtQ = await contract.getNextSqrtPriceFromInput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1),
        expandTo18Decimals(1) / 10n,
        false,
      );
      expect(sqrtQ).toBe(87150978765690771352898345369n);
    });

    it('input amount of 0.1 token0', async () => {
      const sqrtQ = await contract.getNextSqrtPriceFromInput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1),
        expandTo18Decimals(1) / 10n,
        true,
      );
      expect(sqrtQ).toBe(72025602285694852357767227579n);
    });

    it('amountIn > type(uint96).max and zeroForOne = true', async () => {
      expect(
        await contract.getNextSqrtPriceFromInput(
          encodePriceSqrt(1n, 1n),
          expandTo18Decimals(10),
          BigInt(BigNumber(2).pow(100).toString()),
          true,
        ),
        // perfect answer:
        // https://www.wolframalpha.com/input/?i=624999999995069620+-+%28%281e19+*+1+%2F+%281e19+%2B+2%5E100+*+1%29%29+*+2%5E96%29
      ).toBe(624999999995069620n);
    });

    it('can return 1 with enough amountIn and zeroForOne = true', async () => {
      expect(await contract.getNextSqrtPriceFromInput(encodePriceSqrt(1n, 1n), 1n, MaxUint256 / 2n, true)).toBe(1n);
    });
  });

  describe('#getNextSqrtPriceFromOutput', () => {
    it('fails if price is zero', async () => {
      await expect(contract.getNextSqrtPriceFromOutput(0n, 0n, expandTo18Decimals(1) / 10n, false)).rejects.toThrow();
    });

    it('fails if liquidity is zero', async () => {
      await expect(contract.getNextSqrtPriceFromOutput(1n, 0n, expandTo18Decimals(1) / 10n, true)).rejects.toThrow();
    });

    it('fails if output amount is exactly the virtual reserves of token0', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 4n;
      await expect(contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).rejects.toThrow();
    });

    it('fails if output amount is greater than virtual reserves of token0', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 5n;
      await expect(contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).rejects.toThrow();
    });

    it('fails if output amount is greater than virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 262145n;
      await expect(contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true)).rejects.toThrow();
    });

    it('fails if output amount is exactly the virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 262144n;
      await expect(contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true)).rejects.toThrow();
    });

    it('succeeds if output amount is just less than the virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 262143n;
      const sqrtQ = await contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true);
      expect(sqrtQ).toBe(77371252455336267181195264n);
    });

    it('puzzling echidna test', async () => {
      const price = 20282409603651670423947251286016n;
      const liquidity = 1024n;
      const amountOut = 4n;

      await expect(contract.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).rejects.toThrow();
    });

    it('returns input price if amount in is zero and zeroForOne = true', async () => {
      const price = encodePriceSqrt(1n, 1n);
      expect(await contract.getNextSqrtPriceFromOutput(price, expandTo18Decimals(1) / 10n, 0n, true)).toBe(price);
    });

    it('returns input price if amount in is zero and zeroForOne = false', async () => {
      const price = encodePriceSqrt(1n, 1n);
      expect(await contract.getNextSqrtPriceFromOutput(price, expandTo18Decimals(1) / 10n, 0n, false)).toBe(price);
    });

    it('output amount of 0.1 token1', async () => {
      const sqrtQ = await contract.getNextSqrtPriceFromOutput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1),
        expandTo18Decimals(1) / 10n,
        false,
      );
      expect(sqrtQ).toBe(88031291682515930659493278152n);
    });

    it('output amount of 0.1 token1', async () => {
      const sqrtQ = await contract.getNextSqrtPriceFromOutput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1),
        expandTo18Decimals(1) / 10n,
        true,
      );
      expect(sqrtQ).toBe(71305346262837903834189555302n);
    });

    it('reverts if amountOut is impossible in zero for one direction', async () => {
      await expect(
        contract.getNextSqrtPriceFromOutput(encodePriceSqrt(1n, 1n), 1n, MaxUint256, true),
      ).rejects.toThrow();
    });

    it('reverts if amountOut is impossible in one for zero direction', async () => {
      await expect(
        contract.getNextSqrtPriceFromOutput(encodePriceSqrt(1n, 1n), 1n, MaxUint256, false),
      ).rejects.toThrow();
    });
  });

  describe('#getAmount0Delta', () => {
    it('returns 0 if liquidity is 0', async () => {
      const amount0 = await contract.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n, true);

      expect(amount0).toBe(0n);
    });
    it('returns 0 if prices are equal', async () => {
      const amount0 = await contract.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(1n, 1n), 0n, true);

      expect(amount0).toBe(0n);
    });

    it('returns 0.1 amount1 for price of 1 to 1.21', async () => {
      const amount0 = await contract.getAmount0Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1),
        true,
      );
      expect(amount0).toBe(90909090909090910n);

      const amount0RoundedDown = await contract.getAmount0Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1),
        false,
      );

      expect(amount0RoundedDown).toBe(amount0 - 1n);
    });

    it('works for prices that overflow', async () => {
      const amount0Up = await contract.getAmount0Delta(
        encodePriceSqrt(BigInt(BigNumber(2).pow(90).toString()), 1n),
        encodePriceSqrt(BigInt(BigNumber(2).pow(96).toString()), 1n),
        expandTo18Decimals(1),
        true,
      );
      const amount0Down = await contract.getAmount0Delta(
        encodePriceSqrt(BigInt(BigNumber(2).pow(90).toString()), 1n),
        encodePriceSqrt(BigInt(BigNumber(2).pow(96).toString()), 1n),
        expandTo18Decimals(1),
        false,
      );
      expect(amount0Up).toBe(amount0Down + 1n);
    });
  });

  describe('#getAmount1Delta', () => {
    it('returns 0 if liquidity is 0', async () => {
      const amount1 = await contract.getAmount1Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n, true);

      expect(amount1).toBe(0n);
    });
    it('returns 0 if prices are equal', async () => {
      const amount1 = await contract.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(1n, 1n), 0n, true);

      expect(amount1).toBe(0n);
    });

    it('returns 0.1 amount1 for price of 1 to 1.21', async () => {
      const amount1 = await contract.getAmount1Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1),
        true,
      );

      expect(amount1).toBe(100000000000000000n);
      const amount1RoundedDown = await contract.getAmount1Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1),
        false,
      );

      expect(amount1RoundedDown).toBe(amount1 - 1n);
    });
  });

  describe('swap computation', () => {
    it('sqrtP * sqrtQ overflows', async () => {
      // getNextSqrtPriceInvariants(1025574284609383690408304870162715216695788925244,50015962439936049619261659728067971248,406,true)
      const sqrtP = 1025574284609383690408304870162715216695788925244n;
      const liquidity = 50015962439936049619261659728067971248n;
      const zeroForOne = true;
      const amountIn = 406n;

      const sqrtQ = await contract.getNextSqrtPriceFromInput(sqrtP, liquidity, amountIn, zeroForOne);
      expect(sqrtQ).toBe(1025574284609383582644711336373707553698163132913n);

      const amount0Delta = await contract.getAmount0Delta(sqrtQ, sqrtP, liquidity, true);
      expect(amount0Delta).toBe(406n);
    });
  });
});
