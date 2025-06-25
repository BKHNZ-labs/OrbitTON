import {
  Blockchain,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import TestClientWrapper from '../../wrappers/core/TestClient';
import { getMerkleProofs, getMerkleTree, innerHash, leafHash } from '../../wrappers/core/libraries/merkleTree';
import { WalletContractV4 } from '@ton/ton';
import fs from 'fs';

describe('TestClient Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('TestClient');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let testClientContract: SandboxContract<TestClientWrapper.TestClient>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    testClientContract = blockchain.openContract(TestClientWrapper.TestClient.createFromConfig(code));
    testClientContract.sendDeploy(deployer.getSender(), toNano('0.01'));
  });

  it('should verify proof', async () => {
    const allWallets = JSON.parse(fs.readFileSync('wallets.json', 'utf8'));
    let allWalletsAddresses = allWallets.map((wallet: any) => wallet.address);
    const nodes = allWalletsAddresses.map((address: string) =>
      beginCell().storeAddress(Address.parse(address)).endCell().hash(),
    );
    const selectedLeave = nodes[0];
    let { branch: proof, positions, root } = getMerkleProofs(nodes, selectedLeave);
    const result = await testClientContract.sendVerifyProof(
      deployer.getSender(),
      {
        rootHash: BigInt('0x' + root.value?.toString('hex')!),
        proof: proof!,
        leaf: BigInt('0x' + selectedLeave.toString('hex')),
        positions,
      },
      {
        value: toNano('0.05'),
        sendMode: SendMode.IGNORE_ERRORS,
      },
    );
    printTransactionFees(result.transactions);
    prettyLogTransactions(result.transactions);
  });
});
