import { Blockchain, printTransactionFees, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import PoolWrapper from '../../wrappers/core/Pool';
import {
  encodePriceSqrt,
  expandTo18Decimals,
  formatPrice,
  formatTokenAmount,
  getMaxLiquidityPerTick,
  getMaxTick, 
  getMinTick,
  filterOutSuccessMessages,
  MAX_SQRT_RATIO,
  MIN_SQRT_RATIO,
} from '../shared/utils';
import { TickMathTest } from '../../wrappers/tests/TickMathTest';
import { FeeAmount, TICK_SPACINGS } from '../libraries/TickTest.spec';
import RouterWrapper from '../../wrappers/core/Router';
import JettonMinterWrapper from '../../wrappers/core/JettonMinter';
import JettonWalletWrapper from '../../wrappers/core/JettonWallet';
import Decimal from 'decimal.js';

describe('OrbitTonPool', () => {
  let poolCode: Cell;
  let lpAccountCode: Cell;
  let tickMathCode: Cell;
  let positionCode: Cell;
  let routerCode: Cell;
  const DEFAULT_POOL_SWAP_TESTS = [
    // swap large amounts in/out
    {
      zeroForOne: true,
      exactOut: false,
      amount0: expandTo18Decimals(1),
    },
    {
      zeroForOne: false,
      exactOut: false,
      amount1: expandTo18Decimals(1),
    },
    {
      zeroForOne: true,
      exactOut: true,
      amount1: expandTo18Decimals(1),
    },
    {
      zeroForOne: false,
      exactOut: true,
      amount0: expandTo18Decimals(1),
    },
    // swap large amounts in/out with a price limit
    {
      zeroForOne: true,
      exactOut: false,
      amount0: expandTo18Decimals(1),
      sqrtPriceLimit: encodePriceSqrt(50n, 100n),
    },
    {
      zeroForOne: false,
      exactOut: false,
      amount1: expandTo18Decimals(1),
      sqrtPriceLimit: encodePriceSqrt(200n, 100n),
    },
    {
      zeroForOne: true,
      exactOut: true,
      amount1: expandTo18Decimals(1),
      sqrtPriceLimit: encodePriceSqrt(50n, 100n),
    },
    {
      zeroForOne: false,
      exactOut: true,
      amount0: expandTo18Decimals(1),
      sqrtPriceLimit: encodePriceSqrt(200n, 100n),
    },
    // swap small amounts in/out
    {
      zeroForOne: true,
      exactOut: false,
      amount0: 1000,
    },
    {
      zeroForOne: false,
      exactOut: false,
      amount1: 1000,
    },
    {
      zeroForOne: true,
      exactOut: true,
      amount1: 1000,
    },
    {
      zeroForOne: false,
      exactOut: true,
      amount0: 1000,
    },
    // swap arbitrary input to price
    {
      sqrtPriceLimit: encodePriceSqrt(5n, 2n),
      amount1: toNano(50_000_000_000),
      zeroForOne: false,
    },
    {
      sqrtPriceLimit: encodePriceSqrt(2n, 5n),
      amount0: toNano(50_000_000_000),
      zeroForOne: true,
    },
    {
      sqrtPriceLimit: encodePriceSqrt(5n, 2n),
      amount0: toNano(50_000_000_000),
      zeroForOne: true,
    },
    {
      sqrtPriceLimit: encodePriceSqrt(2n, 5n),
      amount1: toNano(50_000_000_000),
      zeroForOne: false,
    },
  ];

  const POOL_SWAP_TESTS_FILTER_EXACT_OUT = DEFAULT_POOL_SWAP_TESTS.filter((test) => !test.exactOut);
  // .slice(0, 1);

  const TEST_POOLS = [
    {
      description: 'low fee, 1:1 price, 2e18 max range liquidity',
      feeAmount: FeeAmount.LOW,
      tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.LOW]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.LOW]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, 1:1 price, 2e18 max range liquidity',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'high fee, 1:1 price, 2e18 max range liquidity',
      feeAmount: FeeAmount.HIGH,
      tickSpacing: TICK_SPACINGS[FeeAmount.HIGH],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, 10:1 price, 2e18 max range liquidity',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(10n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, 1:10 price, 2e18 max range liquidity',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 10n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, 1:1 price, 0 liquidity, all liquidity around current price',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: -TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: expandTo18Decimals(2),
        },
        {
          tickLower: TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, 1:1 price, additional liquidity around current price',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: -TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: expandTo18Decimals(2),
        },
        {
          tickLower: TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'low fee, large liquidity around current price (stable swap)',
      feeAmount: FeeAmount.LOW,
      tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: -TICK_SPACINGS[FeeAmount.LOW],
          tickUpper: TICK_SPACINGS[FeeAmount.LOW],
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, token0 liquidity only',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: 0,
          tickUpper: 2000 * TICK_SPACINGS[FeeAmount.MEDIUM],
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'medium fee, token1 liquidity only',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: -2000 * TICK_SPACINGS[FeeAmount.MEDIUM],
          tickUpper: 0,
          liquidity: expandTo18Decimals(2),
        },
      ],
    },
    {
      description: 'close to max price',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(2n ** 127n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals('0.000000000000002'),
        },
      ],
    },
    {
      description: 'close to min price',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 2n ** 127n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals('0.000000000000002'),
        },
      ],
    },
    {
      description: 'max full range liquidity at 1:1 price with default fee',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: encodePriceSqrt(1n, 1n),
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: getMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.MEDIUM]) / 1000000000000n,
        },
      ],
    },
    {
      description: 'initialized at the max ratio',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: 1461446703485210103287273052203988822378723970341n,
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: expandTo18Decimals('0.000000000000002'),
        },
      ],
    },
    {
      description: 'initialized at the min ratio',
      feeAmount: FeeAmount.MEDIUM,
      tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
      startingPrice: MIN_SQRT_RATIO,
      positions: [
        {
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          liquidity: 72247893771157503n / 100000000000000n,
        },
      ],
    },
  ];
  // .filter((test) => test.description === "close to max price");

  function swapCaseToDescription(testCase: any): string {
    const priceClause = testCase?.sqrtPriceLimit ? ` to price ${formatPrice(testCase.sqrtPriceLimit)}` : '';
    if ('exactOut' in testCase) {
      if (testCase.exactOut) {
        if (testCase.zeroForOne) {
          return `swap token0 for exactly ${formatTokenAmount(testCase.amount1)} token1${priceClause}`;
        } else {
          return `swap token1 for exactly ${formatTokenAmount(testCase.amount0)} token0${priceClause}`;
        }
      } else {
        if (testCase.zeroForOne) {
          return `swap exactly ${formatTokenAmount(testCase.amount0)} token0 for token1${priceClause}`;
        } else {
          return `swap exactly ${formatTokenAmount(testCase.amount1)} token1 for token0${priceClause}`;
        }
      }
    } else {
      if (testCase.zeroForOne) {
        return `swap token0 for token1${priceClause}`;
      } else {
        return `swap token1 for token0${priceClause}`;
      }
    }
  }

  beforeAll(async () => {
    poolCode = await compile('Pool');
    lpAccountCode = await compile('LpAccount');
    tickMathCode = await compile('TickMathTest');
    positionCode = await compile('Position');
    routerCode = await compile('Router');
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let router: SandboxContract<RouterWrapper.RouterTest>;
  let token0MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let token1MasterContract: SandboxContract<JettonMinterWrapper.JettonMinter>;
  let token1WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
  let pool: SandboxContract<PoolWrapper.PoolTest>;
  let tickMath: SandboxContract<TickMathTest>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    router = blockchain.openContract(
      RouterWrapper.RouterTest.create(routerCode, {
        adminAddress: deployer.address,
        lpAccountCode: lpAccountCode,
        positionCode: positionCode,
        poolCode: poolCode,
      }),
    );
    tickMath = blockchain.openContract(TickMathTest.createFromData(tickMathCode, beginCell().endCell()));
    await tickMath.sendDeploy(deployer.getSender(), toNano('0.05'));

    token0MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token0')).endCell(),
      }),
    );
    token1MasterContract = blockchain.openContract(
      JettonMinterWrapper.JettonMinter.createFromConfig({
        adminAddress: deployer.address,
        content: beginCell().storeBuffer(Buffer.from('Token1')).endCell(),
      }),
    );
    let deployResult = await router.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      deploy: true,
      success: true,
    });
    deployResult = await token0MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token0MasterContract.address,
      deploy: true,
      success: true,
    });
    deployResult = await token1MasterContract.sendDeploy(deployer.getSender(), {
      value: toNano('0.05'),
    });
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: token1MasterContract.address,
      deploy: true,
      success: true,
    });
    await token0MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: expandTo18Decimals('5000000'),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );
    await token1MasterContract.sendMint(
      deployer.getSender(),
      {
        toAddress: deployer.address,
        jettonAmount: expandTo18Decimals('5000000'),
        amount: toNano(0.5), // deploy fee
      },
      {
        queryId: 0,
        value: toNano(1),
      },
    );

    const token0Wallet = await token0MasterContract.getWalletAddress(deployer.address);
    const token0WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token0Wallet);
    token0WalletContract = blockchain.openContract(token0WalletInstance);

    const token1Wallet = await token1MasterContract.getWalletAddress(deployer.address);
    const token1WalletInstance = JettonWalletWrapper.JettonWallet.createFromAddress(token1Wallet);
    token1WalletContract = blockchain.openContract(token1WalletInstance);
  });

  it('should deploy successfully', async () => {
    console.log(router.address);
  });

  describe('swap tests', () => {
    for (const poolCase of TEST_POOLS) {
      describe(poolCase.description, () => {
        const poolFixtures = async () => {
          let routerJetton0WalletContract;
          let routerJetton1WalletContract;
          let swapToken0Wallet;
          let swapToken1Wallet;
          let poolBalance0;
          let poolBalance1;
          let poolInfoBefore: {
            fee: bigint;
            tickSpacing: bigint;
            tick: bigint;
            sqrtPriceX96: bigint;
            liquidity: bigint;
          };

          const feeAmount = poolCase.feeAmount;
          const tickSpacing = poolCase.tickSpacing;
          const startingSqrtPrice = poolCase.startingPrice;

          const routerJetton0Wallet = await token0MasterContract.getWalletAddress(router.address);
          console.log('Router wallet address', routerJetton0Wallet.toString());
          const routerJetton1Wallet = await token1MasterContract.getWalletAddress(router.address);
          console.log('Router wallet address', routerJetton1Wallet.toString());
          const createPool = await router.sendCreatePool(
            deployer.getSender(),
            {
              kind: 'OpCreatePool',
              query_id: 0,
              jetton0_wallet: routerJetton0Wallet,
              jetton1_wallet: routerJetton1Wallet,
              fee: feeAmount,
              sqrt_price_x96: startingSqrtPrice,
              tick_spacing: tickSpacing,
              jetton_master_ref: {
                kind: 'JettonMasterRef',
                jetton0_master: token0MasterContract.address,
                jetton1_master: token1MasterContract.address,
              },
            },
            {
              value: toNano('0.2'),
            },
          );
          const pool = await router.getPoolAddress(
            routerJetton0Wallet,
            routerJetton1Wallet,
            BigInt(feeAmount),
            BigInt(tickSpacing),
          );
          console.log('createPool');
          printTransactionFees(createPool.transactions);

          const poolContract = blockchain.openContract(PoolWrapper.PoolTest.createFromAddress(pool));
          for (const position of poolCase.positions) {
            let jettonAmount0 = expandTo18Decimals('50000');
            let jettonAmount1 = expandTo18Decimals('50000');

            let transfer0;
            let transfer1;
            let isSwap =
              BigInt(`0x${beginCell().storeAddress(routerJetton0Wallet).endCell().hash().toString('hex')}`) <
              BigInt(`0x${beginCell().storeAddress(routerJetton1Wallet).endCell().hash().toString('hex')}`);
            console.log((await token0WalletContract.getBalance()).amount);
            console.log((await token1WalletContract.getBalance()).amount);

            if (isSwap) {
              transfer0 = await token0WalletContract.sendTransferMint(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferMint',
                  query_id: 0,
                  jetton_amount: jettonAmount0,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(1),
                  either_payload: true,
                  mint: {
                    kind: 'MintParams',
                    forward_opcode: PoolWrapper.Opcodes.Mint,
                    jetton1_wallet: routerJetton1Wallet,
                    tick_lower: position.tickLower,
                    tick_upper: position.tickUpper,
                    tick_spacing: tickSpacing,
                    fee: feeAmount,
                    liquidity_delta: position.liquidity,
                  },
                },
                {
                  value: toNano(1.6),
                },
              );

              transfer1 = await token1WalletContract.sendTransferMint(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferMint',
                  query_id: 0,
                  jetton_amount: jettonAmount1,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(1.2),
                  either_payload: true,
                  mint: {
                    kind: 'MintParams',
                    forward_opcode: PoolWrapper.Opcodes.Mint,
                    jetton1_wallet: routerJetton0Wallet,
                    tick_lower: position.tickLower,
                    tick_upper: position.tickUpper,
                    tick_spacing: tickSpacing,
                    fee: feeAmount,
                    liquidity_delta: position.liquidity,
                  },
                },
                {
                  value: toNano(1.6),
                },
              );
              routerJetton0WalletContract = blockchain.openContract(
                JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0Wallet),
              );
              routerJetton1WalletContract = blockchain.openContract(
                JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1Wallet),
              );
              swapToken0Wallet = token0WalletContract;
              swapToken1Wallet = token1WalletContract;
            } else {
              transfer0 = await token1WalletContract.sendTransferMint(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferMint',
                  query_id: 0,
                  jetton_amount: jettonAmount1,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(0.8),
                  either_payload: true,
                  mint: {
                    kind: 'MintParams',
                    forward_opcode: PoolWrapper.Opcodes.Mint,
                    jetton1_wallet: routerJetton0Wallet,
                    tick_lower: position.tickLower,
                    tick_upper: position.tickUpper,
                    tick_spacing: tickSpacing,
                    fee: feeAmount,
                    liquidity_delta: position.liquidity,
                  },
                },
                {
                  value: toNano(1),
                },
              );

              transfer1 = await token0WalletContract.sendTransferMint(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferMint',
                  query_id: 0,
                  jetton_amount: jettonAmount0,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(0.8),
                  either_payload: true,
                  mint: {
                    kind: 'MintParams',
                    forward_opcode: PoolWrapper.Opcodes.Mint,
                    jetton1_wallet: routerJetton1Wallet,
                    tick_lower: position.tickLower,
                    tick_upper: position.tickUpper,
                    tick_spacing: tickSpacing,
                    fee: feeAmount,
                    liquidity_delta: position.liquidity,
                  },
                },
                {
                  value: toNano(1),
                },
              );
              routerJetton1WalletContract = blockchain.openContract(
                JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton0Wallet),
              );
              routerJetton0WalletContract = blockchain.openContract(
                JettonWalletWrapper.JettonWallet.createFromAddress(routerJetton1Wallet),
              );
              swapToken0Wallet = token1WalletContract;
              swapToken1Wallet = token0WalletContract;
            }
            console.log('createPosition');
            printTransactionFees(transfer0.transactions);
            printTransactionFees(transfer1.transactions);
          }
          if (routerJetton0WalletContract && routerJetton1WalletContract) {
            poolBalance0 = await routerJetton0WalletContract.getBalance();
            poolBalance1 = await routerJetton1WalletContract.getBalance();
            poolInfoBefore = await poolContract.getPoolInfo();

            const { feeGrowthGlobal0X128, feeGrowthGlobal1X128 } = await poolContract.getFeeGrowthGlobal();
            return {
              swapToken0Wallet,
              swapToken1Wallet,
              routerJetton0WalletContract,
              routerJetton1WalletContract,
              poolBalance0,
              poolBalance1,
              poolInfoBefore,
              feeGrowthGlobal0X128,
              feeGrowthGlobal1X128,
              poolContract,
            };
          }
          throw new Error('no pool found');
        };
        let routerJetton0WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
        let routerJetton1WalletContract: SandboxContract<JettonWalletWrapper.JettonWallet>;
        let swapToken0Wallet;
        let swapToken1Wallet;
        let poolContract: SandboxContract<PoolWrapper.PoolTest>;
        let poolInfoBefore: {
          fee: bigint;
          tickSpacing: bigint;
          tick: bigint;
          sqrtPriceX96: bigint;
          liquidity: bigint;
        };
        let feeGrowthGlobal0X128: bigint;
        let feeGrowthGlobal1X128: bigint;
        let poolBalance0;
        let poolBalance1;

        beforeEach(async () => {
          ({
            swapToken0Wallet,
            swapToken1Wallet,
            routerJetton0WalletContract,
            routerJetton1WalletContract,
            poolBalance0,
            poolBalance1,
            poolContract,
            poolInfoBefore,
            feeGrowthGlobal0X128,
            feeGrowthGlobal1X128,
          } = await poolFixtures());
        });

        for (const testCase of POOL_SWAP_TESTS_FILTER_EXACT_OUT) {
          it(swapCaseToDescription(testCase), async () => {
            let swapTx: SendMessageResult;
            let swapBalance0 = await swapToken0Wallet!.getBalance();
            let swapBalance1 = await swapToken1Wallet!.getBalance();

            if (testCase.zeroForOne) {
              swapTx = await swapToken0Wallet!.sendTransferSwap(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferSwap',
                  query_id: 0,
                  jetton_amount: testCase.amount0,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(2.0),
                  either_payload: true,
                  swap: {
                    kind: 'SwapParams',
                    forward_opcode: PoolWrapper.Opcodes.Swap,
                    fee: poolCase.feeAmount,
                    jetton1_wallet: routerJetton1WalletContract!.address,
                    //eslint-di
                    sqrt_price_limit: testCase?.sqrtPriceLimit ?? MIN_SQRT_RATIO + 1n,
                    tick_spacing: poolCase.tickSpacing,
                    zero_for_one: testCase.zeroForOne ? -1 : 0,
                  },
                },
                {
                  value: toNano(2.5),
                },
              );
            } else {
              swapTx = await swapToken1Wallet!.sendTransferSwap(
                deployer.getSender(),
                {
                  kind: 'OpJettonTransferSwap',
                  query_id: 0,
                  jetton_amount: testCase.amount1,
                  to_address: router.address,
                  response_address: deployer.address,
                  custom_payload: beginCell().storeDict(Dictionary.empty()).endCell(),
                  forward_ton_amount: toNano(2.0),
                  either_payload: true,
                  swap: {
                    kind: 'SwapParams',
                    forward_opcode: PoolWrapper.Opcodes.Swap,
                    fee: poolCase.feeAmount,
                    jetton1_wallet: routerJetton0WalletContract!.address,
                    sqrt_price_limit: testCase.sqrtPriceLimit ?? MAX_SQRT_RATIO - 1n,
                    tick_spacing: poolCase.tickSpacing,
                    zero_for_one: testCase.zeroForOne ? -1 : 0,
                  },
                },
                {
                  value: toNano(2.5),
                },
              );
            }

            console.log('==== After Swap ====');
            printTransactionFees(swapTx.transactions);
            const transactions = swapTx.transactions;
            const allErrorExitCode = filterOutSuccessMessages(transactions);
            console.log(allErrorExitCode);
            if (allErrorExitCode.length > 0) {
              expect({
                poolBalance0: poolBalance0!.amount.toString(),
                poolBalance1: poolBalance1!.amount.toString(),
                poolPriceBefore: formatPrice(poolInfoBefore.sqrtPriceX96),
                tickBefore: Number(poolInfoBefore.tick),
                computeErr: typeof allErrorExitCode[0] === 'number' && allErrorExitCode[0].toString(),
              }).toMatchSnapshot();
            } else {
              swapBalance0 = await swapToken0Wallet!.getBalance();
              swapBalance1 = await swapToken1Wallet!.getBalance();
              console.log({
                swapBalance0,
                swapBalance1,
              });
              let router0AfterBalance = await routerJetton0WalletContract!.getBalance();
              let router1AfterBalance = await routerJetton1WalletContract!.getBalance();
              let poolInfoAfter = await poolContract!.getPoolInfo();
              let { feeGrowthGlobal0X128: feeGrowthGlobal0X128After, feeGrowthGlobal1X128: feeGrowthGlobal1X128After } =
                await poolContract!.getFeeGrowthGlobal();
              const poolBalance0Delta = router0AfterBalance.amount - poolBalance0!.amount;
              const poolBalance1Delta = router1AfterBalance.amount - poolBalance1!.amount;
              const executionPrice = new Decimal(poolBalance1Delta.toString())
                .div(poolBalance0Delta.toString())
                .mul(-1);

              expect({
                amount0Before: poolBalance0!.amount.toString(),
                amount0Delta: poolBalance0Delta.toString(),
                amount1Before: poolBalance1!.amount.toString(),
                amount1Delta: poolBalance1Delta.toString(),
                executionPrice: Number(executionPrice.toString()).toFixed(4).toString(),
                feeGrowthGlobal0X128Delta: (feeGrowthGlobal0X128After - feeGrowthGlobal0X128).toString(),
                feeGrowthGlobal1X128Delta: (feeGrowthGlobal1X128After - feeGrowthGlobal1X128).toString(),
                poolPriceBefore: formatPrice(poolInfoBefore.sqrtPriceX96),
                poolPriceAfter: formatPrice(poolInfoAfter.sqrtPriceX96),
                tickAfter: Number(poolInfoAfter.tick),
                tickBefore: Number(poolInfoBefore.tick),
              }).toMatchSnapshot();
            }
          });
        }
      });
    }
  });
});
