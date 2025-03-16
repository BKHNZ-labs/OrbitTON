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
    PoolWrapper.PoolTest.createFromAddress(Address.parse('EQCtpowhg8efNm364J51zDiKNT_CNnApUU-bor5Jpd7HzhR3')),
  );
  console.log('Pool info:', await pool.getPoolInfo());
  console.log('Tick info:', await pool.getTicks());
}

//   0|index  | swapEvent {
//   0|index  |   address: EQCtpowhg8efNm364J51zDiKNT_CNnApUU-bor5Jpd7HzhR3,
//   0|index  |   transaction: {
//   0|index  |     from: EQCeuRLbIAm__PPiU-Ej-D6iR_4K1wAdF_ABttWUw086IzZu,
//   0|index  |     to: EQCtpowhg8efNm364J51zDiKNT_CNnApUU-bor5Jpd7HzhR3,
//   0|index  |     hash: "239d5162bcbc19b9496f3378cd671f0ecb34801a83dbc0ad821933c6d4b3431b",
//   0|index  |   },
//   0|index  |   block: {
//   0|index  |     id: {
//   0|index  |       seqno: 30968068,
//   0|index  |       workchain: 0,
//   0|index  |       shard: "-6917529027641081856",
//   0|index  |       rootHash: <Buffer e8 3b 98 e6 b7 21 32 00 2e c8 80 42 7d ef 98 ce 9e 9a a8 c7 ca d4 e1 92 6a 2c f6 de 83 1f a4 53>,
//   0|index  |       fileHash: <Buffer e2 d1 fe a1 a6 28 d7 66 d3 3c 8c b6 05 02 66 71 f9 d7 92 39 b7 91 78 b4 e0 25 4e 72 41 b7 50 ba>,
//   0|index  |     },
//   0|index  |     timestamp: 1742114259000,
//   0|index  |   },
//   0|index  |   amount0: 99661331310n,
//   0|index  |   amount1: 10000000000n,
//   0|index  |   protocolFeesJetton0: 0n,
//   0|index  |   protocolFeesJetton1: 0n,
//   0|index  |   recipient: EQBkxNmedeIS12e9bD0PO6nPaRMpU3dnijh90OH5DtjqpV6U,
//   0|index  |   sender: EQBkxNmedeIS12e9bD0PO6nPaRMpU3dnijh90OH5DtjqpV6U,
//   0|index  |   sqrtPriceX96: 25060680620470481165591749524n,
//   0|index  |   tick: -23022n,
//   0|index  | }
//   0|index  | [NOTICE] pool.sqrtPrice 25060680620470481165591749524
