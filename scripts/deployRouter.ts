import { toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { compile, NetworkProvider } from '@ton/blueprint';
import RouterWrapper from '../wrappers/core/Router';

export async function run(provider: NetworkProvider) {
  const routerCode = await compile('Router');
  const batchTickCode = await compile('BatchTick');
  const lpAccountCode = await compile('LpAccount');

  const router = provider.open(
    RouterWrapper.RouterTest.create(routerCode, {
      adminAddress: provider.sender().address!,
      batchTickCode: batchTickCode,
      lpAccountCode: lpAccountCode,
      positionCode: await compile('Position'),
      poolCode: await compile('Pool'),
    }),
  );

  await router.sendDeploy(provider.sender(), toNano('0.05'));
  await provider.waitForDeploy(router.address);
  console.log('Router address', router.address);
}
