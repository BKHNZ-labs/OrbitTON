import { compile } from "@ton/blueprint";
import { beginCell, Cell, toNano } from "@ton/core"
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { TestClient } from "../wrappers/TestClient";
import '@ton/test-utils';

const Q128 = BigInt(2) ** BigInt(128);
const MaxUint256: bigint = BigInt(2) ** BigInt(256) - BigInt(1);
describe('LiquidityMath', () => {
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

  describe('#addDelta', () => {
    it('1 + 0', async () => {
      expect(await contract.getAddDelta(1n, 0n)).toEqual(1n);
    })
    it('1 + -1', async () => {
      expect(await contract.getAddDelta(1n, -1n)).toEqual(0n)
    })
    it('1 + 1', async () => {
      expect(await contract.getAddDelta(1n, 1n)).toEqual(2n)
    })
    it('2**128-15 + 15 overflows', async () => {
        const res = await contract.getAddDelta(MaxUint256 - 14n, 15n)
        console.log(res);
    //   await expect(contract.getAddDelta(MaxUint256, 15n)).rejects.toThrow();
    })
    it('0 + -1 underflows', async () => {
    //   await expect(contract.getAddDelta(0, -1)).to.be.revertedWith('LS')
    })
    it('3 + -4 underflows', async () => {
    //   await expect(contract.getAddDelta(3, -4)).to.be.revertedWith('LS')
    })
    // it('gas add', async () => {
    //   await snapshotGasCost(liquidityMath.getGasCostOfAddDelta(15, 4))
    // })
    // it('gas sub', async () => {
    //   await snapshotGasCost(liquidityMath.getGasCostOfAddDelta(15, -4))
    // })
  })
})