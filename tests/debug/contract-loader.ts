import { Address, Cell, Contract, ContractProvider } from '@ton/core';
import { Blockchain, SandboxContract } from '@ton/sandbox';

// Interface for contract methods
export interface ContractMethods {
    // Add common contract methods here
    getState(): Promise<any>;
}

// Base contract wrapper
export class ContractWrapper implements Contract, ContractMethods {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
        readonly provider?: ContractProvider
    ) {}

    async getState() {
        return await this.provider?.get('get_contract_state', []);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            bounce: false
        });
    }
}

export interface ContractFromAddress<T extends Contract> {
    createFromAddress(address: Address): SandboxContract<T>;
}

// Helper function to load contract
export async function loadContract(
    blockchain: Blockchain,
    address: Address,
    name: string = 'Unknown Contract'
): Promise<SandboxContract<ContractWrapper>> {
    console.log(`Loading ${name} at address: ${address.toString()}`);
    return blockchain.openContract(
        new ContractWrapper(address)
    );
}