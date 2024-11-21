import { NetworkProvider, sleep } from '@ton/blueprint';
import ToncoWrapper from '../wrappers/core/Tonco';
import { Address } from '@ton/core';

export async function run(provider: NetworkProvider, args: string[]) {
  const poolAddress = Address.parse('EQBfAq2ed5QzmXZ9x12rOCzM1PXxCvsysUZtpURu6g4JxsM5');
  const tonco = provider.open(ToncoWrapper.ToncoTest.createFromAddress(poolAddress));
  await tonco.getPoolStateAndConfiguration();
}
