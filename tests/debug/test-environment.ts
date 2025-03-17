import { TonClient4 } from '@ton/ton';
import { Blockchain, RemoteBlockchainStorage, wrapTonClient4ForRemote } from '@ton/sandbox';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';

export type NetworkType = 'mainnet' | 'testnet';

export async function setupTestEnvironment(network: NetworkType = 'testnet', blockSeqno?: number) {
    const blockchain = await Blockchain.create({
        storage: new RemoteBlockchainStorage(
            wrapTonClient4ForRemote(
                new TonClient4({
                    endpoint: await getHttpV4Endpoint({
                        network
                    })
                })
            ),
            blockSeqno // Optional: specify block number to get state from
        )
    });
    
    return blockchain;
}

export async function setupLocalTestEnvironment() {
    return await Blockchain.create();
} 