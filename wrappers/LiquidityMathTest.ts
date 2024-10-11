import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type LiquidityMathTestConfig = {};

export function liquidityMathTestConfigToCell(config: LiquidityMathTestConfig): Cell {
    return beginCell().endCell();
}

export class LiquidityMathTest implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new LiquidityMathTest(address);
    }

    static createFromConfig(config: LiquidityMathTestConfig, code: Cell, workchain = 0) {
        const data = liquidityMathTestConfigToCell(config);
        const init = { code, data };
        return new LiquidityMathTest(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
