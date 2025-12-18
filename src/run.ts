import { expect } from 'expect';
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  Provable,
  UInt8,
  fetchAccount,
} from 'o1js';
import { MastermindZkApp } from './Mastermind.js';
import { compressCombinationDigits, deserializeClue } from './utils.js';
import dotenv from 'dotenv';

dotenv.config();

const MINA_NODE_ENDPOINT =
  'https://plain-1-graphql.mina-mesa-network.gcp.o1test.net/graphql';
const proofsEnabled = true;
const logsEnabled = true;
const fee = 2e8;

console.time('compile...');
if (proofsEnabled) await MastermindZkApp.compile();
console.timeEnd('compile...');

// Set up the Mina local blockchain
const Mesa = Mina.Network(MINA_NODE_ENDPOINT);
Mina.setActiveInstance(Mesa);

// Generate random field as salt for the codemaster
let codemasterSalt = Field.random();

const codeMasterPrivKeyBase58 = process.env.CODEMASTER_PRIV_KEY;
const codeBreakerPrivKeyBase58 = process.env.CODEBREAKER_PRIV_KEY;

if (!codeMasterPrivKeyBase58 || !codeBreakerPrivKeyBase58) {
  throw new Error('Missing private keys in .env');
}

const codeMasterPrivateKey = PrivateKey.fromBase58(codeMasterPrivKeyBase58);
const codeBreakerPrivateKey = PrivateKey.fromBase58(codeBreakerPrivKeyBase58);

// Derive public keys
const codeMasterPublicKey = codeMasterPrivateKey.toPublicKey();
const codeBreakerPublicKey = codeBreakerPrivateKey.toPublicKey();

console.log('CodeMaster PK:', codeMasterPublicKey.toBase58());
console.log('CodeBreaker PK:', codeBreakerPublicKey.toBase58());

// Set up the zkapp account
let zkappPrivateKey = PrivateKey.random();
let zkappAddress = zkappPrivateKey.toPublicKey();
let zkapp = new MastermindZkApp(zkappAddress);

console.log('Deploying zkApp...');
await deployZkApp(zkapp, codeMasterPrivateKey, zkappPrivateKey);

Provable.log('guess history: ', zkapp.guessHistory.get());

// Should reject calling `createGame` method before `initGame`
const createGameTxInvalid = async () => {
  const tx = await Mina.transaction(
    { sender: codeMasterPublicKey, fee },
    async () => {
      await zkapp.createGame(Field(1234), codemasterSalt);
    }
  );

  await waitTransactionAndFetchAccount(tx, [codeMasterPrivateKey]);
};

const expectedErrorMessage = 'The game has not been initialized yet!';
await expect(createGameTxInvalid()).rejects.toThrowError(expectedErrorMessage);

// Initialize game
const maxAttempts = 5;
console.log('Initializing game...');
await initializeGame(zkapp, codeMasterPrivateKey, maxAttempts);

// Initialized with `super.init()`
const turnCount = zkapp.turnCount.get();
expect(turnCount).toEqual(new UInt8(0));

const codemasterId = zkapp.codemasterId.get();
expect(codemasterId).toEqual(Field(0));

const codebreakerId = zkapp.codebreakerId.get();
expect(codebreakerId).toEqual(Field(0));

const solutionHash = zkapp.solutionHash.get();
expect(solutionHash).toEqual(Field(0));

const firstEmptyGuess = zkapp.guessHistory.get();
expect(firstEmptyGuess).toEqual(Array.from({ length: 13 }).fill(Field(0)));

const firstClue = zkapp.clueHistory.get();
expect(firstClue).toEqual(Array.from({ length: 13 }).fill(Field(0)));

// Initialized manually
const rounds = zkapp.maxAttempts.get();
expect(rounds).toEqual(UInt8.from(maxAttempts));

const isSolved = zkapp.isSolved.get().toBoolean();
expect(isSolved).toEqual(false);

