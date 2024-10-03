import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class TestClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TestClient(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new TestClient(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getMulDiv(provider: ContractProvider, x: bigint, y: bigint, z: bigint) {
    const result = await provider.get('get_mul_div', [
      {
        type: 'int',
        value: x,
      },
      {
        type: 'int',
        value: y,
      },
      {
        type: 'int',
        value: z,
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getMulDivRoundingUp(provider: ContractProvider, x: bigint, y: bigint, z: bigint) {
    const result = await provider.get('get_mul_div_rounding_up', [
      {
        type: 'int',
        value: x,
      },
      {
        type: 'int',
        value: y,
      },
      {
        type: 'int',
        value: z,
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getAddDelta(provider: ContractProvider, x: bigint, y: bigint) {
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
    return result.stack.readBigNumber();
  }
}
