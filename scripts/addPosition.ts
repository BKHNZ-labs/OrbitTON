import { Address, beginCell, Dictionary, toNano } from '@ton/core';
// import { Counter } from '../wrappers/Counter';
import { NetworkProvider, sleep } from '@ton/blueprint';
import JettonMinterWrapper from '../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../wrappers/core/JettonWallet';
import { createPairAddress, isContractDeployed, isToken0 } from './helpers';
import RouterWrapper from '../wrappers/core/Router';
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
  const tokenAmount0 = args.length > 4 ? args[4] : await ui.input('Jetton amount 0');
  const tokenAmount1 = args.length > 5 ? args[5] : await ui.input('Jetton amount 1');
  const tickMin = args.length > 6 ? args[6] : await ui.input('Tick lower');
  const tickMax = args.length > 7 ? args[7] : await ui.input('Tick upper');
  const liquidity = args.length > 8 ? args[8] : await ui.input('Liquidity');

  const [jettonMaster0Address, jettonMaster1Address] = createPairAddress(token0Address, token1Address);
  const jettonAmount0 = isToken0(token0Address, token1Address) ? tokenAmount0 : tokenAmount1;
  const jettonAmount1 = isToken0(token0Address, token1Address) ? tokenAmount1 : tokenAmount0;
  const jettonMinter0 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(jettonMaster0Address));
  const jettonMinter1 = provider.open(JettonMinterWrapper.JettonMinter.createFromAddress(jettonMaster1Address));
  const jettonWallet0 = await jettonMinter0.getWalletAddress(userAddress);
  const jettonWallet1 = await jettonMinter1.getWalletAddress(userAddress);
  const jettonWallet0Instance = JettonWalletWrapper.JettonWallet.createFromAddress(jettonWallet0);
  const jettonWallet1Instance = JettonWalletWrapper.JettonWallet.createFromAddress(jettonWallet1);
  const jettonWallet0Contract = provider.open(jettonWallet0Instance);
  const jettonWallet1Contract = provider.open(jettonWallet1Instance);

  const routerJetton0Wallet = await jettonMinter0.getWalletAddress(routerAddress);
  const routerJetton1Wallet = await jettonMinter1.getWalletAddress(routerAddress);

  const pool = provider.open(PoolWrapper.PoolTest.createFromAddress(poolAddress));
  const poolInfo = await pool.getPoolInfo();
  const beforePositionSeq = await pool.getPositionSeqno();

  await jettonWallet0Contract.sendTransferMint(
    provider.sender(),
    {
      kind: 'OpJettonTransferMint',
      query_id: 0,
      jetton_amount: BigInt(jettonAmount0),
      to_address: routerAddress,
      response_address: userAddress,
      custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
      forward_ton_amount: toNano(0.8),
      either_payload: true,
      mint: {
        kind: 'MintParams',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerJetton1Wallet,
        tick_lower: Number(tickMin),
        tick_upper: Number(tickMax),
        tick_spacing: Number(poolInfo.tickSpacing),
        fee: Number(poolInfo.fee),
        liquidity_delta: BigInt(liquidity),
      },
    },
    {
      value: toNano(1),
    },
  );

  const lpAccount = await pool.getLpAccountAddress(userAddress, BigInt(tickMin), BigInt(tickMax));
  await provider.waitForDeploy(lpAccount, 100, 5000);
  ui.write(`LP account address: ${lpAccount.toString()}`);  

  await jettonWallet1Contract.sendTransferMint(
    provider.sender(),
    {
      kind: 'OpJettonTransferMint',
      query_id: 0,
      jetton_amount: BigInt(jettonAmount1),
      to_address: routerAddress,
      response_address: userAddress,
      custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
      forward_ton_amount: toNano(0.8),
      either_payload: true,
      mint: {
        kind: 'MintParams',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerJetton0Wallet,
        tick_lower: Number(tickMin),
        tick_upper: Number(tickMax),
        tick_spacing: Number(poolInfo.tickSpacing),
        fee: Number(poolInfo.fee),
        liquidity_delta: BigInt(liquidity),
      },
    },
    {
      value: toNano(1),
    },
  );

  let afterPositionSeq = await pool.getPositionSeqno();
  let attempts = 1;
  while (beforePositionSeq === afterPositionSeq) {
    ui.setActionPrompt(`Attempt ${attempts}`);
    await sleep(2000);
    afterPositionSeq = await pool.getPositionSeqno();
    attempts++;
  }

  ui.clearActionPrompt();
  ui.write(`Position added successfully!`);
}