// secretCombination = [1, 2, 3, 4]
// should create a game and update codemasterId & turnCount on-chain
const secretCombination = Field(1234);
console.log('Creating game...');
const createGameTx = await Mina.transaction(
  { sender: codeMasterPublicKey, fee },
  async () => {
    await zkapp.createGame(secretCombination, codemasterSalt);
  }
);

await waitTransactionAndFetchAccount(createGameTx, [codeMasterPrivateKey]);

// Test that the on-chain states are updated
const codemasterIdUpdated = await zkapp.codemasterId.fetch();
Provable.log('code master id: ', codemasterIdUpdated);
expect(codemasterIdUpdated).not.toEqual(Field(0));

const turnCountUpdated = zkapp.turnCount.get().toNumber();
expect(turnCountUpdated).toEqual(1);

// should accept codebreaker valid guess & update on-chain state
// Test that the codebreakerId is not updated yet
expect(zkapp.codebreakerId.get()).toEqual(Field(0));

const firstGuess = [1, 5, 6, 2];
await makeGuess(firstGuess);

// Test that the on-chain states are updated
const updatedCodebreakerId = await zkapp.codebreakerId.fetch();
expect(updatedCodebreakerId).not.toEqual(Field(0));

expect(zkapp.turnCount.get().toNumber()).toEqual(2);

// should accept codemaster clue and update on-chain state
const solution = [1, 2, 3, 4];
const unseparatedSolution = compressCombinationDigits(solution.map(Field));
console.log('Give first clue...');

const giveClueTx = await Mina.transaction(
  { sender: codeMasterPublicKey, fee },
  async () => {
    await zkapp.giveClue(unseparatedSolution, codemasterSalt);
  }
);

await waitTransactionAndFetchAccount(giveClueTx, [codeMasterPrivateKey]);

// Test that the on-chain states are updated: serializedClue, isSolved, and turnCount
const latestTurnCount = await zkapp.turnCount.fetch();
const latestClueIndex = latestTurnCount!.sub(3).div(2).toNumber();
const clueHistory = zkapp.clueHistory.get();
const serializedClue = clueHistory[latestClueIndex];
const clue = deserializeClue(serializedClue);

expect(clue).toEqual([2, 0, 0, 1].map(Field));

expect(zkapp.isSolved.get().toBoolean()).toEqual(false);

expect(zkapp.turnCount.get().toNumber()).toEqual(3);

// validGuess2 = [1, 4, 7, 2]
// should accept another valid guess & update on-chain state
console.log('Make second guess...');

const secondGuess = [1, 4, 7, 2];
await makeGuess(secondGuess);

// Test that the on-chain states are updated
const updatedCodebreakerId2 = zkapp.codebreakerId.get();
expect(updatedCodebreakerId2).not.toEqual(Field(0));

const turnCount2 = (await zkapp.turnCount.fetch())!.toNumber();
expect(turnCount2).toEqual(4);

/// Should give clue of second guess and then alternate guess/clue round till roundsLimit=5
await giveClue([2, 1, 0, 1]);

// should make third guess
await makeGuess([1, 3, 4, 8]);

// should give clue of third guess
await giveClue([2, 1, 1, 0]);

// should make fourth guess
await makeGuess([5, 8, 3, 7]);

// should give clue of fourth guess
await giveClue([0, 0, 2, 0]);

// should make fifth guess
await makeGuess([9, 1, 2, 4]);

// should give clue of fifth guess
await giveClue([0, 1, 1, 2]);

// should reject 6th guess: reached limited number of attempts
const expectedErrorMessage6G =
  'You have reached the number limit of attempts to solve the secret combination!';
await expect(makeGuess([1, 2, 3, 4])).rejects.toThrowError(
  expectedErrorMessage6G
);

// should reject giving 6th clue: reached limited number of attempts
const expectedErrorMessage6C =
  'The codebreaker has finished the number of attempts without solving the secret combination!';
