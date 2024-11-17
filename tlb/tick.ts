import { Builder } from '@ton/core';
import { Slice } from '@ton/core';
import { beginCell } from '@ton/core';
import { BitString } from '@ton/core';
import { Cell } from '@ton/core';
import { Address } from '@ton/core';
import { ExternalAddress } from '@ton/core';
import { Dictionary } from '@ton/core';
import { DictionaryValue } from '@ton/core';
export function bitLen(n: number) {
  return n.toString(2).length;
}

// tick#_ liquidity_gross:uint128 liquidity_net:int128 fee_growth_outside_0_x128:uint256 fee_growth_outside_1_x128:uint256 tick_cumulative_outside:int56 initialized:Bool = Info;

export interface Info {
  readonly kind: 'Info';
  readonly liquidity_gross: bigint;
  readonly liquidity_net: bigint;
  readonly fee_growth_outside_0_x128: bigint;
  readonly fee_growth_outside_1_x128: bigint;
  readonly initialized: boolean;
}

// tick#_ liquidity_gross:uint128 liquidity_net:int128 fee_growth_outside_0_x128:uint256 fee_growth_outside_1_x128:uint256 tick_cumulative_outside:int56 initialized:Bool = Info;

export function loadInfo(slice: Slice): Info {
  let liquidity_gross: bigint = slice.loadUintBig(128);
  let liquidity_net: bigint = slice.loadIntBig(128);
  let fee_growth_outside_0_x128: bigint = slice.loadUintBig(256);
  let fee_growth_outside_1_x128: bigint = slice.loadUintBig(256);
  let initialized: boolean = slice.loadBoolean();
  return {
    kind: 'Info',
    liquidity_gross: liquidity_gross,
    liquidity_net: liquidity_net,
    fee_growth_outside_0_x128: fee_growth_outside_0_x128,
    fee_growth_outside_1_x128: fee_growth_outside_1_x128,
    initialized: initialized,
  };
}

export function storeInfo(info: Info): (builder: Builder) => void {
  return (builder: Builder) => {
    builder.storeUint(info.liquidity_gross, 128);
    builder.storeInt(info.liquidity_net, 128);
    builder.storeUint(info.fee_growth_outside_0_x128, 256);
    builder.storeUint(info.fee_growth_outside_1_x128, 256);
    builder.storeBit(info.initialized);
  };
}
