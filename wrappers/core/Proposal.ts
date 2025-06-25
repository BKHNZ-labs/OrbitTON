import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { crc32 } from '../crc32';
import { ValueOps } from '../@types';
import { compile } from '@ton/blueprint';

namespace ProposalWrapper {
  export const Opcodes = {
    Vote: crc32('op::vote'),
  };

  export interface OpVote {
    vote: boolean;
    branch: Cell;
    positions: Cell;
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

    async sendVote(provider: ContractProvider, via: Sender, data: OpVote, opts: ValueOps) {
      const proof = beginCell()
        .storeInt(data.vote ? -1 : 0, 2)
        .storeRef(data.branch)
        .storeRef(data.positions)
        .endCell();
      await provider.internal(via, {
        ...opts,
        body: beginCell().storeUint(Opcodes.Vote, 32).storeUint(0, 64).storeRef(proof).endCell(),
      });
    }

    async getVotePower(provider: ContractProvider) {
      const { stack } = await provider.get('get_vote_power', []);
      return stack.readBigNumber();
    }
  }
}

export default ProposalWrapper;
