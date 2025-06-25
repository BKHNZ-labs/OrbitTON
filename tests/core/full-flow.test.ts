import {
  Blockchain,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import ProposalFactoryWrapper from '../../wrappers/core/ProposalFactory';
import { getMerkleProofs, getMerkleTree } from '../../wrappers/core/libraries/merkleTree';
import fs from 'fs';
import ProposalWrapper from '../../wrappers/core/Proposal';

describe('Full Flow Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('ProposalFactory');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let proposalFactoryContract: SandboxContract<ProposalFactoryWrapper.ProposalFactory>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    blockchain.now = Math.floor(Date.now() / 1000);
    deployer = await blockchain.treasury('deployer');
    const config = await ProposalFactoryWrapper.ProposalFactory.createFromConfig(code);
    proposalFactoryContract = blockchain.openContract(config);
    proposalFactoryContract.sendDeploy(deployer.getSender(), toNano('0.02'));
  });

  it('test simple flow with 3 wallets with passing the threshold', async () => {
    const allAccounts = await Promise.all([1, 2, 3].map(async (i) => await blockchain.treasury(`account-${i}`)));
    const allAccountsAddresses = allAccounts.map((account: SandboxContract<TreasuryContract>) => account.address);
    const nodes = allAccountsAddresses.map((address: Address) => beginCell().storeAddress(address).endCell().hash());

    const { root } = getMerkleTree(nodes);
    const result = await proposalFactoryContract.sendCreateProposal(
      deployer.getSender(),
      {
        startTime: Math.floor(Date.now() / 1000) - 3600,
        endTime: Math.floor(Date.now() / 1000) + 86400,
        thresholdPower: 2, // 10000 members per 100000
        rootHash: BigInt('0x' + root.value?.toString('hex')!),
        proposalInfo: beginCell().endCell(),
      },
      {
        value: toNano('0.02'),
      },
    );
    console.log('=====CREATE PROPOSAL=====');
    printTransactionFees(result.transactions);
    console.log('=====CREATE PROPOSAL=====');

    const executeVote = async (randomLeave: number) => {
      const account = allAccounts[randomLeave];
      const selectedLeave = nodes[randomLeave];
      console.log('Selected leave:', BigInt('0x' + selectedLeave.toString('hex')));
      let { branch, positions } = getMerkleProofs(nodes, selectedLeave);
      const proposalAddress = await proposalFactoryContract.getProposalAddress(deployer.address, 0);
      console.log('=====PROPOSAL ADDRESS=====', proposalAddress);
      const proposalContract = blockchain.openContract(
        ProposalWrapper.ProposalFactory.createFromAddress(proposalAddress),
      );
      const proposalContractResult = await proposalContract.sendVote(
        account.getSender(),
        {
          vote: true,
          branch: branch!,
          positions: positions!,
        },
        {
          value: toNano('0.05'),
        },
      );
      console.log('=====VOTE=====');
      printTransactionFees(proposalContractResult.transactions);
      console.log('=====VOTE=====');
      return proposalContractResult;
    };

    await executeVote(0);
    let txResult = await executeVote(1);
    const txs = txResult.transactions;
    const thirdTx = txs[3];
    const externalMsg = thirdTx.outMessages.get(0);
    const externalCell = externalMsg?.body;
    const externalValue = externalCell?.asSlice().loadUint(256);
    expect(externalValue).toBe(123123);
  });

  it('test simple flow with 100000 wallets', async () => {
    const allWallets = JSON.parse(fs.readFileSync('100000-wallets.json', 'utf8'));
    const randomLeave = Math.floor(Math.random() * allWallets.length);
    let allWalletsAddresses = allWallets.map((wallet: any) => wallet.address);
    allWalletsAddresses[randomLeave] = deployer.address.toString();
    const nodes = allWalletsAddresses.map((address: string) =>
      beginCell().storeAddress(Address.parse(address)).endCell().hash(),
    );
    const selectedLeave = nodes[randomLeave];
    console.log('Selected leave:', BigInt('0x' + selectedLeave.toString('hex')));
    let { branch, positions, root } = getMerkleProofs(nodes, selectedLeave);
    console.log('Root hash:', BigInt('0x' + root.value?.toString('hex')!));
    const result = await proposalFactoryContract.sendCreateProposal(
      deployer.getSender(),
      {
        startTime: Math.floor(Date.now() / 1000) - 3600,
        endTime: Math.floor(Date.now() / 1000) + 86400,
        thresholdPower: 10000, // 10000 members per 100000
        rootHash: BigInt('0x' + root.value?.toString('hex')!),
        proposalInfo: beginCell().endCell(),
      },
      {
        value: toNano('0.02'),
      },
    );
    console.log('=====CREATE PROPOSAL=====');
    printTransactionFees(result.transactions);
    console.log('=====CREATE PROPOSAL=====');
    const proposalAddress = await proposalFactoryContract.getProposalAddress(deployer.address, 0);
    console.log('=====PROPOSAL ADDRESS=====', proposalAddress);
    const proposalContract = blockchain.openContract(
      ProposalWrapper.ProposalFactory.createFromAddress(proposalAddress),
    );
    const proposalContractResult = await proposalContract.sendVote(
      deployer.getSender(),
      {
        vote: true,
        branch: branch!,
        positions: positions!,
      },
      {
        value: toNano('0.05'),
      },
    );
    console.log('=====VOTE=====');
    printTransactionFees(proposalContractResult.transactions);
    prettyLogTransactions(proposalContractResult.transactions);
    console.log('=====VOTE=====');
    let votePower = await proposalContract.getVotePower();
    console.log('Vote power:', votePower);
    expect(votePower).toBe(1n);

    // Redo and make sure vote power is still 1 (no double-vote)
    await proposalContract.sendVote(
      deployer.getSender(),
      {
        vote: true,
        branch: branch!,
        positions: positions!,
      },
      {
        value: toNano('0.05'),
      },
    );
    votePower = await proposalContract.getVotePower();
    expect(votePower).toBe(1n);

    // Unvote
    await proposalContract.sendVote(
      deployer.getSender(),
      {
        vote: false,
        branch: branch!,
        positions: positions!,
      },
      {
        value: toNano('0.05'),
      },
    );
    votePower = await proposalContract.getVotePower();
    expect(votePower).toBe(0n);

    // Revote
    await proposalContract.sendVote(
      deployer.getSender(),
      {
        vote: true,
        branch: branch!,
        positions: positions!,
      },
      {
        value: toNano('0.05'),
      },
    );
    votePower = await proposalContract.getVotePower();
    expect(votePower).toBe(1n);
  });

  it('test simple flow with 500000 wallets', async () => {
    const allWallets = JSON.parse(fs.readFileSync('500000-wallets.json', 'utf8'));
    const randomLeave = Math.floor(Math.random() * allWallets.length);
    let allWalletsAddresses = allWallets.map((wallet: any) => wallet.address);
    allWalletsAddresses[randomLeave] = deployer.address.toString();
    const nodes = allWalletsAddresses.map((address: string) =>
      beginCell().storeAddress(Address.parse(address)).endCell().hash(),
    );
    const selectedLeave = nodes[randomLeave];
    let { branch, positions, root } = getMerkleProofs(nodes, selectedLeave);
    const result = await proposalFactoryContract.sendCreateProposal(
      deployer.getSender(),
      {
        startTime: Math.floor(Date.now() / 1000) - 3600,
        endTime: Math.floor(Date.now() / 1000) + 86400,
        thresholdPower: 10000, // 10000 members per 100000
        rootHash: BigInt('0x' + root.value?.toString('hex')!),
        proposalInfo: beginCell().endCell(),
      },
      {
        value: toNano('0.02'),
      },
    );
    printTransactionFees(result.transactions);
    const proposalAddress = await proposalFactoryContract.getProposalAddress(deployer.address, 0);
    const proposalContract = blockchain.openContract(
      ProposalWrapper.ProposalFactory.createFromAddress(proposalAddress),
    );
    const proposalContractResult = await proposalContract.sendVote(
      deployer.getSender(),
      {
        vote: true,
        branch: branch!,
        positions: positions!,
      },
      {
        value: toNano('0.05'),
      },
    );
    printTransactionFees(proposalContractResult.transactions);
    let votePower = await proposalContract.getVotePower();
    expect(votePower).toBe(1n);
  });
});
