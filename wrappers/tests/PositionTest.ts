import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  TupleItemInt,
} from '@ton/core';
import { crc32, ValueOps } from '..';
import { hash } from 'crypto';
import BigNumber from 'bignumber.js';

export class PositionTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new PositionTest(address);
  }

  static create(code: Cell, workchain = 0) {
    const data = beginCell()
      .storeDict(Dictionary.empty(Dictionary.Keys.Int(256), Dictionary.Values.Cell()))
      .endCell();
    const init = { code, data };
    return new PositionTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendCreate(
    provider: ContractProvider,
    via: Sender,
    owner: Address,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    feeGrowthInside0X128: bigint,
    feeGrowthInside1X128: bigint,
    ops: ValueOps,
  ) {
    console.log({ owner, tickLower, tickUpper });
    const key = beginCell()
        .storeAddress(owner)
        .storeInt(tickLower, 24)
        .storeInt(tickUpper, 24)
        .endCell().hash();

    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      ...ops,
      body: beginCell()
        .storeUint(crc32('op::position_create'), 32)
        .storeUint(ops.queryId ?? 0, 64)
        .storeBuffer(key, 32)
        .storeUint(liquidity, 128)
        .storeUint(feeGrowthInside0X128, 256)
        .storeUint(feeGrowthInside1X128, 256)
        .endCell(),
    });
  }

  async sendUpdate(
    provider: ContractProvider,
    via: Sender,
    owner: Address,
    tickLower: number,
    tickUpper: number,
    liquidityDelta: bigint,
    feeGrowthInside0X128: bigint,
    feeGrowthInside1X128: bigint,
    ops: ValueOps,
  ) {
    const key = beginCell()
    .storeAddress(owner)
    .storeInt(tickLower, 24)
    .storeInt(tickUpper, 24)
    .endCell().hash();
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      ...ops,
      body: beginCell()
        .storeUint(crc32('op::position_update'), 32)
        .storeUint(ops.queryId ?? 0, 64)
        .storeBuffer(key, 32)
        .storeUint(liquidityDelta, 128)
        .storeUint(feeGrowthInside0X128, 256)
        .storeUint(feeGrowthInside1X128, 256)
        .endCell(),
    });
  }

  async getPosition(provider: ContractProvider, owner: Address, tickLower: number, tickUpper: number) {
    try {
      const result = await provider.get('get_position', [
        {
          type: 'slice',
          cell: beginCell().storeAddress(owner).endCell(),
        },
        {
          type: 'int',
          value: BigInt(tickLower),
        },
        {
          type: 'int',
          value: BigInt(tickUpper),
        },
      ]);
      return result;
    } catch (e) {
      console.log(e);
      throw Error((e as any).exitCode);
    }
  }
}
