import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { UnsafeCastTest } from '../../wrappers/tests/UnsafeCastTest';
import Decimal from 'decimal.js';
import { MaxUint128, pseudoRandomBigNumberOnUint128, pseudoRandomBigNumberOnUint256 } from '../shared/utils';

describe('UnsafeCastTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('UnsafeCastTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<UnsafeCastTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(UnsafeCastTest.createFromData(code, beginCell().endCell()));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  it('cast number that smaller than uint160', async () => {
    for (let i = 0; i < 1000; i++) {
      let randomNumber = pseudoRandomBigNumberOnUint128();
      const result = await contract.getUint160(randomNumber);
      expect(result).toBe(randomNumber);
    }
  });

  it('cast number that smaller than 0', async () => {
    await expect(contract.getUint160(-9654n)).rejects.toThrow();
    await expect(contract.getUint160(-554443n)).rejects.toThrow();
    await expect(contract.getUint160(-232409234n)).rejects.toThrow();
    await expect(contract.getUint160(-728934982348923894n)).rejects.toThrow();
    await expect(contract.getUint160(-13489590834053409590345903n)).rejects.toThrow();
  });

  it('cast number that bigger than uint160', async () => {
    const randomNumbers = new Array(1000).fill(0).map(() => {
      let number = 0n;
      do {
        number = pseudoRandomBigNumberOnUint256();
      } while (number < MaxUint128);
      return number;
    });
    for (let i = 0; i < randomNumbers.length; i++) {
      const randomNumber = randomNumbers[i];
      const expectResult = BigInt('0x' + randomNumber.toString(16).slice(-40));
      expect(await contract.getUint160(randomNumber)).toBe(expectResult);
    }
  });
});
