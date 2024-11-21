import { Address, beginCell, Dictionary, toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../wrappers/core/JettonWallet';
import { createPairAddress, isContractDeployed, isToken0 } from './helpers';
import RouterWrapper from '../wrappers/core/Router';
import { encodePriceSqrt } from '../tests/shared/utils';
import PoolWrapper from '../wrappers/core/Pool';

export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();
  const userAddress = provider.sender().address!;

  // address contract need
  const routerAddress = Address.parse(args.length > 0 ? args[0] : await ui.input('Router address'));
  if (!(await isContractDeployed(provider, routerAddress, ui))) return;
  const token0Address = Address.parse(args.length > 1 ? args[1] : await ui.input('Token0 address'));
  if (!(await isContractDeployed(provider, token0Address, ui))) return;
  const token1Address = Address.parse(args.length > 2 ? args[2] : await ui.input('Token1 address'));
  if (!(await isContractDeployed(provider, token1Address, ui))) return;
  const poolAddress = Address.parse(args.length > 3 ? args[3] : await ui.input('Pool address'));
  if (!(await isContractDeployed(provider, poolAddress, ui))) return;

  console.log('need to swap ?: ', isToken0(token0Address, token1Address));

  const [jettonMaster0Address, jettonMaster1Address] = createPairAddress(token0Address, token1Address);
  const jettonMinter0 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(jettonMaster0Address));
  const jettonMinter1 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(jettonMaster1Address));
  const jettonWallet0 = await jettonMinter0.getWalletAddress(userAddress);
  const jettonWallet1 = await jettonMinter1.getWalletAddress(userAddress);
  const jettonWallet0Instance = JettonWalletWrapper.JettonWallet.createFromAddress(jettonWallet0);
  const jettonWallet1Instance = JettonWalletWrapper.JettonWallet.createFromAddress(jettonWallet1);
  const jettonWallet0Contract = provider.open(jettonWallet0Instance);
  const jettonWallet1Contract = provider.open(jettonWallet1Instance);

  console.log('jettonWallet0: ', jettonWallet0);
  console.log('jettonWallet1: ', jettonWallet1);

  const routerJetton0Wallet = await jettonMinter0.getWalletAddress(routerAddress);
  const routerJetton1Wallet = await jettonMinter1.getWalletAddress(routerAddress);

  const pool = provider.open(PoolWrapper.PoolTest.createFromAddress(poolAddress));
  const lpAccount = await pool.getLpAccountAddress(userAddress, -887220n, 887220n);
  console.log('lpAccount: ', lpAccount);

  console.log(await isContractDeployed(provider, lpAccount, ui));

  const poolInfo = await pool.getPoolInfo();
  const beforePositionSeq = await pool.getPositionSeqno();
  console.log('beforePositionSeq: ', beforePositionSeq);

  ui.clearActionPrompt();
  ui.write(`Position added successfully!`);
}
