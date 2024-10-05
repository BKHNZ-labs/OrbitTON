import { toNano } from '@ton/core';
import { LiquidityMathTest } from '../wrappers/LiquidityMathTest';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const liquidityMathTest = provider.open(LiquidityMathTest.createFromConfig({}, await compile('LiquidityMathTest')));

    await liquidityMathTest.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(liquidityMathTest.address);

    // run methods on `liquidityMathTest`
}
