import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { isContractDeployed } from './helpers';
import { PositionWrapper } from '../wrappers';

export async function run(provider: NetworkProvider, args: string[]) {
  const ui = provider.ui();
  const userAddress = provider.sender().address!;

  // address contract need
  const positionAddress = Address.parse(args.length > 0 ? args[0] : await ui.input('Position address'));
  if (!(await isContractDeployed(provider, positionAddress, ui))) return;
  const liquidityDelta = BigInt(args.length > 1 ? args[1] : await ui.input('Liquidity delta'));

  const positionContract = provider.open(PositionWrapper.Position.createFromAddress(positionAddress));

  await positionContract.sendBurnPosition(provider.sender(), toNano(1), liquidityDelta);
  ui.write(`Position removed successfully!`);
}
