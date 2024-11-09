import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import BatchTickWrapper from '../../wrappers/core/BatchTick';
import { MaxUint128, pseudoRandomBigNumberOnUint128, pseudoRandomBigNumberOnUint256 } from '../shared/utils';

describe('BatchTick Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('BatchTick');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<BatchTickWrapper.BatchTickTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    router = await blockchain.treasury('router');

    contract = blockchain.openContract(
      BatchTickWrapper.BatchTickTest.create(code, {
        batchIndex: 0n,
        poolAddress: deployer.address,
        tickSpacing: 300n,
      }),
    );
    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  it('log address', async () => {
    console.log(contract.address);
  });
});
