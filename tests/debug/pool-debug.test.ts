import { Address, beginCell, Cell, Dictionary, fromNano, toNano } from '@ton/core';
import { setupTestEnvironment, NetworkType } from './test-environment';
import { JettonMinterWrapper, JettonWalletWrapper, MIN_SQRT_RATIO, PoolWrapper, RouterWrapper } from '../../wrappers';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { printTransactionFees, SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';
import { loadOpJettonTransferMint, loadOpJettonTransferSwap, storeSwapParams, SwapParams } from '../../tlb/jetton/transfer';
import { PTonWalletWrapper } from '../../wrappers/core/PTonWallet';
import PTonMinterWrapper from '../../wrappers/core/PTonMinter';
import { TonApiClient } from '@ton-api/client';
import { LiteClient, LiteRoundRobinEngine, LiteSingleEngine, LiteEngine } from "ton-lite-client";

function intToIP(int: number) {
    var part1 = int & 255;
    var part2 = ((int >> 8) & 255);
    var part3 = ((int >> 16) & 255);
    var part4 = ((int >> 24) & 255);

    return part4 + "." + part3 + "." + part2 + "." + part1;
}

let server = {
  "ip": 822907680,
  "port": 27842,
  "provided":"Beavis",
  "id": {
    "@type": "pub.ed25519",
    "key": "sU7QavX2F964iI9oToP9gffQpCQIoOLppeqL/pdPvpM="
  }
};

async function getLibs() {
    const engines: LiteEngine[] = [];
    engines.push(new LiteSingleEngine({
        host: `tcp://${intToIP(server.ip)}:${server.port}`,
        publicKey: Buffer.from(server.id.key, 'base64'),
    }));
    const engine: LiteEngine = new LiteRoundRobinEngine(engines);
    const client = new LiteClient({ engine });
  
    try {
        const libs = await client.getLibraries([Buffer.from('b5ee9c7201010101002300084202cd88e6f3c2a9cf01bb003a2837ec0d92c19685ed1dbfffd94a545dcfdf0a14d9'.slice(-64), 'hex')])
        return libs;
    } finally {
        // Close the connection to ensure Jest can exit
        engine.close();
    }
}



describe('Pool Contract Debug Tests', () => {
    let testWallet: SandboxContract<WalletContractV4>;
    
    // Add cleanup hook to ensure all connections are closed
    afterAll(async () => {
        // Add any cleanup needed here
        await new Promise(resolve => setTimeout(resolve, 500)); // Give time for connections to close
    });
    
    it('should load contract state from network', async () => {
        const libs = await getLibs();
        const result = libs.result[0];
        console.log({result})
        // Replace with your contract address
        const ROUTER_ADDRESS = Address.parse('EQCUjc3HQ5T56UY8uYm_b0FMY68uOK8OT67wVwmUXdnLMAq9')
        const POOL_ADDRESS = Address.parse('EQBUjRZNBUUsGzdOjH4tL4asTU6Li3xaNIcCS-W-wig2ayUv')
        const DUST = Address.parse('EQBXJHKfXkPHxs8Ex9yy8gu6DWm9_FgoPCMJfx-tZlDIm_Dk')
        const USDT = Address.parse('EQBMX7QVmqvs5Gtx5_eSGm1FF88YPTOou1yKEz8CRX8QTGh-')
        const network: NetworkType = 'testnet'; // or 'mainnet'
        
        // Setup test environment
        const blockchain = await setupTestEnvironment(network, 29200166);
        // Add the library to your blockchain instance
        const libsDict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
        libsDict.set(Buffer.from(result.hash), Cell.fromBoc(Buffer.from(result.data))[0]);
        blockchain.libs = beginCell().storeDictDirect(libsDict).endCell();
        // Create test wallet
        const mnemonic = 'visa bid goose elite grab hidden dilemma blur album depend print private bird marriage ceiling address pass guide useless label manage drum conduct digital'; // Replace with your test mnemonic
        const key = await mnemonicToWalletKey(mnemonic.split(' '));
        testWallet = blockchain.openContract(WalletContractV4.create({
            publicKey: key.publicKey,
            workchain: 0    
        }));
        const sender = (await testWallet.sender(key.secretKey)).result;
        
        const router = blockchain.openContract(RouterWrapper.RouterTest.createFromAddress(ROUTER_ADDRESS));
       

        const pool = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(POOL_ADDRESS));
        const dust = blockchain.openContract(JettonMinterWrapper.JettonMinter.createFromAddress(DUST));
        const usdt = blockchain.openContract(JettonMinterWrapper.JettonMinter.createFromAddress(USDT));
        
        const routerDustWallet = blockchain.openContract(
            JettonWalletWrapper.JettonWallet.createFromAddress(await dust.getWalletAddress(router.address))
        );
        const routerUsdtWallet = blockchain.openContract(
            JettonWalletWrapper.JettonWallet.createFromAddress(await usdt.getWalletAddress(router.address))
        );
        const routerPTONWallet = blockchain.openContract(
            PTonWalletWrapper.PTonWalletV2.createFromAddress(Address.parse("EQCs1HbVaBa8KrHdgnMW1SKTQuci0N2DB8B3-0QAWqYqBbkl"))
        );

        const userDustWallet = blockchain.openContract(
           JettonWalletWrapper.JettonWallet.createFromAddress(await dust.getWalletAddress(testWallet.address))
        );
        const userUsdtWallet = blockchain.openContract(
            JettonWalletWrapper.JettonWallet.createFromAddress(await usdt.getWalletAddress(testWallet.address))
        );
        console.log(loadOpJettonTransferSwap(
          Cell.fromBoc(
            Buffer.from("b5ee9c7201010201009e0001b20f8a7ea500000000000000005012a05f200801291b9b8e8729f3d28c7973137ede8298c75e5c715e1c9f5de0ae1328bbb3966100193136679d7884b5d9ef5b0f43ceea73da44ca54ddd9e28e1f74387e43b63aa9485f5e100101007fca2663c480159a8edaad02d785563bb04e62daa452685ce45a1bb060f80eff68800b54c540a0017700000787ffec4b1f7e8fe3528324424aeca8ea931cc4692c", "hex"))[0].beginParse()))
        const data = await pool.getPoolInfo();
        console.log({data})
        const poolDustPTON = await router.getPoolAddress(routerDustWallet.address, routerPTONWallet.address, 3000n, 60n);
        const poolDustPTONContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(poolDustPTON));
        const poolDustPTONContractInfo = await poolDustPTONContract.getPoolInfo();
        const swapRequest: SwapParams = {
          kind: 'SwapParams',
          forward_opcode: PoolWrapper.Opcodes.Swap,
          jetton1_wallet: routerDustWallet.address,
          fee: 3000,
          tick_spacing: 60,
          zero_for_one: -1,
          sqrt_price_limit: MIN_SQRT_RATIO + 1n
        }
        const swapCell = beginCell();
        storeSwapParams(swapRequest)(swapCell);

        const tx = await routerPTONWallet.sendTonTransfer(
          sender,
          {
            tonAmount: toNano(1.025),
            refundAddress: testWallet.address,
            fwdPayload: swapCell.endCell(),
            gas: 300000000n
          }
        );

        printTransactionFees(tx.transactions);

        console.log(await poolDustPTONContract.getPoolInfo())

        
    }, 30000);

    it('parse value', ()=>{
        
        
    })

    // it('should simulate transaction', async () => {
    //     const CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS';
    //     const network: NetworkType = 'testnet';
        
    //     const blockchain = await setupTestEnvironment(network);
    //     const contract = await loadContract(
    //         blockchain,
    //         Address.parse(CONTRACT_ADDRESS),
    //         'Pool Contract'
    //     );

    //     // Example: Simulate a transaction
    //     // Replace with your actual transaction parameters
    //     const result = await contract.provider?.internal(Address.parse('SENDER_ADDRESS'), {
    //         value: toNano('1'),
    //         bounce: true,
    //         body: undefined // Add your message body here
    //     });

    //     console.log('Transaction Result:', result);
    // });
}); 