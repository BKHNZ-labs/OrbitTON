import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  fromNano,
  toNano,
  TonClient4,
  Transaction,
  TransactionComputeVm,
  WalletContractV4,
} from '@ton/ton';
import { Blockchain, printTransactionFees, RemoteBlockchainStorage, wrapTonClient4ForRemote } from '@ton/sandbox';
import { JettonMinterWrapper, JettonWalletWrapper, MIN_SQRT_RATIO, PoolWrapper } from '../wrappers';
import { mnemonicToWalletKey } from '@ton/crypto';
import { compile } from '@ton/blueprint';
import { JETTON_WALLET_BOC } from '../wrappers/helpers';
let printTxGasStats: (name: string, trans: Transaction) => bigint;
let computedGeneric: (transaction: Transaction) => TransactionComputeVm;
let getOp: (transaction: Transaction) => number | 'N/A' | 'no body';

computedGeneric = (transaction) => {
  if (transaction.description.type !== 'generic') throw 'Expected generic transactionaction';
  if (transaction.description.computePhase.type !== 'vm') throw 'Compute phase expected';
  return transaction.description.computePhase;
};
printTxGasStats = (name, transaction) => {
  const txComputed = computedGeneric(transaction);
  console.log(`${name} used ${txComputed.gasUsed} gas`);
  console.log(`${name} gas cost: ${txComputed.gasFees}`);
  return txComputed.gasUsed;
};

getOp = (transaction) => {
  if (transaction.description.type !== 'generic') return 'N/A';
  const body = transaction.inMessage?.info.type === 'internal' ? transaction.inMessage?.body.beginParse() : 'N/A';
  const op = body === 'N/A' ? 'N/A' : body.remainingBits >= 32 ? body.preloadUint(32) : 'no body';
  return op;
};

