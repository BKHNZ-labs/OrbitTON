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
