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

export class TickBitmapTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TickBitmapTest(address);
  }

  static create(code: Cell, workchain = 0) {
    const data = beginCell()
      .storeDict(Dictionary.empty(Dictionary.Keys.Int(16), Dictionary.Values.Cell()))
      .endCell();
    const init = { code, data };
    return new TickBitmapTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendFlipTick(provider: ContractProvider, via: Sender, tick: number, ops: ValueOps) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      ...ops,
      body: beginCell()
        .storeUint(crc32('op::flip_tick'), 32)
        .storeUint(ops.queryId ?? 0, 64)
        .storeInt(tick, 24)
        .endCell(),
    });
  }

  async getIsInitialized(provider: ContractProvider, tick: number): Promise<boolean> {
    const result = await provider.get('get_is_initialized', [
      {
        type: 'int',
        value: BigInt(tick),
      },
    ]);
    return result.stack.readBigNumber() === -1n ? true : false;
  }

  async getNextInitializedTickWithinOneWord(
    provider: ContractProvider,
    tick: number,
    lte: boolean,
  ): Promise<[bigint, boolean]> {
    const result = await provider.get('get_next_initialized_tick_within_one_word', [
      {
        type: 'int',
        value: BigInt(tick),
      },
      {
        type: 'int',
        value: lte === true ? -1n : 0n,
      },
    ]);
    const tuple = result.stack;
    let returns: any[] = [];
    while (tuple.remaining > 0) {
      const item = tuple.pop();
      if (item.type === 'int') {
        returns = [...returns, item.value];
      }
    }
    return [returns[0], returns[1] === -1n ? true : false];
  }
}
