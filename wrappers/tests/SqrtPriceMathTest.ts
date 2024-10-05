import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class SqrtPriceMathTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new SqrtPriceMathTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new SqrtPriceMathTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getNextSqrtPriceFromInput(
    provider: ContractProvider,
    sqrtPx96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean,
  ) {
    const result = await provider.get('get_next_sqrt_price_from_input', [
      {
        type: 'int',
        value: sqrtPx96,
      },
      {
        type: 'int',
        value: liquidity,
      },
      {
        type: 'int',
        value: amountIn,
      },
      {
        type: 'int',
        value: zeroForOne ? -1n : 0n,
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getNextSqrtPriceFromOutput(
    provider: ContractProvider,
    sqrtPx96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean,
  ) {
    const result = await provider.get('get_next_sqrt_price_from_output', [
      {
        type: 'int',
        value: sqrtPx96,
      },
      {
        type: 'int',
        value: liquidity,
      },
      {
        type: 'int',
        value: amountIn,
      },
      {
        type: 'int',
        value: zeroForOne ? -1n : 0n,
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getAmount0Delta(
    provider: ContractProvider,
    sqrtRatioAx96: bigint,
    sqrtRatioBx96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ) {
    const result = await provider.get('get_amount0_delta', [
      {
        type: 'int',
        value: sqrtRatioAx96,
      },
      {
        type: 'int',
        value: sqrtRatioBx96,
      },
      {
        type: 'int',
        value: liquidity,
      },
      {
        type: 'int',
        value: roundUp ? -1n : 0n,
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getAmount1Delta(
    provider: ContractProvider,
    sqrtRatioAx96: bigint,
    sqrtRatioBx96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ) {
    const result = await provider.get('get_amount1_delta', [
      {
        type: 'int',
        value: sqrtRatioAx96,
      },
      {
        type: 'int',
        value: sqrtRatioBx96,
      },
      {
        type: 'int',
        value: liquidity,
      },
      {
        type: 'int',
        value: roundUp ? -1n : 0n,
      },
    ]);
    return result.stack.readBigNumber();
  }
}
