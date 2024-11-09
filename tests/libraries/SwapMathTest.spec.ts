import { compile } from '@ton/blueprint';
import { beginCell, Cell, toNano } from '@ton/core';
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { SwapMathTest } from '../../wrappers/tests/SwapMathTest';
import { encodePriceSqrt, expandTo18Decimals } from '../shared/utils';
import { SqrtPriceMathTest } from '../../wrappers/tests/SqrtPriceMathTest';

const Q128 = BigInt(2) ** BigInt(128);
describe('SwapMath', () => {
  let swapMathCode: Cell;
  let sqrtPriceMathCode: Cell;
  let assertExitCode: (txs: BlockchainTransaction[], exit_code: number) => void;

  beforeAll(async () => {
    swapMathCode = await compile('SwapMathTest');
    sqrtPriceMathCode = await compile('SqrtPriceMathTest');

    assertExitCode = (txs, exit_code) => {
      expect(txs).toHaveTransaction({
        exitCode: exit_code,
        aborted: exit_code != 0,
        success: exit_code == 0,
      });
    };
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let swapMath: SandboxContract<SwapMathTest>;
  let sqrtPriceMath: SandboxContract<SqrtPriceMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    swapMath = blockchain.openContract(SwapMathTest.createFromData(swapMathCode, beginCell().endCell()));
    sqrtPriceMath = blockchain.openContract(SqrtPriceMathTest.createFromData(sqrtPriceMathCode, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const swapMathDeployResult = await swapMath.sendDeploy(deployer.getSender(), toNano('0.05'));
    const sqrtPriceDeployResult = await sqrtPriceMath.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(swapMathDeployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: swapMath.address,
      deploy: true,
      success: true,
    });
    expect(sqrtPriceDeployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: sqrtPriceMath.address,
      deploy: true,
      success: true,
    });
  });

  describe('#computeSwapStep', () => {
    it('exact amount in that gets capped at price target in one for zero', async () => {
      const price = encodePriceSqrt(1n, 1n);
      const priceTarget = encodePriceSqrt(101n, 100n);
      const liquidity = expandTo18Decimals(2);
      const amount = expandTo18Decimals(1);
      const fee = 600n;
      const zeroForOne = false;

      const result = await swapMath.getComputeSwapStep(price, priceTarget, liquidity, amount, fee);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());

      expect(amountIn).toEqual(9975124224178055n);
      expect(feeAmount).toEqual(5988667735148n);
      expect(amountOut).toEqual(9925619580021728n);
      expect(amountIn + feeAmount).toBeLessThan(amount);

      const priceAfterWholeInputAmount = await sqrtPriceMath.getNextSqrtPriceFromInput(
        price,
        liquidity,
        amount,
        zeroForOne,
      );

      expect(sqrtQ).toEqual(priceTarget);
      expect(sqrtQ).toBeLessThan(priceAfterWholeInputAmount);
    });

    it('exact amount out that gets capped at price target in one for zero', async () => {
      const price = encodePriceSqrt(1n, 1n);
      const priceTarget = encodePriceSqrt(101n, 100n);
      const liquidity = expandTo18Decimals(2);
      const amount = expandTo18Decimals(1) * -1n;
      const fee = 600n;
      const zeroForOne = false;

      const result = await swapMath.getComputeSwapStep(price, priceTarget, liquidity, amount, fee);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());

      expect(amountIn).toEqual(9975124224178055n);
      expect(feeAmount).toEqual(5988667735148n);
      expect(amountOut).toEqual(9925619580021728n);
      expect(amountOut).toBeLessThan(amount * -1n);

      const priceAfterWholeOutputAmount = await sqrtPriceMath.getNextSqrtPriceFromOutput(
        price,
        liquidity,
        amount * -1n,
        zeroForOne,
      );

      expect(sqrtQ).toEqual(priceTarget);
      expect(sqrtQ).toBeLessThan(priceAfterWholeOutputAmount);
    });

    it('exact amount in that is fully spent in one for zero', async () => {
      const price = encodePriceSqrt(1n, 1n);
      const priceTarget = encodePriceSqrt(1000n, 100n);
      const liquidity = expandTo18Decimals(2);
      const amount = expandTo18Decimals(1);
      const fee = 600n;
      const zeroForOne = false;

      const result = await swapMath.getComputeSwapStep(price, priceTarget, liquidity, amount, fee);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());

      expect(amountIn).toEqual(999400000000000000n);
      expect(feeAmount).toEqual(600000000000000n);
      expect(amountOut).toEqual(666399946655997866n);
      expect(amountIn + feeAmount).toEqual(amount);

      const priceAfterWholeInputAmountLessFee = await sqrtPriceMath.getNextSqrtPriceFromInput(
        price,
        liquidity,
        amount - feeAmount,
        zeroForOne,
      );

      expect(sqrtQ).toBeLessThan(priceTarget);
      expect(sqrtQ).toEqual(priceAfterWholeInputAmountLessFee);
    });

    it('exact amount out that is fully received in one for zero', async () => {
      const price = encodePriceSqrt(1n, 1n);
      const priceTarget = encodePriceSqrt(10000n, 100n);
      const liquidity = expandTo18Decimals(2);
      const amount = expandTo18Decimals(1) * -1n;
      const fee = 600n;
      const zeroForOne = false;

      const result = await swapMath.getComputeSwapStep(price, priceTarget, liquidity, amount, fee);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());

      expect(amountIn).toEqual(2000000000000000000n);
      expect(feeAmount).toEqual(1200720432259356n);
      expect(amountOut).toEqual(amount * -1n);

      const priceAfterWholeOutputAmount = await sqrtPriceMath.getNextSqrtPriceFromOutput(
        price,
        liquidity,
        amount * -1n,
        zeroForOne,
      );

      expect(sqrtQ).toBeLessThan(priceTarget);
      expect(sqrtQ).toEqual(priceAfterWholeOutputAmount);
    });

    it('amount out is capped at the desired amount out', async () => {
      const result = await swapMath.getComputeSwapStep(
        417332158212080721273783715441582n,
        1452870262520218020823638996n,
        159344665391607089467575320103n,
        -1n,
        1n,
      );
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());

      expect(amountIn).toEqual(1n);
      expect(feeAmount).toEqual(1n);
      expect(amountOut).toEqual(1n); // would be 2 if not capped
      expect(sqrtQ).toEqual(417332158212080721273783715441581n);
    });

    it('target price of 1 uses partial input amount', async () => {
      const result = await swapMath.getComputeSwapStep(2n, 1n, 1n, 3915081100057732413702495386755767n, 1n);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());
      expect(amountIn).toEqual(39614081257132168796771975168n);
      expect(feeAmount).toEqual(39614120871253040049813n);
      expect(amountIn + feeAmount).toBeLessThanOrEqual(3915081100057732413702495386755767n);
      expect(amountOut).toEqual(0n);
      expect(sqrtQ).toEqual(1n);
    });

    it('entire input amount taken as fee', async () => {
      const result = await swapMath.getComputeSwapStep(
        2413n,
        79887613182836312n,
        1985041575832132834610021537970n,
        10n,
        1872n,
      );
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());
      expect(amountIn).toEqual(0n);
      expect(feeAmount).toEqual(10n);
      expect(amountOut).toEqual(0n);
      expect(sqrtQ).toEqual(2413n);
    });

    it('handles intermediate insufficient liquidity in zero for one exact output case', async () => {
      const sqrtP = 20282409603651670423947251286016n;
      const sqrtPTarget = (sqrtP * 11n) / 10n;
      const liquidity = 1024n;
      // virtual reserves of one are only 4
      // https://www.wolframalpha.com/input/?i=1024+%2F+%2820282409603651670423947251286016+%2F+2**96%29
      const amountRemaining = -4n;
      const feePips = 3000n;
      const result = await swapMath.getComputeSwapStep(sqrtP, sqrtPTarget, liquidity, amountRemaining, feePips);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());
      expect(amountOut).toEqual(0n);
      expect(sqrtQ).toEqual(sqrtPTarget);
      expect(amountIn).toEqual(26215n);
      expect(feeAmount).toEqual(79n);
    });

    it('handles intermediate insufficient liquidity in one for zero exact output case', async () => {
      const sqrtP = 20282409603651670423947251286016n;
      const sqrtPTarget = (sqrtP * 9n) / 10n;
      const liquidity = 1024n;
      // virtual reserves of zero are only 262144
      // https://www.wolframalpha.com/input/?i=1024+*+%2820282409603651670423947251286016+%2F+2**96%29
      const amountRemaining = -263000n;
      const feePips = 3000n;
      const result = await swapMath.getComputeSwapStep(sqrtP, sqrtPTarget, liquidity, amountRemaining, feePips);
      const [sqrtQ, amountIn, amountOut, feeAmount] = Array(4)
        .fill(null)
        .map(() => result.stack.readBigNumber());
      expect(amountOut).toEqual(26214n);
      expect(sqrtQ).toEqual(sqrtPTarget);
      expect(amountIn).toEqual(1n);
      expect(feeAmount).toEqual(1n);
    });

    describe('gas', () => {
      it('swap one for zero exact in capped', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(101n, 100n),
          expandTo18Decimals(2),
          expandTo18Decimals(1),
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap zero for one exact in capped', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(99n, 100n),
          expandTo18Decimals(2),
          expandTo18Decimals(1),
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap one for zero exact out capped', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(101n, 100n),
          expandTo18Decimals(2),
          expandTo18Decimals(1) * -1n,
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap zero for one exact out capped', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(99n, 100n),
          expandTo18Decimals(2),
          expandTo18Decimals(1) * -1n,
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap one for zero exact in partial', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(1010n, 100n),
          expandTo18Decimals(2),
          1000n,
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap zero for one exact in partial', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(99n, 1000n),
          expandTo18Decimals(2),
          1000n,
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap one for zero exact out partial', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(1010n, 100n),
          expandTo18Decimals(2),
          1000n,
          600n,
        );
        console.log(res.gasUsed);
      });
      it('swap zero for one exact out partial', async () => {
        const res = await swapMath.getComputeSwapStep(
          encodePriceSqrt(1n, 1n),
          encodePriceSqrt(99n, 1000n),
          expandTo18Decimals(2),
          1000n,
          600n,
        );
        console.log(res.gasUsed);
      });
    });
  });
});
