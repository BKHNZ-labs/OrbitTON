import { NetworkProvider, UIProvider } from '@ton/blueprint';
import { Address, beginCell } from '@ton/core';

export async function isContractDeployed(
  provider: NetworkProvider,
  address: Address,
  ui: UIProvider,
): Promise<boolean> {
  if (!(await provider.isContractDeployed(address))) {
    ui.write(`Error: Contract at address ${address} is not deployed!`);
    return false;
  }

  return true;
}

export function createPairAddress(token0: Address, token1: Address): [Address, Address] {
  if (
    BigInt(`0x${beginCell().storeAddress(token0).endCell().hash().toString('hex')}`) <
    BigInt(`0x${beginCell().storeAddress(token1).endCell().hash().toString('hex')}`)
  ) {
    return [token0, token1];
  }
  return [token1, token0];
}

export function isToken0(token0: Address, token1: Address): boolean {
  return (
    BigInt(`0x${beginCell().storeAddress(token0).endCell().hash().toString('hex')}`) <
    BigInt(`0x${beginCell().storeAddress(token1).endCell().hash().toString('hex')}`)
  );
}
