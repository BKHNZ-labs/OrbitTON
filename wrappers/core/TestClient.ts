import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { crc32 } from '../crc32';
import { ValueOps } from '../@types';

namespace TestClientWrapper {
  export const Opcodes = {
    VerifyProof: crc32('op::verify_proof'),
  };

  export interface OpVerifyProof {
    rootHash: bigint;
    proof: Cell;
    leaf: bigint;
    positions: Cell;
  }

  export class TestClient implements Contract {
    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
      return new TestClient(address);
    }

    static createFromConfig(code: Cell, workchain = 0) {
      const init = { code, data: beginCell().endCell() };
      return new TestClient(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }

    async sendVerifyProof(provider: ContractProvider, via: Sender, data: OpVerifyProof, opts: ValueOps) {
      const proof = beginCell()
        .storeUint(data.rootHash, 256)
        .storeUint(data.leaf, 256)
        .storeRef(data.proof)
        .storeRef(data.positions)
        .endCell();
      await provider.internal(via, {
        ...opts,
        body: beginCell().storeUint(Opcodes.VerifyProof, 32).storeUint(0, 64).storeRef(proof).endCell(),
      });
    }
  }
}

export default TestClientWrapper;
