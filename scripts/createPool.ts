import { Address, toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../wrappers/core/JettonWallet';
import { isContractDeployed } from './helpers';
import RouterWrapper from '../wrappers/core/Router';
import { encodePriceSqrt } from '../tests/shared/utils';

export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();

  // address contract need
  const routerAddress = Address.parse(args.length > 0 ? args[0] : await ui.input('Router address'));
  if (!(await isContractDeployed(provider, routerAddress, ui))) return;
  const token0Address = Address.parse(args.length > 1 ? args[1] : await ui.input('Token0 address'));
  if (!(await isContractDeployed(provider, token0Address, ui))) return;
  const token1Address = Address.parse(args.length > 2 ? args[2] : await ui.input('Token1 address'));
  if (!(await isContractDeployed(provider, token1Address, ui))) return;
  const feeTier = args.length > 3 ? args[3] : await ui.input('Fee tier');
  const tickSpacing = args.length > 4 ? args[4] : await ui.input('Tick spacing');
  ui.write('Input 2 reserves to get the init price');
  const reserve0 = args.length > 5 ? args[5] : await ui.input('Reserve0');
  const reserve1 = args.length > 6 ? args[6] : await ui.input('Reserve1');

  const jettonMinter0 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(token0Address));
  const jettonMinter1 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(token1Address));
  const routerJettonWallet0 = await jettonMinter0.getWalletAddress(routerAddress);
  const routerJettonWallet1 = await jettonMinter1.getWalletAddress(routerAddress);

  const router = provider.open(RouterWrapper.RouterTest.createFromAddress(routerAddress));
  await router.sendCreatePool(
    provider.sender(),
    {
      kind: 'OpCreatePool',
      query_id: 0,
      jetton0_wallet: routerJettonWallet0,
      jetton1_wallet: routerJettonWallet1,
      fee: Number(feeTier),
      sqrt_price_x96: encodePriceSqrt(BigInt(reserve0), BigInt(reserve1)),
      tick_spacing: Number(tickSpacing),
    },
    {
      value: toNano('0.1'),
    },
  );

  ui.write('Waiting for pool to be created...');
  const poolAddress = await router.getPoolAddress(
    routerJettonWallet0,
    routerJettonWallet1,
    BigInt(feeTier),
    BigInt(tickSpacing),
  );
  await provider.waitForDeploy(poolAddress);

  ui.clearActionPrompt();
  ui.write(`Pool created successfully! Address: ${poolAddress.toString()}`);
}
