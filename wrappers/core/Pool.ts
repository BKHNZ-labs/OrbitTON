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

namespace PoolWrapper {
  export const Opcodes = {
    Mint: crc32('op::mint'),
    Swap: crc32('op::swap'),
    Burn: crc32('op::burn'),
  };

  export interface InstantiateMsg {
    routerAddress: Address;
    jetton0Wallet: Address;
    jetton1Wallet: Address;
    fee: bigint;
    protocolFee: bigint;
    sqrtPriceX96: bigint;
    tickSpacing: bigint;
    tick: bigint;
    positionCode: Cell;
    lpAccountCode: Cell;
    batchTickCode: Cell;
  }

  export class PoolTest implements Contract {
    static workchain = 0;

    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static setWorkchain(workchain: number) {
      PoolTest.workchain = workchain;
    }

    static createFromAddress(address: Address) {
      return new PoolTest(address);
    }

    static create(code: Cell, initMsg: InstantiateMsg) {
      const data = beginCell()
        .storeRef(
          beginCell()
            .storeAddress(initMsg.routerAddress)
            .storeAddress(initMsg.jetton0Wallet)
            .storeAddress(initMsg.jetton1Wallet)
            .storeUint(initMsg.fee, 24)
            .storeUint(initMsg.protocolFee, 8)
            .storeUint(initMsg.sqrtPriceX96, 160)
            .endCell(),
        )
        .storeRef(
          beginCell()
            .storeInt(initMsg.tickSpacing, 24)
            .storeInt(0n, 24)
            .storeUint(0n, 256)
            .storeUint(0n, 256)
            .storeUint(0n, 128)
            .storeUint(0n, 128)
            .storeUint(0n, 128)
            .endCell(),
        )
        .storeRef(
          beginCell()
            .storeUint(0n, 64)
            .storeRef(
              beginCell()
                .storeDict(Dictionary.empty(Dictionary.Keys.Int(16), Dictionary.Values.Cell()))
                .endCell(),
            )
            .storeRef(initMsg.positionCode)
            .storeRef(initMsg.lpAccountCode)
            .storeRef(initMsg.batchTickCode)
            .endCell(),
        )
        .endCell();
      const init = { code, data };
      return new PoolTest(contractAddress(PoolTest.workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }

    async getCollectedFees(provider: ContractProvider): Promise<bigint[]> {
      const result = await provider.get('get_collected_fees', []);
      const tuple = result.stack;
      let data: any[] = [];
      while (tuple.remaining > 0) {
        const item = tuple.pop();
        if (item.type === 'int') {
          data = [...data, item.value];
        }
      }
      return data;
    }
  }
}

export default PoolWrapper;
