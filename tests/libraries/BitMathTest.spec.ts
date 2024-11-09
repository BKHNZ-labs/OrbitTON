import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { BitMathTest } from '../../wrappers/tests/BitMathTest';

describe('BitMathTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('BitMathTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let bitMath: SandboxContract<BitMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    bitMath = blockchain.openContract(BitMathTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await bitMath.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: bitMath.address,
      deploy: true,
      success: true,
    });
  });
  describe('#getMostSignificantBit', () => {
    it('0', async () => {
      expect(bitMath.getMostSignificantBit(0n)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x2000).toString(10)}`,
      );
    });
    it('1', async () => {
      expect(bitMath.getMostSignificantBit(1n)).resolves.toBe(0n);
    });
    it('2', async () => {
      expect(bitMath.getMostSignificantBit(2n)).resolves.toBe(1n);
    });
    it('all powers of 2', async () => {
      const results = await Promise.all([...Array(255)].map((_, i) => bitMath.getMostSignificantBit(BigInt(2 ** i))));
      results.forEach((result, i) => expect(result).toBe(BigInt(i)));
    });
    it('uint256(-1)', async () => {
      expect(bitMath.getMostSignificantBit(BigInt(2 ** 256) - 1n)).resolves.toBe(255n);
    });
  });

  describe('#getLeastSignificantBit', () => {
    it('0', async () => {
      await expect(bitMath.getLeastSignificantBit(0n)).rejects.toThrow(
        `Unable to execute get method. Got exit_code: ${(0x2000).toString(10)}`,
      );
    });
    it('1', async () => {
      expect(bitMath.getLeastSignificantBit(1n)).resolves.toBe(0n);
    });
    it('2', async () => {
      expect(bitMath.getLeastSignificantBit(2n)).resolves.toBe(1n);
    });
    it('all powers of 2', async () => {
      const results = await Promise.all([...Array(255)].map((_, i) => bitMath.getLeastSignificantBit(BigInt(2 ** i))));
      results.forEach((result, i) => expect(result).toBe(BigInt(i)));
    });
    it('uint256(-1)', async () => {
      expect(bitMath.getLeastSignificantBit(BigInt(2 ** 256) - 1n)).resolves.toBe(0n);
    });
  });
});
