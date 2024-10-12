import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class BitMathTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new BitMathTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new BitMathTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getMostSignificantBit(provider: ContractProvider, x: bigint) {
    const result = await provider.get('get_msb', [
      {
        type: 'int',
        value: x,
      },
    ]);
    console.log('gasUsed:' + result.gasUsed);
    return result.stack.readBigNumber();
  }

  async getLeastSignificantBit(provider: ContractProvider, x: bigint) {
    const result = await provider.get('get_lsb', [
      {
        type: 'int',
        value: x,
      },
    ]);
    return result.stack.readBigNumber();
  }
}