(async () => {
  const privateKey =
    'good sponsor board caution industry power split seat cereal improve release leader pull nominee farm copy creek brand measure general glove mystery size supply';

  const blockchain = await Blockchain.create({
    storage: new RemoteBlockchainStorage(
      wrapTonClient4ForRemote(
        new TonClient4({
          endpoint: 'https://mainnet-v4.tonhubapi.com',
          // await getHttpV4Endpoint({
          //   network: 'mainnet',
          // }),
        }),
      ),
    ),
  });
  const JETTON_STABLE_BOC =
    'b5ee9c7241020f010003d1000114ff00f4a413f4bcf2c80b01020162050202012004030021bc508f6a2686981fd007d207d2068af81c0027bfd8176a2686981fd007d207d206899fc152098402f8d001d0d3030171b08e48135f038020d721ed44d0d303fa00fa40fa40d104d31f01840f218210178d4519ba0282107bdd97deba12b1f2f48040d721fa003012a0401303c8cb0358fa0201cf1601cf16c9ed54e0fa40fa4031fa0031f401fa0031fa00013170f83a02d31f012082100f8a7ea5ba8e85303459db3ce0330c0602d0228210178d4519ba8e84325adb3ce034218210595f07bcba8e843101db3ce032208210eed236d3ba8e2f30018040d721d303d1ed44d0d303fa00fa40fa40d1335142c705f2e04a403303c8cb0358fa0201cf1601cf16c9ed54e06c218210d372158cbadc840ff2f0080701f2ed44d0d303fa00fa40fa40d106d33f0101fa00fa40f401d15141a15288c705f2e04926c2fff2afc882107bdd97de01cb1f5801cb3f01fa0221cf1658cf16c9c8801801cb0526cf1670fa02017158cb6accc903f839206e943081169fde718102f270f8380170f836a0811a7770f836a0bcf2b0028050fb00030903f4ed44d0d303fa00fa40fa40d12372b0c002f26d07d33f0101fa005141a004fa40fa4053bac705f82a5464e070546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c9f9007074c8cb02ca07cbffc9d0500cc7051bb1f2e04a09fa0021925f04e30d26d70b01c000b393306c33e30d55020b0a09002003c8cb0358fa0201cf1601cf16c9ed54007a5054a1f82fa07381040982100966018070f837b60972fb02c8801001cb055005cf1670fa027001cb6a8210d53276db01cb1f5801cb3fc9810082fb00590060c882107362d09c01cb1f2501cb3f5004fa0258cf1658cf16c9c8801001cb0524cf1658fa02017158cb6accc98011fb0001f203d33f0101fa00fa4021fa4430c000f2e14ded44d0d303fa00fa40fa40d15309c7052471b0c00021b1f2ad522bc705500ab1f2e0495115a120c2fff2aff82a54259070546004131503c8cb0358fa0201cf1601cf16c921c8cb0113f40012f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f401fa00200d019820d70b009ad74bc00101c001b0f2b19130e2c88210178d451901cb1f500a01cb3f5008fa0223cf1601cf1626fa025007cf16c9c8801801cb055004cf1670fa024063775003cb6bccccc945370e00b42191729171e2f839206e938124279120e2216e94318128739101e25023a813a0738103a370f83ca00270f83612a00170f836a07381040982100966018070f837a0bcf2b0048050fb005803c8cb0358fa0201cf1601cf16c9ed5401f9319e';
  const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
  const cell = Cell.fromBoc(Buffer.from(JETTON_STABLE_BOC, 'hex'))[0];
  const jettonWallet = Cell.fromBoc(Buffer.from(JETTON_WALLET_BOC, 'hex'))[0];
  console.log(cell.hash().toString('hex'));
  console.log(BigInt(`0x${cell.hash().toString('hex')}`));
  _libs.set(BigInt(`0x${cell.hash().toString('hex')}`), cell);
  const libs = beginCell().storeDictDirect(_libs).endCell();
  blockchain.libs = libs;
  const key = await mnemonicToWalletKey(privateKey.split(' '));

  const wallet = blockchain.openContract(WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 }));

  const poolContract = blockchain.openContract(
    PoolWrapper.PoolTest.createFromAddress(Address.parse('EQCM4jmevo0qweIoGBUZttRjrntUqeeR6bWN9KxvJKLcaM3E')),
  );

  const poolInfo = await poolContract.getPoolInfo();

  const tokenMaster0 = blockchain.openContract(
    JettonMinterWrapper.JettonMinter.createFromAddress(
      Address.parse('EQCZiyw3QupCvltBs9PoFvWpQKDi3a0K1HDpye9xrirex5YT'),
    ),
  );
  const tokenMaster1 = blockchain.openContract(
    JettonMinterWrapper.JettonMinter.createFromAddress(
      Address.parse('EQBCrJ8HVBkWq1NchEX1vqRiHn8VSOD12a_7DgjRd4EZj7Ip'),
    ),
  );

  const tokenWallet0 = await tokenMaster0.getWalletAddress(
    Address.parse('UQD2i2y446Dg05agnkg_8Kmg6WKiZD3M6g1MMc_Sl71iNzGQ'),
  );
  const tokenWallet1 = await tokenMaster1.getWalletAddress(
    Address.parse('UQD2i2y446Dg05agnkg_8Kmg6WKiZD3M6g1MMc_Sl71iNzGQ'),
  );

  const routerWallet0 = await tokenMaster0.getWalletAddress(
    Address.parse('EQAIkK18Xrl2J-SXWEHbF8B8SccXKc4OkNIjMDsEQUboaTxy'),
  );
  const routerWallet1 = await tokenMaster1.getWalletAddress(
    Address.parse('EQAIkK18Xrl2J-SXWEHbF8B8SccXKc4OkNIjMDsEQUboaTxy'),
  );

  const tokenWallet0Contract = blockchain.openContract(
    JettonWalletWrapper.JettonWallet.createFromAddress(tokenWallet0),
  );
  const tokenWallet1Contract = blockchain.openContract(
    JettonWalletWrapper.JettonWallet.createFromAddress(tokenWallet1),
  );

  const binancUsdt = blockchain.openContract(
    JettonWalletWrapper.JettonWallet.createFromAddress(
      Address.parse('EQC1ev1N0Qyuq91aZzgzegd40WRpVSFCE5yRzvN0XI8EhZd8'),
    ),
  );
  console.log(
    await binancUsdt.getWalletData(),
    // await tokenWallet0Contract.getWalletData(),
    // await tokenWallet1Contract.getWalletData(),
  );
  const router0WalletContract = blockchain.openContract(
    JettonWalletWrapper.JettonWallet.createFromAddress(routerWallet0),
  );
  const router1WalletContract = blockchain.openContract(
    JettonWalletWrapper.JettonWallet.createFromAddress(routerWallet1),
  );

  const sender = (await wallet.sender(key.secretKey)).result;
  const router = Address.parse('EQAIkK18Xrl2J-SXWEHbF8B8SccXKc4OkNIjMDsEQUboaTxy');
  const transfer0 = await tokenWallet0Contract.sendTransferMint(
    sender,
    {
      kind: 'OpJettonTransferMint',
      query_id: 0,
      jetton_amount: BigInt(9996),
      to_address: Address.parse('EQAIkK18Xrl2J-SXWEHbF8B8SccXKc4OkNIjMDsEQUboaTxy'),
      response_address: wallet.address,
      custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
      forward_ton_amount: toNano(0.8),
      either_payload: true,
      mint: {
        kind: 'MintParams',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerWallet1,
        tick_lower: Number(-887220),
        tick_upper: Number(887220),
        tick_spacing: Number(poolInfo.tickSpacing),
        fee: Number(poolInfo.fee),
        liquidity_delta: BigInt(3161),
      },
    },
    {
      value: toNano(1),
    },
  );

  const transfer1 = await tokenWallet1Contract.sendTransferMint(
    sender,
    {
      kind: 'OpJettonTransferMint',
      query_id: 0,
      jetton_amount: BigInt(2000),
      to_address: Address.parse('EQAIkK18Xrl2J-SXWEHbF8B8SccXKc4OkNIjMDsEQUboaTxy'),
      response_address: wallet.address,
      custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
      forward_ton_amount: toNano(0.5),
      either_payload: true,
      mint: {
        kind: 'MintParams',
        forward_opcode: PoolWrapper.Opcodes.Mint,
        jetton1_wallet: routerWallet0,
        tick_lower: Number(-887220),
        tick_upper: Number(887220),
        tick_spacing: Number(poolInfo.tickSpacing),
        fee: Number(poolInfo.fee),
        liquidity_delta: BigInt(3161),
      },
    },
    {
      value: toNano(0.7),
    },
  );
  const walletBalanceBefore = await wallet.getBalance();

  console.log(await poolContract.getPoolInfo());
  const swapTx = await tokenWallet0Contract.sendTransferSwap(
    sender,
    {
      kind: 'OpJettonTransferSwap',
      query_id: 0,
      jetton_amount: 10000n,
      to_address: router,
      response_address: sender.address!,
      custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
      forward_ton_amount: toNano(0.09),
      either_payload: true,
      swap: {
        kind: 'SwapParams',
        forward_opcode: PoolWrapper.Opcodes.Swap,
        fee: 3000,
        jetton1_wallet: routerWallet1,
        sqrt_price_limit: MIN_SQRT_RATIO,
        tick_spacing: 60,
        zero_for_one: -1,
      },
    },
    {
      value: toNano(0.13),
    },
  );
  printTransactionFees(swapTx.transactions);
  console.log(await poolContract.getPoolInfo());
  const walletBalanceAfter = await wallet.getBalance();
  console.log('BalanceDiff', fromNano(walletBalanceBefore - walletBalanceAfter));
})();
