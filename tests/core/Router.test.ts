import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import RouterWrapper from '../../wrappers/core/Router';
import { MaxUint128, pseudoRandomBigNumberOnUint128, pseudoRandomBigNumberOnUint256 } from '../shared/utils';

describe('Router Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('Router');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<RouterWrapper.RouterTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    contract = blockchain.openContract(
      RouterWrapper.RouterTest.create(code, {
        adminAddress: deployer.address,
        batchTickCode: beginCell().endCell(),
        lpAccountCode: beginCell().endCell(),
        positionCode: beginCell().endCell(),
        poolCode: beginCell().endCell(),
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
