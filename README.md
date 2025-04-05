# OrbitTON

## Project structure

- `contracts/` - Source code in [FunC](https://docs.ton.org/develop/func/overview)
- `wrappers/` - TypeScript interface classes for all contracts (implementing `Contract` from [@ton/core](https://www.npmjs.com/package/@ton/core))
  - include message [de]serialization primitives, getter wrappers and compilation functions
  - used by the test suite and client code to interact with the contracts from TypeScript
- `compilables/` - Compilations scripts for contracts
- `tests/` - TypeScript test suite for all contracts (relying on [Sandbox](https://github.com/ton-org/sandbox) for in-process tests)
- `scripts/` - Deployment scripts to mainnet/testnet and other scripts interacting with live contracts
- `build/` - Compilation artifacts created here after running a build command

## Contract Interactions

The CLAMM (Concentrated Liquidity Automated Market Maker) system consists of four main contracts that interact to provide liquidity management and token swapping functionality:

### Core Components

- **Router**: The entry point contract that handles user requests and routes them to appropriate contracts
- **Pool**: Implements the core AMM logic, price calculations, and liquidity management
- **LP Account**: Manages individual liquidity positions and their associated state
- **Position NFT**: Non-fungible token representing ownership of liquidity positions

### Protocol Operations

The diagram below illustrates the interaction flow between contracts for the main protocol operations:

1. **Mint**: Users provide liquidity within a specific price range
   - Router validates and forwards mint request
   - Pool creates LP Account if needed
   - Position NFT is minted to represent the liquidity position

2. **Swap**: Users exchange one token for another
   - Router handles token transfers and swap parameters
   - Pool executes the swap using available liquidity
   - Tokens are transferred to the recipient

3. **Burn**: Users remove their liquidity from a position
   - Position NFT contract validates ownership
   - Pool calculates and returns token amounts
   - Router handles final token transfers

4. **Collect**: Users harvest their accumulated trading fees
   - Position NFT verifies fee collection request
   - Pool calculates accumulated fees
   - Router transfers fee tokens to the user

```mermaid
sequenceDiagram
    participant User
    participant Router
    participant Pool
    participant LP Account
    participant Position NFT

    %% MINT FLOW
    rect rgba(144, 238, 144, 0.5)
    Note over User,Position NFT: Mint Flow
    User->>Router: mint(token0, token1, tickLower, tickUpper, fee)
    Router->>Pool: mint(amount0, amount1, tickLower, tickUpper, liquidityDelta)
    Pool->>LP Account: add_liquidity(amount0, amount1, liquidityDelta)
    LP Account->>Pool: cb_add_liquidity(amounts, ticks)
    Pool->>Position NFT: mint_position(liquidityDelta, feeGrowth)
    Position NFT-->>User: Position NFT Token
    end

    %% SWAP FLOW
    rect rgba(135, 206, 235, 0.5)
    Note over User,Position NFT: Swap Flow
    User->>Router: swap(tokenIn, amountIn, recipient)
    Router->>Pool: swap(amountIn, zeroForOne, sqrtPriceLimit)
    Pool->>Router: pay_to(recipient, amounts)
    Router-->>User: Swapped Tokens
    end

    %% BURN FLOW
    rect rgba(255, 182, 193, 0.5)
    Note over User,Position NFT: Burn Flow
    User->>Position NFT: burn(tickLower, tickUpper, liquidityDelta)
    Position NFT->>Pool: burn(tickLower, tickUpper, liquidityDelta)
    Pool->>Position NFT: cb_pool_burn(feeGrowth, amounts)
    Position NFT->>Router: pay_to(amounts)
    Router-->>User: Withdrawn Tokens
    end

    %% COLLECT FEES FLOW
    rect rgba(255, 218, 185, 0.5)
    Note over User,Position NFT: Collect Fees Flow
    User->>Position NFT: collect_fee()
    Position NFT->>Pool: collect(tickLower, tickUpper)
    Pool->>Router: pay_to(feeAmount0, feeAmount1)
    Router-->>User: Collected Fee Tokens
    end
```

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