await expect(giveClue([2, 2, 2, 2])).rejects.toThrowError(
  expectedErrorMessage6C
);

Provable.log('guess history: ', await zkapp.guessHistory.fetch());
Provable.log('clue history: ', zkapp.clueHistory.get().map(deserializeClue));

/// HELPER FUNCTIONS

function log(...args: any[]) {
  if (logsEnabled) {
    console.log(...args);
  }
}

/**
 * Wait for a transaction to be included in a block and fetch the account.
 * @param tx The transaction to wait for
 * @param keys The keys to sign the transaction
 * @param accountsToFetch The accounts to fetch after the transaction is included
 */
async function waitTransactionAndFetchAccount(
  tx: Awaited<ReturnType<typeof Mina.transaction>>,
  keys: PrivateKey[],
  accountsToFetch?: PublicKey[]
) {
  try {
    log('\nProving and sending transaction');
    await tx.prove();
    const pendingTransaction = await tx.sign(keys).send();

    log('Waiting for transaction to be included in a block');

    console.time('Mesa: Pending transaction');
    const status = await pendingTransaction.safeWait();
    console.timeEnd('Mesa: Pending transaction');

    if (status.status === 'rejected') {
      log('Transaction rejected', JSON.stringify(status.errors));
      throw new Error(
        'Transaction was rejected: ' + JSON.stringify(status.errors)
      );
    }

    if (accountsToFetch) {
      await fetchAccounts(accountsToFetch);
    }
  } catch (error) {
    log('error', error);
    throw error;
  }
}

/**
 * Fetch given accounts from the Mina to local cache.
 * @param accounts List of account public keys to fetch
 */
async function fetchAccounts(accounts: PublicKey[]) {
  for (let account of accounts) {
    await fetchAccount({ publicKey: account }, MINA_NODE_ENDPOINT);
  }
}

async function deployZkApp(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  zkappPrivateKey: PrivateKey
) {
  const deployerAccount = deployerKey.toPublicKey();
  const tx = await Mina.transaction(
    { sender: deployerAccount, fee },
    async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await zkapp.deploy();
    }
  );

  await waitTransactionAndFetchAccount(
    tx,
    [deployerKey, zkappPrivateKey],
    [zkappAddress]
  );
}

async function initializeGame(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  rounds: number
) {
  const deployerAccount = deployerKey.toPublicKey();

  // The deployer initializes the Mastermind zkapp
  const initTx = await Mina.transaction(
    { sender: deployerAccount, fee },
    async () => {
      await zkapp.initGame(UInt8.from(rounds));
    }
  );
  await waitTransactionAndFetchAccount(initTx, [deployerKey]);
}

async function makeGuess(guess: number[]) {
  console.log('Make guess...');
  const unseparatedGuess = compressCombinationDigits(guess.map(Field));

  const makeGuessTx = await Mina.transaction(
    { sender: codeBreakerPublicKey, fee },
    async () => {
      await zkapp.makeGuess(unseparatedGuess);
    }
  );

  await waitTransactionAndFetchAccount(makeGuessTx, [codeBreakerPrivateKey]);
}

async function giveClue(expectedClue: number[]) {
  console.log('Give clue...');

  const solution = [1, 2, 3, 4];
  const unseparatedSolution = compressCombinationDigits(solution.map(Field));

  const giveClueTx = await Mina.transaction(
    { sender: codeMasterPublicKey, fee },
    async () => {
      await zkapp.giveClue(unseparatedSolution, codemasterSalt);
    }
  );

  await waitTransactionAndFetchAccount(giveClueTx, [codeMasterPrivateKey]);

  const latestTurnCount = await zkapp.turnCount.fetch();
  const latestClueIndex = latestTurnCount!.sub(3).div(2).toNumber();
  const clueHistory = await zkapp.clueHistory.fetch();
  const serializedClue = clueHistory![latestClueIndex];
  const clue = deserializeClue(serializedClue);

  expect(clue).toEqual(expectedClue.map(Field));
}
