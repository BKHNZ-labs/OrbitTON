import {
  Blockchain,
  prettyLogTransaction,
  prettyLogTransactions,
  printTransactionFees,
  SandboxContract,
  TreasuryContract,
} from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';
import { JettonWallet } from '@ton/ton';
import PoolWrapper from '../../wrappers/core/Pool';

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

  it('Send op:mint', async () => {
    const routerJetton0Wallet = await token0MasterContract.getWalletAddress(routerContract.address);
    console.log('Router address:', routerContract.address.toString());
    console.log('Router wallet address', routerJetton0Wallet.toString());
    console.log('Router admin:', await routerContract.getAdminAddress());
    console.log('Start transfer');
    let tx = await token0WalletContract.sendTransfer(
      deployer.getSender(),
      {
        kind: 'OpJettonTransfer',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerJetton0Wallet,
        fwd_amount: toNano(0.3),
        jetton_amount: toNano(1000),
        response_address: deployer.address,
        query_id: 0,
        to_address: routerContract.address,
        mint: {
          kind: 'MintParams',
          fee: 3000,
          liquidity_delta: 0n,
          recipient: deployer.address,
          sqrt_price_x96: 100n,
          tick_lower: 1000,
          tick_upper: 2000,
          tick_spacing: 300,
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
