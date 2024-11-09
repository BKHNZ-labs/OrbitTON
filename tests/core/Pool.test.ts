import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import { MaxUint128, pseudoRandomBigNumberOnUint128, pseudoRandomBigNumberOnUint256 } from '../shared/utils';

describe('Pool Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('Pool');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<PoolWrapper.PoolTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    router = await blockchain.treasury('router');

    contract = blockchain.openContract(
      PoolWrapper.PoolTest.create(code, {
        batchTickCode: beginCell().endCell(),
        positionCode: beginCell().endCell(),
        lpAccountCode: beginCell().endCell(),
        routerAddress: router.address,
        fee: 3000n,
        jetton0Wallet: deployer.address,
        jetton1Wallet: deployer.address,
        protocolFee: 0n,
        sqrtPriceX96: 0n,
        tick: 0n,
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
