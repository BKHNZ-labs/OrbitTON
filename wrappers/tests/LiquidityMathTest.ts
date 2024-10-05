import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class LiquidityMathTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new LiquidityMathTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new LiquidityMathTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getAddDelta(provider: ContractProvider, x: bigint, y: bigint) {
    try {
      const result = await provider.get('get_add_delta', [
        {
          type: 'int',
          value: x,
        },
        {
          type: 'int',
          value: y,
        },
      ]);
      return result;
    } catch (e) {
      throw Error((e as any).exitCode);
    }
  }
}
