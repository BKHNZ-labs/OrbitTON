import { maxLiquidityForAmounts, TickMath } from '@uniswap/v3-sdk';
import { BigIntish } from '@uniswap/sdk-core';

import JSBI from 'jsbi';

const sqrtRatioCurrentX96 = JSBI.BigInt('4295128739');
const sqrtRatioAX96 = JSBI.BigInt('4295128739');
const sqrtRatioBX96 = JSBI.BigInt('4295128739');
const amount0 = JSBI.BigInt((2n ** 120n).toString());

const result = maxLiquidityForAmounts();
