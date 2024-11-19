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
mint#_  jetton_amount_0:Grams 
        jetton_amount_1:Grams 
        tick_lower:int24 
        tick_upper:int24 
        liquidity_delta:int128 
        recipient:MsgAddress = MintParams;
*/

export interface MintParams {
    readonly kind: 'MintParams';
    readonly jetton_amount_0: bigint;
    readonly jetton_amount_1: bigint;
    readonly tick_lower: number;
    readonly tick_upper: number;
    readonly liquidity_delta: bigint;
    readonly recipient: Address | ExternalAddress | null;
}

/*
op_mint#ecad15c4 
    query_id:uint64
    body: ^MintParams = InMsgBody;
*/

export interface InMsgBody {
    readonly kind: 'InMsgBody';
    readonly query_id: number;
    readonly body: MintParams;
}

/*
mint#_  jetton_amount_0:Grams 
        jetton_amount_1:Grams 
        tick_lower:int24 
        tick_upper:int24 
        liquidity_delta:int128 
        recipient:MsgAddress = MintParams;
*/

export function loadMintParams(slice: Slice): MintParams {
    let jetton_amount_0: bigint = slice.loadCoins();
    let jetton_amount_1: bigint = slice.loadCoins();
    let tick_lower: number = slice.loadInt(24);
    let tick_upper: number = slice.loadInt(24);
    let liquidity_delta: bigint = slice.loadIntBig(128);
    let recipient: Address | ExternalAddress | null = slice.loadAddressAny();
    return {
        kind: 'MintParams',
        jetton_amount_0: jetton_amount_0,
        jetton_amount_1: jetton_amount_1,
        tick_lower: tick_lower,
        tick_upper: tick_upper,
        liquidity_delta: liquidity_delta,
        recipient: recipient,
    }

}

export function storeMintParams(mintParams: MintParams): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeCoins(mintParams.jetton_amount_0);
        builder.storeCoins(mintParams.jetton_amount_1);
        builder.storeInt(mintParams.tick_lower, 24);
        builder.storeInt(mintParams.tick_upper, 24);
        builder.storeInt(mintParams.liquidity_delta, 128);
        builder.storeAddress(mintParams.recipient);
    })

}

/*
op_mint#ecad15c4 
    query_id:uint64
    body: ^MintParams = InMsgBody;
*/

export function loadInMsgBody(slice: Slice): InMsgBody {
    if (((slice.remainingBits >= 32) && (slice.preloadUint(32) == 0xecad15c4))) {
        slice.loadUint(32);
        let query_id: number = slice.loadUint(64);
        let slice1 = slice.loadRef().beginParse(true);
        let body: MintParams = loadMintParams(slice1);
        return {
            kind: 'InMsgBody',
            query_id: query_id,
            body: body,
        }

    }
    throw new Error('Expected one of "InMsgBody" in loading "InMsgBody", but data does not satisfy any constructor');
}

export function storeInMsgBody(inMsgBody: InMsgBody): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(0xecad15c4, 32);
        builder.storeUint(inMsgBody.query_id, 64);
        let cell1 = beginCell();
        storeMintParams(inMsgBody.body)(cell1);
        builder.storeRef(cell1);
    })

}

