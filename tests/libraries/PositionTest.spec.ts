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

  function assertPositionEqual(expectedPosition: any, actualPosition: any) {
    const [expectedLiquidity, expectedFeeGrowthInside0X128, expectedFeeGrowthInside1X128, expectedTokensOwed0, expectedTokensOwed1] = expectedPosition;
    const [actualLiquidity, actualFeeGrowthInside0X128, actualFeeGrowthInside1X128, actualTokensOwed0, actualTokensOwed1] = actualPosition;
    expect(actualLiquidity).toEqual(expectedLiquidity);
    expect(actualFeeGrowthInside0X128).toEqual(expectedFeeGrowthInside0X128);
    expect(actualFeeGrowthInside1X128).toEqual(expectedFeeGrowthInside1X128);
    expect(actualTokensOwed0).toEqual(expectedTokensOwed0);
    expect(actualTokensOwed1).toEqual(expectedTokensOwed1);
  }

  describe('#create', () => {
    // action on pool function: mint()
    it('create position', async () => {
      let tx = await createPosition(-10, 10, 100n, 0n, 0n);
      expect(tx.transactions).toHaveTransaction({
        from: deployer.address,
        to: contract.address,
        op: crc32('op::position_create'),
        success: true,
      });
      const position = await contract.getPosition(deployer.address, -10, 10);
      assertPositionEqual([100n, 0n, 0n, 0n, 0n], position);
    });

    // NOTE: this case will be revert when minting a new position from pool contract
    // not from position contract
    it('create position with the same upper and lower tick', async () => {
      await createPosition(10, 10, 100n, 0n, 0n);
      const position = await contract.getPosition(deployer.address, 10, 10);
      assertPositionEqual([100n, 0n, 0n, 0n, 0n], position);
    });
  });

  describe('#update', () => {
    it('update arbitrary position', async () => {
      await createPosition(-10, 10, 100n, 0n, 0n);
      await updatePosition(-10, 10, 0n, 340282366920938463463374607431768211456n, 340282366920938463463374607431768211456n);
      const position = await contract.getPosition(deployer.address, -10, 10);
      assertPositionEqual([100n, 340282366920938463463374607431768211456n, 340282366920938463463374607431768211456n, 100n, 100n], position);
    });

    it('update position on increase liquidity', async () => {
      await createPosition(-10, 10, 100n, 0n, 0n);
      await updatePosition(-10, 10, 100n, 0n, 0n);
      const position = await contract.getPosition(deployer.address, -10, 10);
      assertPositionEqual([200n, 0n, 0n, 0n, 0n], position);
    });

    it('update position on decrease liquidity', async () => {
      await createPosition(-10, 10, 100n, 0n, 0n);
      await updatePosition(-10, 10, -50n, 0n, 0n);
      const position = await contract.getPosition(deployer.address, -10, 10);
      assertPositionEqual([50n, 0n, 0n, 0n, 0n], position);
    });

    it('update position on claim fee', async () => {
      await createPosition(-10, 10, 100n, 0n, 0n);
      await updatePosition(-10, 10, 0n, 360282366920938463463374607431768211456n, 360282366920938463463374607431768211456n);
      const position = await contract.getPosition(deployer.address, -10, 10);
      assertPositionEqual([100n, 360282366920938463463374607431768211456n, 360282366920938463463374607431768211456n, 105n, 105n], position);
    });
  })
});
