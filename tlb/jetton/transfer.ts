import { Builder } from '@ton/core'
import { Slice } from '@ton/core'
import { beginCell } from '@ton/core'
import { BitString } from '@ton/core'
import { Cell } from '@ton/core'
import { Address } from '@ton/core'
import { ExternalAddress } from '@ton/core'
import { Dictionary } from '@ton/core'
import { DictionaryValue } from '@ton/core'
export function bitLen(n: number) {
    return n.toString(2).length;
}

/*
mint#_  forward_opcode: uint32
        jetton1_wallet: MsgAddress
        tick_lower: int24
        tick_upper: int24
        fee: uint24
        tick_spacing: int24
        liquidity_delta: int128 = MintParams;
*/

export interface MintParams {
    readonly kind: 'MintParams';
    readonly forward_opcode: number;
    readonly jetton1_wallet: Address | ExternalAddress | null;
    readonly tick_lower: number;
    readonly tick_upper: number;
    readonly fee: number;
    readonly tick_spacing: number;
    readonly liquidity_delta: bigint;
}

/*
op_jetton_transfer#0f8a7ea5
        query_id: uint64
        jetton_amount: Grams
        to_address: MsgAddress
        response_address: MsgAddress
        custom_payload: Cell
        forward_ton_amount: Grams
        either_payload: Bool
        mint: ^MintParams = OpJettonTransfer;
*/

export interface OpJettonTransfer {
    readonly kind: 'OpJettonTransfer';
    readonly query_id: number;
    readonly jetton_amount: bigint;
    readonly to_address: Address | ExternalAddress | null;
    readonly response_address: Address | ExternalAddress | null;
    readonly custom_payload: Cell;
    readonly forward_ton_amount: bigint;
    readonly either_payload: boolean;
    readonly mint: MintParams;
}

/*
mint#_  forward_opcode: uint32
        jetton1_wallet: MsgAddress
        tick_lower: int24
        tick_upper: int24
        fee: uint24
        tick_spacing: int24
        liquidity_delta: int128 = MintParams;
*/

export function loadMintParams(slice: Slice): MintParams {
    let forward_opcode: number = slice.loadUint(32);
    let jetton1_wallet: Address | ExternalAddress | null = slice.loadAddressAny();
    let tick_lower: number = slice.loadInt(24);
    let tick_upper: number = slice.loadInt(24);
    let fee: number = slice.loadUint(24);
    let tick_spacing: number = slice.loadInt(24);
    let liquidity_delta: bigint = slice.loadIntBig(128);
    return {
        kind: 'MintParams',
        forward_opcode: forward_opcode,
        jetton1_wallet: jetton1_wallet,
        tick_lower: tick_lower,
        tick_upper: tick_upper,
        fee: fee,
        tick_spacing: tick_spacing,
        liquidity_delta: liquidity_delta,
    }

}

export function storeMintParams(mintParams: MintParams): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(mintParams.forward_opcode, 32);
        builder.storeAddress(mintParams.jetton1_wallet);
        builder.storeInt(mintParams.tick_lower, 24);
        builder.storeInt(mintParams.tick_upper, 24);
        builder.storeUint(mintParams.fee, 24);
        builder.storeInt(mintParams.tick_spacing, 24);
        builder.storeInt(mintParams.liquidity_delta, 128);
    })

}

/*
op_jetton_transfer#0f8a7ea5
        query_id: uint64
        jetton_amount: Grams
        to_address: MsgAddress
        response_address: MsgAddress
        custom_payload: Cell
        forward_ton_amount: Grams
        either_payload: Bool
        mint: ^MintParams = OpJettonTransfer;
*/

export function loadOpJettonTransfer(slice: Slice): OpJettonTransfer {
    if (((slice.remainingBits >= 32) && (slice.preloadUint(32) == 0x0f8a7ea5))) {
        slice.loadUint(32);
        let query_id: number = slice.loadUint(64);
        let jetton_amount: bigint = slice.loadCoins();
        let to_address: Address | ExternalAddress | null = slice.loadAddressAny();
        let response_address: Address | ExternalAddress | null = slice.loadAddressAny();
        let custom_payload: Cell = slice.asCell();
        let forward_ton_amount: bigint = slice.loadCoins();
        let either_payload: boolean = slice.loadBoolean();
        let slice1 = slice.loadRef().beginParse(true);
        let mint: MintParams = loadMintParams(slice1);
        return {
            kind: 'OpJettonTransfer',
            query_id: query_id,
            jetton_amount: jetton_amount,
            to_address: to_address,
            response_address: response_address,
            custom_payload: custom_payload,
            forward_ton_amount: forward_ton_amount,
            either_payload: either_payload,
            mint: mint,
        }

    }
    throw new Error('Expected one of "OpJettonTransfer" in loading "OpJettonTransfer", but data does not satisfy any constructor');
}

export function storeOpJettonTransfer(opJettonTransfer: OpJettonTransfer): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(0x0f8a7ea5, 32);
        builder.storeUint(opJettonTransfer.query_id, 64);
        builder.storeCoins(opJettonTransfer.jetton_amount);
        builder.storeAddress(opJettonTransfer.to_address);
        builder.storeAddress(opJettonTransfer.response_address);
        builder.storeSlice(opJettonTransfer.custom_payload.beginParse(true));
        builder.storeCoins(opJettonTransfer.forward_ton_amount);
        builder.storeBit(opJettonTransfer.either_payload);
        let cell1 = beginCell();
        storeMintParams(opJettonTransfer.mint)(cell1);
        builder.storeRef(cell1);
    })

}

