import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { PositionTest } from '../../wrappers/tests/PositionTest';
import Decimal from 'decimal.js';
import { encodePriceSqrt, expandTo18Decimals, MaxUint128, MaxUint256 } from '../shared/utils';
import BigNumber from 'bignumber.js';
import { crc32 } from '../../wrappers';

describe('PositionTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('PositionTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<PositionTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    contract = blockchain.openContract(PositionTest.create(code));
    deployer = await blockchain.treasury('deployer');
    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  async function createPosition(
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    feeGrowthInside0X128: bigint,
    feeGrowthInside1X128: bigint,
  ) {
    let tx = await contract.sendCreate(
      deployer.getSender(),
      deployer.address,
      tickLower,
      tickUpper,
      liquidity,
      feeGrowthInside0X128,
      feeGrowthInside1X128,
      {
        value: toNano('0.1'),
      },
    );
    return tx;
  }

  async function updatePosition(
    tickLower: number,
    tickUpper: number,
    liquidityDelta: bigint,
    feeGrowthInside0X128: bigint,
    feeGrowthInside1X128: bigint,
  ) {
    let tx = await contract.sendUpdate(
      deployer.getSender(),
      deployer.address,
      tickLower,
      tickUpper,
      liquidityDelta,
      feeGrowthInside0X128,
      feeGrowthInside1X128,
      {
        value: toNano('0.1'),
      },
    );
    expect(tx.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      op: crc32('op::position_update'),
      success: true,
    });
  }

  describe('#create', () => {
    it('create position', async () => {
      let tx = await createPosition(-10, 10, 100n, 0n, 0n);
      expect(tx.transactions).toHaveTransaction({
        from: deployer.address,
        to: contract.address,
        op: crc32('op::position_create'),
        success: true,
      });
      const position = await contract.getPosition(deployer.address, -10, 10);
      console.log({
        position,
      });
    });
  });
});
