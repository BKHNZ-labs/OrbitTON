import { Address, toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../wrappers/core/JettonWallet';
import { isContractDeployed } from './helpers';

export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();

  const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Jetton Minter address'));
  if (!(await isContractDeployed(provider, address, ui))) return;
  const userAddress = Address.parse(args.length > 1 ? args[1] : await ui.input('User address'));
  const amount = args.length > 2 ? args[2] : await ui.input('Amount');

  const jettonMinter = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(address));
  const jettonWallet = await jettonMinter.getWalletAddress(userAddress);
  const jettonWalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(jettonWallet);
  const jettonWalletContract = provider.open(jettonWalletInstance);
  const beforeJettonBalance = await jettonWalletContract.getBalance();

  await jettonMinter.sendMint(
    provider.sender(),
    {
      toAddress: userAddress,
      jettonAmount: toNano(amount),
      amount: toNano(0.5),
    },
    {
      queryId: 0,
      value: toNano(1),
    },
  );

  ui.write('Waiting for jetton master to mint...');

  let afterJettonBalance = await jettonWalletContract.getBalance();
  let attempt = 1;
  while (afterJettonBalance.amount === beforeJettonBalance.amount) {
    ui.setActionPrompt(`Attempt ${attempt}`);
    await sleep(2000);
    afterJettonBalance = await jettonWalletContract.getBalance();
    attempt++;
  }

  ui.clearActionPrompt();
  ui.write('Jetton minted successfully!');
}
