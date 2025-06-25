import { randomBytes } from 'crypto';
import { WalletContractV4 } from '@ton/ton';
import { keyPairFromSeed } from '@ton/crypto';
import * as fs from 'fs/promises';

async function generateWalletsSimple() {
  const total = 1000000;
  const result: any[] = [];

  for (let i = 0; i < total; i++) {
    const seed = randomBytes(32); // 32 bytes = 256 bits
    const keyPair = keyPairFromSeed(seed);
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
    });
    result.push({
      index: i,
      address: wallet.address.toString(),
      seed: seed.toString('hex'), // optional, for recovery
    });

    if (i % 1000 === 0) {
      console.log(`Generated ${i} wallets`, result);
    }
  }

  await fs.writeFile('10000000-wallets.json', JSON.stringify(result, null, 2));
}

generateWalletsSimple();
