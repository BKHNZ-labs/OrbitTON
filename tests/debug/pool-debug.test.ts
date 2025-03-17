import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { setupTestEnvironment, NetworkType } from './test-environment';
import { JettonMinterWrapper, JettonWalletWrapper, PoolWrapper, RouterWrapper } from '../../wrappers';
import { WalletContractV4 } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { printTransactionFees, SandboxContract } from '@ton/sandbox';
import '@ton/test-utils';
import { loadOpJettonTransferMint } from '../../tlb/jetton/transfer';

describe('Pool Contract Debug Tests', () => {
    let testWallet: SandboxContract<WalletContractV4>;
    
    it('should load contract state from network', async () => {
        // Replace with your contract address
        const ROUTER_ADDRESS = Address.parse('EQBkY8koHBO51KvkrKEc_f4weiATV-4I-1pwDGxPNT1fUyIt')
        const POOL_ADDRESS = Address.parse('EQBUjRZNBUUsGzdOjH4tL4asTU6Li3xaNIcCS-W-wig2ayUv')
        const DUST = Address.parse('EQBXJHKfXkPHxs8Ex9yy8gu6DWm9_FgoPCMJfx-tZlDIm_Dk')
        const USDT = Address.parse('EQBMX7QVmqvs5Gtx5_eSGm1FF88YPTOou1yKEz8CRX8QTGh-')
        const network: NetworkType = 'testnet'; // or 'mainnet'
        
        // Setup test environment
        const blockchain = await setupTestEnvironment(network, 29189748);
        
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

        const userDustWallet = blockchain.openContract(
           JettonWalletWrapper.JettonWallet.createFromAddress(await dust.getWalletAddress(testWallet.address))
        );
        const userUsdtWallet = blockchain.openContract(
            JettonWalletWrapper.JettonWallet.createFromAddress(await usdt.getWalletAddress(testWallet.address))
        );
        console.log(routerUsdtWallet.address);
        const op1 = loadOpJettonTransferMint(Cell.fromBoc(Buffer.from('b5ee9c720101020100a00001b20f8a7ea500000000000000005e8d4a50fff800c8c79250382773a957c9594239fbfc60f44026afdc11f6b4e018d89e6a7abea700193136679d7884b5d9ef5b0f43ceea73da44ca54ddd9e28e1f74387e43b63aa94811e1a301010083ecad15c4800b0b596681f848e1b058558afb6595ca297032df967618c9a65873d99e9a7fc65fffda8001860001770000078000000000000000000001bfb0e173d510', 'hex'))[0].beginParse());
        console.log(op1)
        console.log(routerDustWallet.address);
        const op2 = loadOpJettonTransferMint(Cell.fromBoc(Buffer.from('b5ee9c720101020100a10001b40f8a7ea500000000000000006016a53996681800c8c79250382773a957c9594239fbfc60f44026afdc11f6b4e018d89e6a7abea700193136679d7884b5d9ef5b0f43ceea73da44ca54ddd9e28e1f74387e43b63aa94811e1a301010083ecad15c4801e20b7efaae406acd15695bc1efb59da573d833cd7624b03f67959625c6b15593fffda8001860001770000078000000000000000000001bfb0e173d510', 'hex'))[0].beginParse());
        console.log(op2)
        
        const data = await pool.getPoolInfo();
        console.log({data})

        const transfer0 = await userDustWallet.sendTransferMint(
            sender,
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 999999999999n,
              to_address: router.address,
              response_address: testWallet.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerUsdtWallet.address,
                tick_lower: -300,
                tick_upper: 3120,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 15382543572648n,
              },
            },
            {
              value: toNano(1),
            },
          );
         printTransactionFees(transfer0.transactions);
         expect(transfer0.transactions).toHaveTransaction({
            success: true,
            from: router.address,
            to: pool.address,
         });
          
        const transfer1 = await userUsdtWallet.sendTransferMint(
            sender,
            {
              kind: 'OpJettonTransferMint',
              query_id: 0,
              jetton_amount: 1556180723329n,
              to_address: router.address,
              response_address: testWallet.address,
              custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
              forward_ton_amount: toNano(0.8),
              either_payload: true,
              mint: {
                kind: 'MintParams',
                forward_opcode: PoolWrapper.Opcodes.Mint,
                jetton1_wallet: routerDustWallet.address,
                tick_lower: -300,
                tick_upper: 3120,
                tick_spacing: 60,
                fee: 3000,
                liquidity_delta: 15382543572648n,
              },
            },
            {
              value: toNano(1),
            },
          );

        printTransactionFees(transfer1.transactions);
        expect(transfer1.transactions).toHaveTransaction({
            success: true,
            from: router.address,
            to: pool.address,
         });

         const data2 = await pool.getPoolInfo();
         console.log({data2})
       
    }, 300000);

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