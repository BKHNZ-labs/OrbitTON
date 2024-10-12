import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { TickBitmapTest } from '../wrappers/tests/TickBitmapTest';
import Decimal from 'decimal.js';
import { encodePriceSqrt, expandTo18Decimals, MaxUint128, MaxUint256 } from './shared/utils';
import BigNumber from 'bignumber.js';
import { crc32 } from '../wrappers';

describe('SqrtPriceMathTest', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('TickBitmapTest');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let contract: SandboxContract<TickBitmapTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    contract = blockchain.openContract(TickBitmapTest.create(code));

    deployer = await blockchain.treasury('deployer');

    const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: contract.address,
      deploy: true,
      success: true,
    });
  });

  async function initTicks(ticks: number[]): Promise<void> {
    for (const tick of ticks) {
      let tx = await contract.sendFlipTick(deployer.getSender(), tick, {
        value: toNano('0.05'),
      });
      expect(tx.transactions).toHaveTransaction({
        from: deployer.address,
        to: contract.address,
        op: crc32('op::flip_tick'),
        success: true,
      });
    }
  }

  describe('#getIsInitialized', () => {
    it('is false at first', async () => {
      expect(await contract.getIsInitialized(1)).toBe(false);
    });
    it('is flipped by #sendFlipTick', async () => {
      await contract.sendFlipTick(deployer.getSender(), 1, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(1)).toBe(true);
    });
    it('is flipped back by #sendFlipTick', async () => {
      await contract.sendFlipTick(deployer.getSender(), 1, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), 1, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(1)).toBe(false);
    });
    it('is not changed by another flip to a different tick', async () => {
      await contract.sendFlipTick(deployer.getSender(), 2, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(1)).toBe(false);
    });
    it('is not changed by another flip to a different tick on another word', async () => {
      await contract.sendFlipTick(deployer.getSender(), 257, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(257)).toBe(true);
      expect(await contract.getIsInitialized(1)).toBe(false);
    });
  });

  describe('#sendFlipTick', () => {
    it('flips only the specified tick', async () => {
      await contract.sendFlipTick(deployer.getSender(), -230, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(-230)).toBe(true);
      expect(await contract.getIsInitialized(-231)).toBe(false);
      expect(await contract.getIsInitialized(-229)).toBe(false);
      expect(await contract.getIsInitialized(-230 + 256)).toBe(false);
      expect(await contract.getIsInitialized(-230 - 256)).toBe(false);
      await contract.sendFlipTick(deployer.getSender(), -230, {
        value: toNano('0.05'),
      });
      expect(await contract.getIsInitialized(-230)).toBe(false);
      expect(await contract.getIsInitialized(-231)).toBe(false);
      expect(await contract.getIsInitialized(-229)).toBe(false);
      expect(await contract.getIsInitialized(-230 + 256)).toBe(false);
      expect(await contract.getIsInitialized(-230 - 256)).toBe(false);
    });

    it('reverts only itself', async () => {
      await contract.sendFlipTick(deployer.getSender(), -230, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), -259, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), -229, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), 500, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), -259, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), -229, {
        value: toNano('0.05'),
      });
      await contract.sendFlipTick(deployer.getSender(), -259, {
        value: toNano('0.05'),
      });

      expect(await contract.getIsInitialized(-259)).toBe(true);
      expect(await contract.getIsInitialized(-229)).toBe(false);
    });
  });

  describe('#nextInitializedTickWithinOneWord', () => {
    beforeEach(async () => {
      // word boundaries are at multiples of 256
      await initTicks([-200, -55, -4, 70, 78, 84, 139, 240, 535]);
    });

    describe('lte = false', () => {
      it('returns tick to right if at initialized tick', async () => {
        expect(await contract.getIsInitialized(78)).toBe(true);
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(78, false);
        expect(next).toBe(84n);
        expect(initialized).toBe(true);
      });
      it('returns tick to right if at initialized tick', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(-55, false);
        expect(next).toBe(-4n);
        expect(initialized).toBe(true);
      });

      it('returns the tick directly to the right', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(77, false);
        expect(next).toBe(78n);
        expect(initialized).toBe(true);
      });
      it('returns the tick directly to the right', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(-56, false);
        expect(next).toBe(-55n);
        expect(initialized).toBe(true);
      });

      it('returns the next words initialized tick if on the right boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(255, false);
        expect(next).toBe(511n);
        expect(initialized).toBe(false);
      });
      it('returns the next words initialized tick if on the right boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(-257, false);
        expect(next).toBe(-200n);
        expect(initialized).toBe(true);
      });

      it('returns the next initialized tick from the next word', async () => {
        await contract.sendFlipTick(deployer.getSender(), 340, {
          value: toNano('0.05'),
        });
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(328, false);
        expect(next).toBe(340n);
        expect(initialized).toBe(true);
      });
      it('does not exceed boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(508, false);
        expect(next).toBe(511n);
        expect(initialized).toBe(false);
      });
      it('skips entire word', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(255, false);
        expect(next).toBe(511n);
        expect(initialized).toBe(false);
      });
      it('skips half word', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(383, false);
        expect(next).toBe(511n);
        expect(initialized).toBe(false);
      });
    });

    describe('lte = true', () => {
      it('returns same tick if initialized', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(78, true);
        expect(next).toBe(78n);
        expect(initialized).toBe(true);
      });
      it('returns tick directly to the left of input tick if not initialized', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(79, true);
        expect(next).toBe(78n);
        expect(initialized).toBe(true);
      });
      it('will not exceed the word boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(258, true);
        expect(next).toBe(256n);
        expect(initialized).toBe(false);
      });
      it('at the word boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(256, true);
        expect(next).toBe(256n);
        expect(initialized).toBe(false);
      });
      it('word boundary less 1 (next initialized tick in next word)', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(72, true);
        expect(next).toBe(70n);
        expect(initialized).toBe(true);
      });
      it('word boundary', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(-257, true);
        expect(next).toBe(-512n);
        expect(initialized).toBe(false);
      });
      it('entire empty word', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(1023, true);
        expect(next).toBe(768n);
        expect(initialized).toBe(false);
      });
      it('halfway through empty word', async () => {
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(900, true);
        expect(next).toBe(768n);
        expect(initialized).toBe(false);
      });
      it('boundary is initialized', async () => {
        await contract.sendFlipTick(deployer.getSender(), 329, {
          value: toNano('0.05'),
        });
        const [next, initialized] = await contract.getNextInitializedTickWithinOneWord(456, true);
        expect(next).toBe(329n);
        expect(initialized).toBe(true);
      });
    });
  });
});
