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
burn_position#_
    liquidity_delta:uint128
    = BurnPositionParams;
*/

export interface BurnPositionParams {
    readonly kind: 'BurnPositionParams';
    readonly liquidity_delta: bigint;
}

/*
op_burn_position#446497ac
    query_id:uint64
    body: BurnPositionParams
    = BurnPositionMessage;
*/

export interface BurnPositionMessage {
    readonly kind: 'BurnPositionMessage';
    readonly query_id: number;
    readonly body: BurnPositionParams;
}

/*
collect#_
    recipient:MsgAddress
    amount_0_requested:uint128
    amount_1_requested:uint128
    = CollectParams;
*/

export interface CollectParams {
    readonly kind: 'CollectParams';
    readonly recipient: Address | ExternalAddress | null;
    readonly amount_0_requested: bigint;
    readonly amount_1_requested: bigint;
}

/*
op_collect#c89aeef9
    query_id:uint64
    body: CollectParams
    = CollectMessage;
*/

export interface CollectMessage {
    readonly kind: 'CollectMessage';
    readonly query_id: number;
    readonly body: CollectParams;
}

/*
burn_position#_
    liquidity_delta:uint128
    = BurnPositionParams;
*/

export function loadBurnPositionParams(slice: Slice): BurnPositionParams {
    let liquidity_delta: bigint = slice.loadUintBig(128);
    return {
        kind: 'BurnPositionParams',
        liquidity_delta: liquidity_delta,
    }

}

export function storeBurnPositionParams(burnPositionParams: BurnPositionParams): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(burnPositionParams.liquidity_delta, 128);
    })

}

/*
op_burn_position#446497ac
    query_id:uint64
    body: BurnPositionParams
    = BurnPositionMessage;
*/

export function loadBurnPositionMessage(slice: Slice): BurnPositionMessage {
    if (((slice.remainingBits >= 32) && (slice.preloadUint(32) == 0x446497ac))) {
        slice.loadUint(32);
        let query_id: number = slice.loadUint(64);
        let body: BurnPositionParams = loadBurnPositionParams(slice);
        return {
            kind: 'BurnPositionMessage',
            query_id: query_id,
            body: body,
        }

    }
    throw new Error('Expected one of "BurnPositionMessage" in loading "BurnPositionMessage", but data does not satisfy any constructor');
}

export function storeBurnPositionMessage(burnPositionMessage: BurnPositionMessage): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(0x446497ac, 32);
        builder.storeUint(burnPositionMessage.query_id, 64);
        storeBurnPositionParams(burnPositionMessage.body)(builder);
    })

}

/*
collect#_
    recipient:MsgAddress
    amount_0_requested:uint128
    amount_1_requested:uint128
    = CollectParams;
*/

export function loadCollectParams(slice: Slice): CollectParams {
    let recipient: Address | ExternalAddress | null = slice.loadAddressAny();
    let amount_0_requested: bigint = slice.loadUintBig(128);
    let amount_1_requested: bigint = slice.loadUintBig(128);
    return {
        kind: 'CollectParams',
        recipient: recipient,
        amount_0_requested: amount_0_requested,
        amount_1_requested: amount_1_requested,
    }

}

export function storeCollectParams(collectParams: CollectParams): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeAddress(collectParams.recipient);
        builder.storeUint(collectParams.amount_0_requested, 128);
        builder.storeUint(collectParams.amount_1_requested, 128);
    })

}

/*
op_collect#c89aeef9
    query_id:uint64
    body: CollectParams
    = CollectMessage;
*/

export function loadCollectMessage(slice: Slice): CollectMessage {
    if (((slice.remainingBits >= 32) && (slice.preloadUint(32) == 0xc89aeef9))) {
        slice.loadUint(32);
        let query_id: number = slice.loadUint(64);
        let body: CollectParams = loadCollectParams(slice);
        return {
            kind: 'CollectMessage',
            query_id: query_id,
            body: body,
        }

    }
    throw new Error('Expected one of "CollectMessage" in loading "CollectMessage", but data does not satisfy any constructor');
}

export function storeCollectMessage(collectMessage: CollectMessage): (builder: Builder) => void {
    return ((builder: Builder) => {
        builder.storeUint(0xc89aeef9, 32);
        builder.storeUint(collectMessage.query_id, 64);
        storeCollectParams(collectMessage.body)(builder);
    })

}

