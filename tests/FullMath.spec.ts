import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { TestClient } from '../wrappers/TestClient';

describe('FullMath', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('TestClient');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<TestClient>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(TestClient.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  it('Test simple mul div', async () => {
    const result = await contract.getMulDiv(10n, 2n, 3n);
    expect(result).toEqual(6n);
  });

  it('Test simple mul div rounding up', async () => {
    const result = await contract.getMulDivRoundingUp(10n, 2n, 3n);
    expect(result).toEqual(7n);
  });
});
