import { beginCell, Cell, Dictionary, toNano, Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import { JETTON_WALLET_BOC } from '../build/wrappers/helpers';

// Constants
const ONCHAIN_CONTENT_PREFIX = 0x00;
const SNAKE_PREFIX = 0x00;

// Jetton parameters
const jettonParams = {
  name: 'Orbiton Swap',
  symbol: 'ORB',
  image: 'https://pbs.twimg.com/profile_images/1871028225511702528/N23ltPQQ_400x400.jpg',
  description: 'Just Test ORB',
};
export type JettonMetaDataKeys = 'name' | 'description' | 'image' | 'symbol';

const jettonOnChainMetadataSpec: {
  [key in JettonMetaDataKeys]: 'utf8' | 'ascii' | undefined;
} = {
  name: 'utf8',
  description: 'utf8',
  image: 'ascii',
  symbol: 'utf8',
};

// Utility function to calculate SHA256 hash
function sha256(str: string): Buffer {
  return Buffer.from(require('crypto').createHash('sha256').update(str).digest('hex'), 'hex');
}

export function buildTokenMetadataCell(data: { [s: string]: string | undefined }): Cell {
  // Create dictionary for metadata
  const dict = Dictionary.empty(
    Dictionary.Keys.Buffer(32), // 256-bit (32-byte) keys for SHA256 hashes
    Dictionary.Values.Cell(), // Values stored as cells
  );

  // Process each metadata entry
  for (const [key, value] of Object.entries(data)) {
    if (!jettonOnChainMetadataSpec[key as JettonMetaDataKeys]) {
      throw new Error(`Unsupported onchain key: ${key}`);
    }
    if (!value) continue;

    // Convert string to buffer based on specified encoding
    const encoding = jettonOnChainMetadataSpec[key as JettonMetaDataKeys];
    const buffer = Buffer.from(value, encoding);

    // Create snake-encoded cell structure
    const contentCell = beginCell().storeUint(SNAKE_PREFIX, 8).storeBuffer(buffer).endCell();

    // Store in dictionary with SHA256 hash of key
    dict.set(sha256(key), contentCell);
  }

  // Build final metadata cell with prefix and dictionary
  return beginCell().storeUint(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

export async function run(provider: NetworkProvider) {
  // Create metadata cell with jetton parameters
  const metadataCell = buildTokenMetadataCell(jettonParams as any);

  // Create and open Jetton minter contract
  const jettonMinter = provider.open(
    JettonMinterWrapper.JettonMinter.createFromConfig({
      adminAddress: provider.sender().address!,
      content: metadataCell,
    }),
  );

  // Deploy the contract
  await jettonMinter.sendDeploy(provider.sender(), {
    value: toNano('0.05'),
  });

  // Wait for deployment
  await provider.waitForDeploy(jettonMinter.address);

  console.log('Jetton minter deployed at address:', jettonMinter.address.toString());
}
