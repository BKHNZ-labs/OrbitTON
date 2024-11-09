import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryKey,
  DictionaryValue,
  Sender,
  SendMode,
} from '@ton/core';
import { crc32, ValueOps } from '..';

namespace BatchTickWrapper {
  export const Opcodes = {
    UpdateTick: crc32('op::update_tick'),
  };

  export interface InstantiateMsg {
    batchIndex: bigint;
    tickSpacing: bigint;
    poolAddress: Address;
  }

  export class BatchTickTest implements Contract {
    static workchain = 0;

    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static setWorkchain(workchain: number) {
      BatchTickTest.workchain = workchain;
    }

    static createFromAddress(address: Address) {
      return new BatchTickTest(address);
    }

    static create(code: Cell, initMsg: InstantiateMsg) {
      const data = beginCell()
        .storeUint(initMsg.batchIndex, 8)
        .storeInt(initMsg.tickSpacing, 24)
        .storeAddress(initMsg.poolAddress)
        .storeDict(Dictionary.empty(Dictionary.Keys.Int(16), Dictionary.Values.Cell()))
        .endCell();
      const init = { code, data };
      return new BatchTickTest(contractAddress(BatchTickTest.workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }
  }
}

export default BatchTickWrapper;
