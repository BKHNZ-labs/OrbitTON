import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { Info, storeInfo } from '../../tlb/tick';

const enum TickTestOp {
  SetTick = 0x83687a45,
  TickUpdate = 0x1c9bb32e,
  TickDelete = 0xe5767915,
  TickCross = 0x57d49c2a,
}

export class TickTest implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new TickTest(address);
  }

  static createFromData(code: Cell, data: Cell, workchain = 0) {
    const init = { code, data };
    return new TickTest(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendSetTick(provider: ContractProvider, via: Sender, value: bigint, tick: bigint, tickInfo: Info) {
    const tickInfoCell = beginCell();
    storeInfo(tickInfo)(tickInfoCell);
    return await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(TickTestOp.SetTick, 32)
        .storeUint(0, 64)
        .storeRef(beginCell().storeInt(tick, 24).storeRef(tickInfoCell.endCell()).endCell())
        .endCell(),
    });
  }
  async sendSetUpdate(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    tick: bigint,
    tickCurrent: bigint,
    liquidityDelta: bigint,
    feeGrowthGlobal0X128: bigint,
    feeGrowthGlobal1X128: bigint,
    tickCumulative: bigint,
    upper: boolean,
    maxLiquidity: bigint,
  ) {
    return await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(TickTestOp.TickUpdate, 32)
        .storeUint(0, 64)
        .storeRef(
          beginCell()
            .storeInt(tick, 24)
            .storeInt(tickCurrent, 24)
            .storeInt(liquidityDelta, 128)
            .storeUint(feeGrowthGlobal0X128, 256)
            .storeUint(feeGrowthGlobal1X128, 256)
            .storeInt(tickCumulative, 56)
            .storeUint(upper ? 1 : 0, 1)
            .storeUint(maxLiquidity, 128)
            .endCell(),
        )
        .endCell(),
    });
  }

  async getTickSpacingToMaxLiquidityPerTick(provider: ContractProvider, tickSpacing: number) {
    const result = await provider.get('tick_spacing_to_max_liquidity_per_tick', [
      {
        type: 'int',
        value: BigInt(tickSpacing),
      },
    ]);
    return result.stack.readBigNumber();
  }

  async getFeeGrowthInside(
    provider: ContractProvider,
    tickLower: bigint,
    tickUpper: bigint,
    tickCurrent: bigint,
    feeGrowthGlobal0X128: bigint,
    feeGrowthGlobal1X128: bigint,
  ) {
    const result = await provider.get('get_fee_growth_inside', [
      {
        type: 'int',
        value: BigInt(tickLower),
      },
      {
        type: 'int',
        value: BigInt(tickUpper),
      },
      {
        type: 'int',
        value: BigInt(tickCurrent),
      },
      {
        type: 'int',
        value: BigInt(feeGrowthGlobal0X128),
      },
      {
        type: 'int',
        value: BigInt(feeGrowthGlobal1X128),
      },
    ]);
    const feeGrowthInside0X128 = result.stack.readBigNumber();
    const feeGrowthInside1X128 = result.stack.readBigNumber();
    return { feeGrowthInside0X128, feeGrowthInside1X128 };
  }
}
