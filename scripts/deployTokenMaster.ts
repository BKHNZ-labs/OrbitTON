import { beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';

export async function run(provider: NetworkProvider) {
  const token0MasterContract = provider.open(
    JettonMinterWrapper.JettonMinter.createFromConfig({
      adminAddress: provider.sender().address!,
      content: beginCell().storeBuffer(Buffer.from('Token1')).endCell(),
    }),
  );

  await token0MasterContract.sendDeploy(provider.sender(), {
    value: toNano('0.05'),
  });
  await provider.waitForDeploy(token0MasterContract.address);
  console.log('Token0 master address', token0MasterContract.address);
}
