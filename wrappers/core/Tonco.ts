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

namespace ToncoWrapper {
  export class ToncoTest implements Contract {
    static workchain = 0;

    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
      return new ToncoTest(address);
    }

    async getPoolStateAndConfiguration(provider: ContractProvider) {
      const result = await provider.get('getPoolStateAndConfiguration', []);
      const tuple = result.stack;
      console.log(tuple);
      // let returnsResult: any[] = [];

      // while (tuple.remaining > 0) {
      //   const item = tuple.pop();
      //   returnsResult = [...returnsResult, item];
      // }

      // console.log(returnsResult);
    }
  }
}

export default ToncoWrapper;
