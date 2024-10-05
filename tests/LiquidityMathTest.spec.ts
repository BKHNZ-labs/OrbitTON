import { compile } from '@ton/blueprint';
import { beginCell, Cell, toNano } from '@ton/core';
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { ExitCode } from './ExitCode';
import { LiquidityMathTest } from '../wrappers/tests/LiquidityMathTest';

const Q128 = BigInt(2) ** BigInt(128);
describe('LiquidityMath', () => {
  let code: Cell;
  let assertExitCode: (txs: BlockchainTransaction[], exit_code: number) => void;

  beforeAll(async () => {
    code = await compile('LiquidityMathTest');

    assertExitCode = (txs, exit_code) => {
      expect(txs).toHaveTransaction({
        exitCode: exit_code,
        aborted: exit_code != 0,
        success: exit_code == 0,
      });
    };
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<LiquidityMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(LiquidityMathTest.createFromData(code, beginCell().endCell()));

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
      expect((await contract.getAddDelta(1n, 0n)).stack.readBigNumber()).toEqual(1n);
    });
    it('1 + -1', async () => {
      expect((await contract.getAddDelta(1n, -1n)).stack.readBigNumber()).toEqual(0n);
    });
    it('1 + 1', async () => {
      expect((await contract.getAddDelta(1n, 1n)).stack.readBigNumber()).toEqual(2n);
    });
    it('2**128-15 + 15 overflows', async () => {
      await expect(contract.getAddDelta(Q128 - 15n, 15n)).rejects.toThrow(ExitCode.LA);
    });
    it('0 + -1 underflows', async () => {
      await expect(contract.getAddDelta(0n, -1n)).rejects.toThrow(ExitCode.LS);
    });
    it('3 + -4 underflows', async () => {
      await expect(contract.getAddDelta(3n, -4n)).rejects.toThrow(ExitCode.LS);
    });
    it('gas add', async () => {
      console.log((await contract.getAddDelta(15n, 4n)).gasUsed);
    })
    it('gas sub', async () => {
      console.log((await contract.getAddDelta(15n, -4n)).gasUsed);
    })
  });
});
