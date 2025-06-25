import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { crc32 } from '../crc32';
import { ValueOps } from '../@types';
import { compile } from '@ton/blueprint';

namespace ProposalFactoryWrapper {
  export const Opcodes = {
    CreateProposal: crc32('op::create_proposal'),
  };

  export interface OpCreateProposal {
    startTime: number;
    endTime: number;
    thresholdPower: number;
    rootHash: bigint;
    proposalInfo: Cell;
  }

  export class ProposalFactory implements Contract {
    constructor(
      readonly address: Address,
      readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
      return new ProposalFactory(address);
    }

    static async createFromConfig(code: Cell, workchain = 0) {
      const [proposalCode, voteCode] = await Promise.all([compile('Proposal'), compile('Vote')]);
      const data = beginCell().storeUint(0, 256).storeRef(proposalCode).storeRef(voteCode).endCell();
      const init = { code, data };
      return new ProposalFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
      await provider.internal(via, {
        value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell().endCell(),
      });
    }

    async sendCreateProposal(provider: ContractProvider, via: Sender, data: OpCreateProposal, opts: ValueOps) {
      const proof = beginCell()
        .storeUint(data.startTime, 128)
        .storeUint(data.endTime, 128)
        .storeUint(data.thresholdPower, 256)
        .storeUint(data.rootHash, 256)
        .storeRef(data.proposalInfo)
        .endCell();
      await provider.internal(via, {
        ...opts,
        body: beginCell().storeUint(Opcodes.CreateProposal, 32).storeUint(0, 64).storeRef(proof).endCell(),
      });
    }

    async getProposalAddress(provider: ContractProvider, address: Address, proposalId: number) {
      const result = await provider.get('get_proposal_address', [
        {
          type: 'slice',
          cell: beginCell().storeAddress(address).endCell(),
        },
        {
          type: 'int',
          value: BigInt(proposalId),
        },
      ]);
      return result.stack.readAddress();
    }
  }
}

export default ProposalFactoryWrapper;
