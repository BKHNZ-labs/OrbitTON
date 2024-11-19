import {
  Blockchain,
  prettyLogTransaction,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';
import { JettonWallet } from '@ton/ton';
import PoolWrapper from '../../wrappers/core/Pool';
import { encodePriceSqrt } from '../shared/utils';

describe('Router Test', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('Router');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let routerContract: SandboxContract<RouterWrapper.RouterTest>;
  let token0MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let token1MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token1WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    routerContract = blockchain.openContract(
      RouterWrapper.RouterTest.create(code, {
        adminAddress: deployer.address,
        batchTickCode: beginCell().endCell(),
        lpAccountCode: beginCell().endCell(),
        positionCode: await compile('Position'),
        poolCode: await compile('Pool'),
      }),
    );
    token0MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token0')).endCell(),
      }),
    );
    token1MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token1')).endCell(),
      }),
    );
    let deployResult = await routerContract.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: routerContract.address,
      deploy: true,
      success: true,
    });
    deployResult = await token0MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token0MasterContract.address,
      deploy: true,
      success: true,
    });
    deployResult = await token1MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token1MasterContract.address,
      deploy: true,
      success: true,
    });
    await token0MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: toNano(1000000),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );
    await token1MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: toNano(1000000),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );

    const token0Wallet = await token0MasterContract.getWalletAddress(deployer.address);
    const token0WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token0Wallet);
    token0WalletContract = blockchain.openContract(token0WalletInstance);

    const token1Wallet = await token1MasterContract.getWalletAddress(deployer.address);
    const token1WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token1Wallet);
    token1WalletContract = blockchain.openContract(token1WalletInstance);
  });

  it('Send op:create_pool', async () => {
    const routerJetton0Wallet = await token0MasterContract.getWalletAddress(routerContract.address);
    console.log('Router wallet address', routerJetton0Wallet.toString());
    const routerJetton1Wallet = await token1MasterContract.getWalletAddress(routerContract.address);
    console.log('Router wallet address', routerJetton1Wallet.toString());
    const createPool = await routerContract.sendCreatePool(
      deployer.getSender(),
      {
        kind: 'OpCreatePool',
        query_id: 0,
        jetton0_wallet: routerJetton0Wallet,
        jetton1_wallet: routerJetton1Wallet,
        fee: 3000,
        sqrt_price_x96: encodePriceSqrt(1n, 10n),
        tick_spacing: 60,
      },
      {
        value: toNano('0.1'),
      },
    );
    const poolAddress = await routerContract.getPoolAddress(routerJetton0Wallet, routerJetton1Wallet, 3000n, 60n);
    expect(createPool.transactions).toHaveTransaction({
      from: routerContract.address,
      to: poolAddress,
    });
    const testPool = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(poolAddress));
    const lpAccount = await testPool.getLpAccountAddress(deployer.address, -10n, 10n);
    console.log('LP account address:', lpAccount.toString());
  });

  it('Send op:mint', async () => {
    const routerJetton0Wallet = await token0MasterContract.getWalletAddress(routerContract.address);
    const routerJetton1Wallet = await token1MasterContract.getWalletAddress(routerContract.address);
    let tx = await token0WalletContract.sendTransferMint(
      deployer.getSender(),
      {
        kind: 'OpJettonTransferMint',
        query_id: 0,
        jetton_amount: 9996n,
        to_address: routerContract.address,
        response_address: deployer.address,
        custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
        forward_ton_amount: toNano(0.8),
        either_payload: true,
        mint: {
          kind: 'MintParams',
          forward_opcode: PoolWrapper.Opcodes.Mint,
          jetton1_wallet: routerJetton1Wallet,
          tick_lower: 100,
          tick_upper: 3000,
          tick_spacing: 60,
          fee: 3000,
          liquidity_delta: 3161n,
        },
      },
      {
        value: toNano(1),
      },
    );
    printTransactionFees(tx.transactions);
    prettyLogTransactions(tx.transactions);
  });
});
