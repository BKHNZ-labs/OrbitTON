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
import { ValueOps } from '../@types';
import PoolWrapper from './Pool';
import { JETTON_WALLET_BOC } from '../helpers';

namespace JettonWalletWrapper {
  export enum JettonOpCodes {
    TRANSFER = 0xf8a7ea5,
    TRANSFER_NOTIFICATION = 0x7362d09c,
    INTERNAL_TRANSFER = 0x178d4519,
    EXCESSES = 0xd53276db,
    BURN = 0x595f07bc,
    BURN_NOTIFICATION = 0x7bdd97de,
    MINT = 21,
  }

  export type JettonWalletConfig = {
    ownerAddress: Address;
    minterAddress: Address;
    walletCode: Cell;
  };

  export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
      .storeCoins(0)
      .storeAddress(config.ownerAddress)
      .storeAddress(config.minterAddress)
      .storeRef(config.walletCode)
      .endCell();
  }

  export interface SendTransferInterface {
    forwardOpcode: number;
    jetton1Wallet: Address;
    jettonAmount: bigint;
    toAddress: Address;
    responseAddress: Address;
    fwdAmount: bigint;
    tickLower: bigint;
    tickUpper: bigint;
    fee: bigint;
    amount0InMin: bigint;
    amount1InMin: bigint;
  }

  export class JettonWallet implements Contract {
    static buildSendTransferPacket(data: SendTransferInterface, queryId: number = 0) {
      return beginCell()
        .storeUint(JettonOpCodes.TRANSFER, 32)
        .storeUint(queryId, 64)
        .storeCoins(data.jettonAmount) // 128
        .storeAddress(data.toAddress) // 167
        .storeAddress(data.responseAddress) // 167
        .storeDict(Dictionary.empty())
        .storeCoins(data.fwdAmount)
        .storeUint(data.forwardOpcode, 32)
        .storeAddress(data.jetton1Wallet)
        .storeRef(
          beginCell()
            .storeInt(data.tickLower, 24)
            .storeInt(data.tickUpper, 24)
            .storeUint(data.fee, 24)
            .storeUint(data.amount0InMin, 256)
            .storeUint(data.amount1InMin, 256)
            .endCell(),
        )

        .endCell();
    }

    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
      return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, workchain = 0) {
      const code = Cell.fromBoc(Buffer.from(JETTON_WALLET_BOC, 'hex'))[0];
      const data = jettonWalletConfigToCell(config);
      const init = { code, data };
      return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }

    async sendTransfer(provider: ContractProvider, via: Sender, data: SendTransferInterface, opts: ValueOps) {
      await provider.internal(via, {
        value: opts.value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: JettonWallet.buildSendTransferPacket(data, opts.queryId),
      });
    }

    async getBalance(provider: ContractProvider) {
      const state = await provider.getState();
      if (state.state.type !== 'active') {
        return { amount: 0n };
      }
      const { stack } = await provider.get('get_wallet_data', []);
      const [amount] = [stack.readBigNumber()];
      return { amount };
    }
  }
}

export default JettonWalletWrapper;
