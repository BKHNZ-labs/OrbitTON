import { Address, beginCell, Dictionary, toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../wrappers/core/JettonWallet';
import { createPairAddress, isContractDeployed, isToken0 } from './helpers';
import RouterWrapper from '../wrappers/core/Router';
import PoolWrapper from '../wrappers/core/Pool';
import { MAX_SQRT_RATIO, MIN_SQRT_RATIO } from '../wrappers';

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
  const tickSpacing = Number(args.length > 4 ? args[4] : await ui.input('Tick spacing'));
  const feeAmount = Number(args.length > 5 ? args[5] : await ui.input('Fee Amount'));
  const jettonAmount = BigInt(args.length > 6 ? args[6] : await ui.input('Jetton Amount'));
  const zeroForOne =
    (args.length > 7 ? args[7] : await ui.input('Zero for one (true/false)')) === 'true' ? true : false;

  const jetton0MinterContract = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(token0Address));
  const jetton1MinterContract = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(token1Address));
  let routerJetton0Wallet = await jetton0MinterContract.getWalletAddress(routerAddress);
  let routerJetton1Wallet = await jetton1MinterContract.getWalletAddress(routerAddress);
  let jetton0Wallet = await jetton0MinterContract.getWalletAddress(userAddress);
  let jetton1Wallet = await jetton1MinterContract.getWalletAddress(userAddress);
  let routerJetton0WalletContract;
  let routerJetton1WalletContract;
  let swapJetton0WalletContract;
  let swapJetton1WalletContract;
  let isSwap =
    BigInt(`0x${beginCell().storeAddress(routerJetton0Wallet).endCell().hash().toString('hex')}`) <
    BigInt(`0x${beginCell().storeAddress(routerJetton1Wallet).endCell().hash().toString('hex')}`);
  if (isSwap) {
    routerJetton0WalletContract = provider.open(
      JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0Wallet),
    );
    routerJetton1WalletContract = provider.open(
      JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1Wallet),
    );
    swapJetton0WalletContract = provider.open(JettonWalletWrapper.JettonWallet.createFromAddress(jetton0Wallet));
    swapJetton1WalletContract = provider.open(JettonWalletWrapper.JettonWallet.createFromAddress(jetton1Wallet));
  } else {
    routerJetton0WalletContract = provider.open(
      JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1Wallet),
    );
    routerJetton1WalletContract = provider.open(
      JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0Wallet),
    );
    swapJetton0WalletContract = provider.open(JettonWalletWrapper.JettonWallet.createFromAddress(jetton1Wallet));
    swapJetton1WalletContract = provider.open(JettonWalletWrapper.JettonWallet.createFromAddress(jetton0Wallet));
  }

  let swapTx;
  if (zeroForOne) {
    swapTx = await swapJetton0WalletContract!.sendTransferSwap(
      provider.sender(),
      {
        kind: 'OpJettonTransferSwap',
        query_id: 0,
        jetton_amount: jettonAmount,
        to_address: routerAddress,
        response_address: userAddress,
        custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
        forward_ton_amount: toNano(2.0),
        either_payload: true,
        swap: {
          kind: 'SwapParams',
          forward_opcode: PoolWrapper.Opcodes.Swap,
          fee: feeAmount,
          jetton1_wallet: routerJetton1WalletContract!.address,
          //eslint-di
          sqrt_price_limit: MIN_SQRT_RATIO + 1n,
          tick_spacing: tickSpacing,
          zero_for_one: zeroForOne ? -1 : 0,
        },
      },
      {
        value: toNano(2.5),
      },
    );
  } else {
    swapTx = await swapJetton1WalletContract!.sendTransferSwap(
      provider.sender(),
      {
        kind: 'OpJettonTransferSwap',
        query_id: 0,
        jetton_amount: jettonAmount,
        to_address: routerAddress,
        response_address: userAddress,
        custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
        forward_ton_amount: toNano(2.0),
        either_payload: true,
        swap: {
          kind: 'SwapParams',
          forward_opcode: PoolWrapper.Opcodes.Swap,
          fee: feeAmount,
          jetton1_wallet: routerJetton0WalletContract!.address,
          //eslint-di
          sqrt_price_limit: MAX_SQRT_RATIO - 1n,
          tick_spacing: tickSpacing,
          zero_for_one: zeroForOne ? -1 : 0,
        },
      },
      {
        value: toNano(2.5),
      },
    );
  }
  ui.write(`Swap tx: ${swapTx}`);
}
