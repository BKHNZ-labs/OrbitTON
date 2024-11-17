import {
  Blockchain,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
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
        batchTickCode: code,
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

  it('test simple batch tick', async () => {
    let txResult = await contract.sendUpdateTickLower(
      deployer.getSender(),
      {
        currentTick: 15000n,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
        liquidity: 1000n,
        maxLiquidity: 10000000n,
        tickLower: 500n,
        tickUpper: 20000n,
      },
      {
        value: toNano(1),
      },
    );
    printTransactionFees(txResult.transactions);

    txResult = await contract.sendUpdateTickLower(
      deployer.getSender(),
      {
        currentTick: 15000n,
        feeGrowthInside0LastX128: 0n,
        feeGrowthInside1LastX128: 0n,
        liquidity: 1000n,
        maxLiquidity: 10000000n,
        tickLower: 500n,
        tickUpper: 60000n,
      },
      {
        value: toNano(1),
      },
    );
    printTransactionFees(txResult.transactions);
    prettyLogTransactions(txResult.transactions);
  });
});
