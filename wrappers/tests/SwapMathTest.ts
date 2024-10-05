import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export class SwapMathTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new SwapMathTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new SwapMathTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getComputeSwapStep(
    provider: ContractProvider,
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: bigint,
  ) {
    try {
      const result = await provider.get('get_compute_swap_step', [
        {
          type: 'int',
          value: sqrtRatioCurrentX96,
        },
        {
          type: 'int',
          value: sqrtRatioTargetX96,
        },
        {
          type: 'int',
          value: liquidity,
        },
        {
          type: 'int',
          value: amountRemaining,
        },
        {
          type: 'int',
          value: feePips,
        },
      ]);
      return result;
    } catch (e) {
      throw Error((e as any).exitCode);
    }
  }
}
