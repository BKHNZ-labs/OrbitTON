import { beginCell, Cell } from '@ton/core';
import crypto from 'crypto';

const leafPrefix = Uint8Array.from([0]);
const innerPrefix = Uint8Array.from([1]);

// getSplitPoint returns the largest power of 2 less than length
const getSplitPoint = (length: number) => {
  if (length < 1) {
    throw new Error('Trying to split a tree with size < 1');
  }

  const bitlen = (Math.log2(length) + 1) >> 0;
  let k = 1 << (bitlen - 1);
  if (k === length) {
    k >>= 1;
  }
  return k;
};

// returns tmhash(0x01 || left || right)
export const innerHash = (left: Buffer, right: Buffer) => {
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([innerPrefix, left, right]))
    .digest();
};

export const leafHash = (leaf: Buffer) => {
  const leafBuf = Buffer.concat([leafPrefix, leaf]);
  return crypto.createHash('sha256').update(leafBuf).digest();
};

export interface MerkleTree {
  left?: MerkleTree;
  right?: MerkleTree;
  parent?: MerkleTree;
  value?: Buffer;
}

export const getMerkleTree = (items: Buffer[], lookUp: { [key: string]: MerkleTree } = {}) => {
  const root: MerkleTree = {};
  switch (items.length) {
    case 0:
      root.value = crypto.createHash('sha256').update(Buffer.from([])).digest();
      break;
    case 1:
      root.value = leafHash(items[0]);
      break;
    default:
      const k = getSplitPoint(items.length);
      root.left = getMerkleTree(items.slice(0, k), lookUp).root;
      root.right = getMerkleTree(items.slice(k), lookUp).root;
      root.value = innerHash(root.left.value!, root.right.value!);
      root.left.parent = root.right.parent = root;
  }
  lookUp[root.value!.toString('hex')] = root;
  return { root, lookUp };
};

export const getMerkleProofs = (leaves: Buffer[], leafData: Buffer) => {
  const { root, lookUp } = getMerkleTree(leaves);
  const leaf = leafHash(leafData);
  let node = lookUp[Buffer.from(leaf).toString('hex')];
  let positions = beginCell();
  const branch = [];
  let branchCell: Cell | undefined;
  while (node.parent) {
    const isRight = node.parent.right!.value!.equals(node.value!);
    // left is 1, right is 0
    positions = positions.storeBit(isRight ? 1 : 0);
    branch.push(isRight ? node.parent.left!.value! : node.parent.right!.value!);
    node = node.parent;
  }

  for (let i = branch.length - 1; i >= 0; i--) {
    // Convert Buffer to uint256 for FunC compatibility
    const hashAsUint256 = BigInt('0x' + branch[i].toString('hex'));
    const innerCell = beginCell().storeUint(hashAsUint256, 256).endCell();
    if (!branchCell) {
      branchCell = beginCell().storeRef(beginCell().endCell()).storeRef(innerCell).endCell();
    } else {
      branchCell = beginCell().storeRef(branchCell).storeRef(innerCell).endCell();
    }
  }

  return { root, branch: branchCell, positions: positions.endCell() };
};
