import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import RouterWrapper from '../wrappers/core/Router';
import PTonMinterWrapper from '../wrappers/core/PTonMinter';

export async function run(provider: NetworkProvider) {
  const router = provider.open(
    RouterWrapper.RouterTest.createFromAddress(Address.parse("EQCUjc3HQ5T56UY8uYm_b0FMY68uOK8OT67wVwmUXdnLMAq9")),
  );

  const pTonMaster = provider.open(
    PTonMinterWrapper.PTonMinterV2.createPtonMinterFromAddress(Address.parse("kQBnGWMCf3-FZZq1W4IWcWiGAc3PHuZ0_H-7sad2oY00o3ZY")),
  );

  const routerPTONAddress = await pTonMaster.getWalletAddress(router.address!);
  console.log('Router PTON address', routerPTONAddress);

  const routerPTONWallet = provider.open(
    PTonMinterWrapper.PTonMinterV2.createFromAddress(routerPTONAddress),
  );
  console.log('Router PTON wallet address', routerPTONWallet.address);

  await pTonMaster.sendDeployWallet(provider.sender(), {
    ownerAddress: router.address!,
    excessesAddress: provider.sender().address
  });
  console.log('Sender address', provider.sender().address);
  await provider.waitForDeploy(routerPTONWallet.address);
}
