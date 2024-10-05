import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class TickMathTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TickMathTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new TickMathTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getSqrtRatioAtTick(provider: ContractProvider, tick: bigint) {
    const result = await provider.get('get_sqrt_ratio_at_tick', [
      {
        type: 'int',
        value: tick,
      },
    ]);
    console.log('gasUsed', result.gasUsed);
    return result.stack.readBigNumber();
  }

  async getTickAtSqrtRatio(provider: ContractProvider, sqrtRatio: bigint) {
    const result = await provider.get('get_tick_at_sqrt_ratio', [
      {
        type: 'int',
        value: sqrtRatio,
      },
    ]);
    console.log('gasUsed', result.gasUsed);
    return result.stack.readBigNumber();
  }
}
