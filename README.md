### Continuing thoughts after interview

- When drawing vote contract, i just think about how proposal can verify vote of user, and how to detect the user is in a whitelist or not.
- At that time, my brain is kind of frozen, so i can't figure it out.
- Right after the interview, i think about it again, and i rethink about it. There are two problems we need to solve:
  - How to extend the size of whitelist users, since dict has limited size. => Then i found out merkle tree.
  - How to verify the vote of user, since we can't store all the votes. => verify proof with user address, then we will create vote contract for user, from that vote contract, we can define the vote power of user like double-vote, unvote, revote, etc.

=> That's the think, but we can't make sure how much user can reach. So this project is a poc for that. With merkle tree, we can work with large size of whitelist users. like 1 million.

On the merkle tree, here is use my own merkle tree implementation, but i think it's not the best way to do it since ton offer exotic cell for it.

But to be honest, i haven't used that before, and don't know about the limit of it, there is existed or not. The code is using my merkle tree which is based on cosmos's merkle tree.

# Components

<img src="resources/component.png" width="500">

- **Proposal Factory** - Creates proposals with unique IDs and predictable addresses for easy query and indexing data.
- **Proposal** - Manages individual proposal voting with Merkle proof verification and time controls
- **Vote** - Tracks each user's vote per proposal, prevents double voting, allows vote changes

# Flow

## Create a proposal

<img src="resources/create_proposal.png" width="500">

## Vote for a proposal

<img src="resources/vote.png" width="500">
