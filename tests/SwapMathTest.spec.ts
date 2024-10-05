import { compile } from '@ton/blueprint';
import { beginCell, Cell, toNano } from '@ton/core';
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ExitCode } from './ExitCode';
import { SwapMathTest } from '../wrappers/tests/SwapMathTest';
import { encodePriceSqrt, expandTo18Decimals } from './shared/utils';

const Q128 = BigInt(2) ** BigInt(128);
describe('SwapMath', () => {
  let code: Cell;
  let assertExitCode: (txs: BlockchainTransaction[], exit_code: number) => void;

  beforeAll(async () => {
    code = await compile('SwapMathTest');

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
  let contract: SandboxContract<SwapMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(SwapMathTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  describe('#computeSwapStep', () => {
    it('work', async () => {
      console.log('work');
      expect(true).toBe(true);
    });

    // it('exact amount in that gets capped at price target in one for zero', async () => {
    //   const price = encodePriceSqrt(1n, 1n)
    //   const priceTarget = encodePriceSqrt(101n, 100n)
    //   const liquidity = expandTo18Decimals(2)
    //   const amount = expandTo18Decimals(1)
    //   const fee = 600n
    //   const zeroForOne = false

    //   const result = await contract.getComputeSwapStep(
    //     price,
    //     priceTarget,
    //     liquidity,
    //     amount,
    //     fee
    //   );

    //   // FIXME: test the format returned
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = result.stack.readTuple() as any;

    //   expect(amountIn).toEqual('9975124224178055')
    //   expect(feeAmount).toEqual('5988667735148')
    //   expect(amountOut).toEqual('9925619580021728')
    //   expect(amountIn.add(feeAmount)).toBeGreaterThan(amount)

    //   const priceAfterWholeInputAmount = await sqrtPriceMath.getNextSqrtPriceFromInput(
    //     price,
    //     liquidity,
    //     amount,
    //     zeroForOne
    //   )

    //   expect(sqrtQ).toEqual(priceTarget)
    //   expect(sqrtQ).toBeGreaterThan(priceAfterWholeInputAmount)
    // })

    // it('exact amount out that gets capped at price target in one for zero', async () => {
    //   const price = encodePriceSqrt(1, 1)
    //   const priceTarget = encodePriceSqrt(101, 100)
    //   const liquidity = expandTo18Decimals(2)
    //   const amount = expandTo18Decimals(1).mul(-1)
    //   const fee = 600
    //   const zeroForOne = false

    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     price,
    //     priceTarget,
    //     liquidity,
    //     amount,
    //     fee
    //   )

    //   expect(amountIn).toEqual('9975124224178055')
    //   expect(feeAmount).toEqual('5988667735148')
    //   expect(amountOut).toEqual('9925619580021728')
    //   expect(amountOut, 'entire amount out is not returned').toBeGreaterThan(amount.mul(-1))

    //   const priceAfterWholeOutputAmount = await sqrtPriceMath.getNextSqrtPriceFromOutput(
    //     price,
    //     liquidity,
    //     amount.mul(-1),
    //     zeroForOne
    //   )

    //   expect(sqrtQ, 'price is capped at price target').toEqual(priceTarget)
    //   expect(sqrtQ, 'price is less than price after whole output amount').toBeGreaterThan(priceAfterWholeOutputAmount)
    // })

    // it('exact amount in that is fully spent in one for zero', async () => {
    //   const price = encodePriceSqrt(1, 1)
    //   const priceTarget = encodePriceSqrt(1000, 100)
    //   const liquidity = expandTo18Decimals(2)
    //   const amount = expandTo18Decimals(1)
    //   const fee = 600
    //   const zeroForOne = false

    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     price,
    //     priceTarget,
    //     liquidity,
    //     amount,
    //     fee
    //   )

    //   expect(amountIn).toEqual('999400000000000000')
    //   expect(feeAmount).toEqual('600000000000000')
    //   expect(amountOut).toEqual('666399946655997866')
    //   expect(amountIn.add(feeAmount), 'entire amount is used').toEqual(amount)

    //   const priceAfterWholeInputAmountLessFee = await sqrtPriceMath.getNextSqrtPriceFromInput(
    //     price,
    //     liquidity,
    //     amount.sub(feeAmount),
    //     zeroForOne
    //   )

    //   expect(sqrtQ, 'price does not reach price target').to.be.lt(priceTarget)
    //   expect(sqrtQ, 'price is equal to price after whole input amount').toEqual(priceAfterWholeInputAmountLessFee)
    // })

    // it('exact amount out that is fully received in one for zero', async () => {
    //   const price = encodePriceSqrt(1, 1)
    //   const priceTarget = encodePriceSqrt(10000, 100)
    //   const liquidity = expandTo18Decimals(2)
    //   const amount = expandTo18Decimals(1).mul(-1)
    //   const fee = 600
    //   const zeroForOne = false

    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     price,
    //     priceTarget,
    //     liquidity,
    //     amount,
    //     fee
    //   )

    //   expect(amountIn).toEqual('2000000000000000000')
    //   expect(feeAmount).toEqual('1200720432259356')
    //   expect(amountOut).toEqual(amount.mul(-1))

    //   const priceAfterWholeOutputAmount = await sqrtPriceMath.getNextSqrtPriceFromOutput(
    //     price,
    //     liquidity,
    //     amount.mul(-1),
    //     zeroForOne
    //   )

    //   expect(sqrtQ, 'price does not reach price target').to.be.lt(priceTarget)
    //   expect(sqrtQ, 'price is less than price after whole output amount').toEqual(priceAfterWholeOutputAmount)
    // })

    // it('amount out is capped at the desired amount out', async () => {
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     BigNumber.from('417332158212080721273783715441582'),
    //     BigNumber.from('1452870262520218020823638996'),
    //     '159344665391607089467575320103',
    //     '-1',
    //     1
    //   )
    //   expect(amountIn).toEqual('1')
    //   expect(feeAmount).toEqual('1')
    //   expect(amountOut).toEqual('1') // would be 2 if not capped
    //   expect(sqrtQ).toEqual('417332158212080721273783715441581')
    // })

    // it('target price of 1 uses partial input amount', async () => {
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     BigNumber.from('2'),
    //     BigNumber.from('1'),
    //     '1',
    //     '3915081100057732413702495386755767',
    //     1
    //   )
    //   expect(amountIn).toEqual('39614081257132168796771975168')
    //   expect(feeAmount).toEqual('39614120871253040049813')
    //   expect(amountIn.add(feeAmount)).to.be.lte('3915081100057732413702495386755767')
    //   expect(amountOut).toEqual('0')
    //   expect(sqrtQ).toEqual('1')
    // })

    // it('entire input amount taken as fee', async () => {
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     '2413',
    //     '79887613182836312',
    //     '1985041575832132834610021537970',
    //     '10',
    //     1872
    //   )
    //   expect(amountIn).toEqual('0')
    //   expect(feeAmount).toEqual('10')
    //   expect(amountOut).toEqual('0')
    //   expect(sqrtQ).toEqual('2413')
    // })

    // it('handles intermediate insufficient liquidity in zero for one exact output case', async () => {
    //   const sqrtP = BigNumber.from('20282409603651670423947251286016')
    //   const sqrtPTarget = sqrtP.mul(11).div(10)
    //   const liquidity = 1024
    //   // virtual reserves of one are only 4
    //   // https://www.wolframalpha.com/input/?i=1024+%2F+%2820282409603651670423947251286016+%2F+2**96%29
    //   const amountRemaining = -4
    //   const feePips = 3000
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     sqrtP,
    //     sqrtPTarget,
    //     liquidity,
    //     amountRemaining,
    //     feePips
    //   )
    //   expect(amountOut).toEqual(0)
    //   expect(sqrtQ).toEqual(sqrtPTarget)
    //   expect(amountIn).toEqual(26215)
    //   expect(feeAmount).toEqual(79)
    // })

    // it('handles intermediate insufficient liquidity in one for zero exact output case', async () => {
    //   const sqrtP = BigNumber.from('20282409603651670423947251286016')
    //   const sqrtPTarget = sqrtP.mul(9).div(10)
    //   const liquidity = 1024
    //   // virtual reserves of zero are only 262144
    //   // https://www.wolframalpha.com/input/?i=1024+*+%2820282409603651670423947251286016+%2F+2**96%29
    //   const amountRemaining = -263000
    //   const feePips = 3000
    //   const { amountIn, amountOut, sqrtQ, feeAmount } = await swapMath.computeSwapStep(
    //     sqrtP,
    //     sqrtPTarget,
    //     liquidity,
    //     amountRemaining,
    //     feePips
    //   )
    //   expect(amountOut).toEqual(26214)
    //   expect(sqrtQ).toEqual(sqrtPTarget)
    //   expect(amountIn).toEqual(1)
    //   expect(feeAmount).toEqual(1)
    // })

    // describe('gas', () => {
    //   it('swap one for zero exact in capped', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(101, 100),
    //         expandTo18Decimals(2),
    //         expandTo18Decimals(1),
    //         600
    //       )
    //     )
    //   })
    //   it('swap zero for one exact in capped', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(99, 100),
    //         expandTo18Decimals(2),
    //         expandTo18Decimals(1),
    //         600
    //       )
    //     )
    //   })
    //   it('swap one for zero exact out capped', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(101, 100),
    //         expandTo18Decimals(2),
    //         expandTo18Decimals(1).mul(-1),
    //         600
    //       )
    //     )
    //   })
    //   it('swap zero for one exact out capped', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(99, 100),
    //         expandTo18Decimals(2),
    //         expandTo18Decimals(1).mul(-1),
    //         600
    //       )
    //     )
    //   })
    //   it('swap one for zero exact in partial', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(1010, 100),
    //         expandTo18Decimals(2),
    //         1000,
    //         600
    //       )
    //     )
    //   })
    //   it('swap zero for one exact in partial', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(99, 1000),
    //         expandTo18Decimals(2),
    //         1000,
    //         600
    //       )
    //     )
    //   })
    //   it('swap one for zero exact out partial', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(1010, 100),
    //         expandTo18Decimals(2),
    //         1000,
    //         600
    //       )
    //     )
    //   })
    //   it('swap zero for one exact out partial', async () => {
    //     await snapshotGasCost(
    //       swapMath.getGasCostOfComputeSwapStep(
    //         encodePriceSqrt(1, 1),
    //         encodePriceSqrt(99, 1000),
    //         expandTo18Decimals(2),
    //         1000,
    //         600
    //       )
    //     )
    //   })
    // })
  });
});
