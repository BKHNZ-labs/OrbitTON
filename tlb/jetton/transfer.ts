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

/*
mint#_  sqrt_price_x96: uint160
        tick_lower: int24
        tick_upper: int24
        fee: uint24
        tick_spacing: int24
        liquidity_delta: int128
        recipient: MsgAddress = MintParams;
*/

export interface MintParams {
  readonly kind: 'MintParams';
  readonly sqrt_price_x96: bigint;
  readonly tick_lower: number;
  readonly tick_upper: number;
  readonly fee: number;
  readonly tick_spacing: number;
  readonly liquidity_delta: bigint;
  readonly recipient: Address | ExternalAddress | null;
}

/*
op_jetton_transfer#0xf8a7ea5
        query_id: uint64
        jetton_amount: uint128
        to_address: MsgAddress
        response_address: MsgAddress
        fwd_amount: uint128
        forward_opcode: uint32
        jetton1_wallet: MsgAddress
        mint: ^MintParams = OpJettonTransfer;
*/

export interface OpJettonTransfer {
  readonly kind: 'OpJettonTransfer';
  readonly query_id: number;
  readonly jetton_amount: bigint;
  readonly to_address: Address | ExternalAddress | null;
  readonly response_address: Address | ExternalAddress | null;
  readonly fwd_amount: bigint;
  readonly forward_opcode: number;
  readonly jetton1_wallet: Address | ExternalAddress | null;
  readonly mint: MintParams;
}

/*
mint#_  sqrt_price_x96: uint160
        tick_lower: int24
        tick_upper: int24
        fee: uint24
        tick_spacing: int24
        liquidity_delta: int128
        recipient: MsgAddress = MintParams;
*/

export function loadMintParams(slice: Slice): MintParams {
  let sqrt_price_x96: bigint = slice.loadUintBig(160);
  let tick_lower: number = slice.loadInt(24);
  let tick_upper: number = slice.loadInt(24);
  let fee: number = slice.loadUint(24);
  let tick_spacing: number = slice.loadInt(24);
  let liquidity_delta: bigint = slice.loadIntBig(128);
  let recipient: Address | ExternalAddress | null = slice.loadAddressAny();
  return {
    kind: 'MintParams',
    sqrt_price_x96: sqrt_price_x96,
    tick_lower: tick_lower,
    tick_upper: tick_upper,
    fee: fee,
    tick_spacing: tick_spacing,
    liquidity_delta: liquidity_delta,
    recipient: recipient,
  };
}

export function storeMintParams(mintParams: MintParams): (builder: Builder) => void {
  return (builder: Builder) => {
    builder.storeUint(mintParams.sqrt_price_x96, 160);
    builder.storeInt(mintParams.tick_lower, 24);
    builder.storeInt(mintParams.tick_upper, 24);
    builder.storeUint(mintParams.fee, 24);
    builder.storeInt(mintParams.tick_spacing, 24);
    builder.storeInt(mintParams.liquidity_delta, 128);
    builder.storeAddress(mintParams.recipient);
  };
}

/*
op_jetton_transfer#0xf8a7ea5
        query_id: uint64
        jetton_amount: uint128
        to_address: MsgAddress
        response_address: MsgAddress
        fwd_amount: uint128
        forward_opcode: uint32
        jetton1_wallet: MsgAddress
        mint: ^MintParams = OpJettonTransfer;
*/

export function loadOpJettonTransfer(slice: Slice): OpJettonTransfer {
  if (slice.remainingBits >= 36 && slice.preloadUint(36) == 0xf8a7ea5) {
    slice.loadUint(36);
    let query_id: number = slice.loadUint(64);
    let jetton_amount: bigint = slice.loadUintBig(128);
    let to_address: Address | ExternalAddress | null = slice.loadAddressAny();
    let response_address: Address | ExternalAddress | null = slice.loadAddressAny();
    let fwd_amount: bigint = slice.loadUintBig(128);
    let forward_opcode: number = slice.loadUint(32);
    let jetton1_wallet: Address | ExternalAddress | null = slice.loadAddressAny();
    let slice1 = slice.loadRef().beginParse(true);
    let mint: MintParams = loadMintParams(slice1);
    return {
      kind: 'OpJettonTransfer',
      query_id: query_id,
      jetton_amount: jetton_amount,
      to_address: to_address,
      response_address: response_address,
      fwd_amount: fwd_amount,
      forward_opcode: forward_opcode,
      jetton1_wallet: jetton1_wallet,
      mint: mint,
    };
  }
  throw new Error(
    'Expected one of "OpJettonTransfer" in loading "OpJettonTransfer", but data does not satisfy any constructor',
  );
}

export function storeOpJettonTransfer(opJettonTransfer: OpJettonTransfer): (builder: Builder) => void {
  return (builder: Builder) => {
    builder.storeUint(0xf8a7ea5, 36);
    builder.storeUint(opJettonTransfer.query_id, 64);
    builder.storeUint(opJettonTransfer.jetton_amount, 128);
    builder.storeAddress(opJettonTransfer.to_address);
    builder.storeAddress(opJettonTransfer.response_address);
    builder.storeUint(opJettonTransfer.fwd_amount, 128);
    builder.storeUint(opJettonTransfer.forward_opcode, 32);
    builder.storeAddress(opJettonTransfer.jetton1_wallet);
    let cell1 = beginCell();
    storeMintParams(opJettonTransfer.mint)(cell1);
    builder.storeRef(cell1);
  };
}
