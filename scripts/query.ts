import { SqrtPriceMath, TickMath } from '@uniswap/v3-sdk';
import { encodePriceSqrt, PoolWrapper } from '../wrappers';
import JSBI from 'jsbi';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

// console.log(TickMath.getTickAtSqrtRatio(JSBI.BigInt(encodePriceSqrt(BigInt(100000), BigInt(1000000)).toString())));

// -23028;

// -23100;
// -22980;
export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();
  const userAddress = provider.sender().address!;
  const pool = provider.open(
    PoolWrapper.PoolTest.createFromAddress(Address.parse('EQADOUolXlWNgWXmMqMWeCK_wfm8oUejTfRomQwTBI989T9f')),
  );
  console.log('Pool info:', await pool.getPoolInfo());
}
