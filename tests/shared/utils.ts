import bn from 'bignumber.js';
import Decimal from 'decimal.js';
// returns the sqrt price as a 64x96
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });
export function encodePriceSqrt(reserve1: bigint, reserve0: bigint): bigint {
  return BigInt(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString(),
  );
}

export const MaxUint128 = BigInt(bn(2).pow(128).minus(1).toString());
export const MaxUint256: bigint = BigInt(bn(2).pow(256).minus(1).toString());
export const MaxCoins = BigInt(bn(2).pow(120).minus(1).toString());

export const Q128 = BigInt(2) ** BigInt(128);

export function expandTo18Decimals(n: number): bigint {
  return BigInt(bn(n).multipliedBy(bn(10).pow(18)).toString());
}

export function pseudoRandomBigNumberOnUint128() {
  const pad = new Decimal(10).pow(9);
  const randomDecimal = new Decimal(Math.random().toString());
  const result = (MaxUint128 * BigInt(pad.mul(randomDecimal).round().toString())) / BigInt(pad.toString());
  return result;
}

export function pseudoRandomBigNumberOnUint256() {
  const pad = new Decimal(10).pow(9);
  const randomDecimal = new Decimal(Math.random().toString());
  const result = (MaxUint256 * BigInt(pad.mul(randomDecimal).round().toString())) / BigInt(pad.toString());
  return result;
}

export const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
export const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing;

export const getMaxLiquidityPerTick = (tickSpacing: number) =>
  (2n ** 128n - 1n) / (BigInt(getMaxTick(tickSpacing) - getMinTick(tickSpacing)) / BigInt(tickSpacing) + 1n);

export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

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

export function formatPrice(price: bigint): string {
  return new Decimal(price.toString()).dividedBy(new Decimal(2).pow(96)).pow(2).toPrecision(5);
}

export function formatTokenAmount(num: bigint): string {
  return new Decimal(num.toString()).dividedBy(new Decimal(10).pow(18)).toPrecision(5);
}
