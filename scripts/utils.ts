import { Network } from '@orbs-network/ton-access';
import { WalletContractV3R2, WalletContractV4, TonClient, toNano, internal, OpenedContract } from '@ton/ton';
import * as dotenv from 'dotenv';

export async function waitSeqno(
  walletContract: OpenedContract<WalletContractV3R2> | OpenedContract<WalletContractV4>,
  seqno: number,
) {
  let currentSeqno = seqno;
  while (currentSeqno == seqno) {
    console.log('waiting for transaction to confirm...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    currentSeqno = await walletContract.getSeqno();
  }
  console.log('transaction confirmed!');
}
``;
