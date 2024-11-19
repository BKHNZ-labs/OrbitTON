import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core';
import { crc32, ValueOps } from '..';
import { InMsgBody, storeInMsgBody } from '../../tlb/pool/messages';

namespace PoolWrapper {
  export const Opcodes = {
    Mint: crc32('op::mint'),
    Swap: crc32('op::swap'),
    Burn: crc32('op::burn'),
    CallBackLiquidity: crc32('op::cb_add_liquidity'),
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
    maxLiquidity?: bigint;
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
            .storeUint(0n, 256)
            .storeUint(initMsg.maxLiquidity ?? 0, 128)
            .storeRef(beginCell().storeDict(Dictionary.empty()).endCell())
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

    async sendMint(provider: ContractProvider, via: Sender, value: bigint, inMsgBody: InMsgBody) {
      const body = beginCell();
      storeInMsgBody(inMsgBody)(body);
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: body.endCell(),
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

    async getLpAccountAddress(
      provider: ContractProvider,
      user: Address,
      tick_lower: bigint,
      tick_upper: bigint,
    ): Promise<Address> {
      const result = await provider.get('get_lp_account_address', [
        {
          type: 'slice',
          cell: beginCell().storeAddress(user).endCell(),
        },
        {
          type: 'int',
          value: tick_lower,
        },
        {
          type: 'int',
          value: tick_upper,
        },
      ]);

      return result.stack.readAddress();
    }

    async getBatchTickIndex(provider: ContractProvider, tick: bigint): Promise<bigint> {
      const result = await provider.get('get_batch_tick_index', [
        {
          type: 'int',
          value: tick,
        },
      ]);
      return result.stack.readBigNumber();
    }

    async getBatchTickAddress(provider: ContractProvider, batchTickIndex: bigint): Promise<Address> {
      const result = await provider.get('get_calculate_batch_tick_address', [
        {
          type: 'int',
          value: batchTickIndex,
        },
      ]);
      return result.stack.readAddress();
    }

    async getPositionAddressBySeq(provider: ContractProvider, seq: bigint): Promise<Address> {
      const result = await provider.get('get_position_address_by_seq', [
        {
          type: 'int',
          value: seq,
        },
      ]);
      return result.stack.readAddress();
    }

    async getPositionSeqno(provider: ContractProvider): Promise<bigint> {
      const result = await provider.get('get_position_seqno', []);
      return result.stack.readBigNumber();
    }

    async getPoolInfo(provider: ContractProvider) {
      const result = await provider.get('get_pool_info', []);
      const fee = result.stack.readBigNumber();
      const tickSpacing = result.stack.readBigNumber();
      const tick = result.stack.readBigNumber();
      const sqrtPriceX96 = result.stack.readBigNumber();
      const liquidity = result.stack.readBigNumber();
      return { fee, tickSpacing, tick, sqrtPriceX96, liquidity };
    }
  }
}

export default PoolWrapper;
