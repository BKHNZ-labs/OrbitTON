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

namespace RouterWrapper {
  export const Opcodes = {
    SetAdminAddress: crc32('op::set_admin_address'),
    UpdateLockState: crc32('op::update_lock_state'),
    UpdatePoolCode: crc32('op::update_pool_code'),
    UpdateAccountCode: crc32('op::update_account_code'),
    UpdateBatchTickCode: crc32('op::update_batch_tick_code'),
    UpdatePositionCode: crc32('op::update_position_code'),
  };

  export interface InstantiateMsg {
    adminAddress: Address;
    poolCode: Cell;
    batchTickCode: Cell;
    positionCode: Cell;
    lpAccountCode: Cell;
  }

  export interface SetAdminAddressMsg {
    address: Address;
  }

  export class RouterTest implements Contract {
    static workchain = 0;

    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static setWorkchain(workchain: number) {
      RouterTest.workchain = workchain;
    }

    static createFromAddress(address: Address) {
      return new RouterTest(address);
    }

    static create(code: Cell, initMsg: InstantiateMsg) {
      const data = beginCell()
        .storeInt(-1, 8)
        .storeAddress(initMsg.adminAddress)
        .storeRef(
          beginCell()
            .storeRef(initMsg.poolCode)
            .storeRef(initMsg.batchTickCode)
            .storeRef(initMsg.positionCode)
            .storeRef(initMsg.lpAccountCode),
        )
        .endCell();
      const init = { code, data };
      return new RouterTest(contractAddress(RouterTest.workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }

    async sendSetAdminAddress(provider: ContractProvider, via: Sender, data: SetAdminAddressMsg, ops: ValueOps) {
      await provider.internal(via, {
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        ...ops,
        body: beginCell()
          .storeUint(Opcodes.SetAdminAddress, 32)
          .storeUint(ops.queryId ?? 0, 64)
          .storeAddress(data.address)
          .endCell(),
      });
    }

    async getAdminAddress(provider: ContractProvider): Promise<Address> {
      const result = await provider.get('get_admin_address', []);
      return result.stack.readAddress();
    }

    async getIsLocked(provider: ContractProvider): Promise<boolean> {
      const result = await provider.get('get_is_locked', []);
      return result.stack.readBigNumber() === -1n ? true : false;
    }

    async getPoolCode(provider: ContractProvider): Promise<Cell> {
      const result = await provider.get('get_pool_code', []);
      return result.stack.readCell();
    }

    async getBatchTickCode(provider: ContractProvider): Promise<Cell> {
      const result = await provider.get('get_batch_tick_code', []);
      return result.stack.readCell();
    }

    async getPositionCode(provider: ContractProvider): Promise<Cell> {
      const result = await provider.get('get_position_code', []);
      return result.stack.readCell();
    }

    async getLpAccountCode(provider: ContractProvider): Promise<Cell> {
      const result = await provider.get('get_lp_account_code', []);
      return result.stack.readCell();
    }
  }
}

export default RouterWrapper;
