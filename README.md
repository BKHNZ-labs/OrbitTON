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

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
