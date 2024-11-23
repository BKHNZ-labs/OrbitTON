import { maxLiquidityForAmounts, TickMath } from '@uniswap/v3-sdk';
import { BigintIsh } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import { FeeAmount, getMaxTick, getMinTick, TICK_SPACINGS } from '../../tests/shared/utils';

const sqrtRatioCurrentX96 = JSBI.BigInt('4295128739');
const sqrtRatioAX96 = JSBI.BigInt(TickMath.getSqrtRatioAtTick(getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM])));
const sqrtRatioBX96 = JSBI.BigInt(TickMath.getSqrtRatioAtTick(getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM])));
const amount0: BigintIsh = JSBI.BigInt((2n ** 120n - 1n).toString()).toString();
const amount1: BigintIsh = 0;
console.log(amount0);
const result = maxLiquidityForAmounts(sqrtRatioCurrentX96, sqrtRatioAX96, sqrtRatioBX96, amount0, amount1, true);

console.log(result.toString());
