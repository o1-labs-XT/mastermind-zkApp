//TODO Add utility functions for serialization and game mechanics
//TODO Add unit tests for game mechanics

import { MastermindZkApp } from './Mastermind';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  MerkleTree,
  UInt8,
} from 'o1js';

let proofsEnabled = false;

async function localDeploy(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  zkappPrivateKey: PrivateKey
) {
  const deployerAccount = deployerKey.toPublicKey();
  const tx = await Mina.transaction(deployerAccount, () => {
    AccountUpdate.fundNewAccount(deployerAccount);
    zkapp.deploy();
  });

  await tx.prove();
  await tx.sign([deployerKey, zkappPrivateKey]).send();
}

async function initializeGame(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  rounds: number
) {
  const deployerAccount = deployerKey.toPublicKey();

  // The deployer initializes the Mastermind zkapp
  const initTx = await Mina.transaction(deployerAccount, () => {
    zkapp.initGame(UInt8.from(rounds));
  });

  await initTx.prove();
  await initTx.sign([deployerKey]).send();
}

describe('Mastermind ZkApp Tests', () => {
  let codemasterKey: PrivateKey,
    codebreakerKey: PrivateKey,
    intruderKey: PrivateKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp,
    guessTree: MerkleTree,
    clueTree: MerkleTree,
    secretCombination: number[],
    codemasterSalt: Field,
    codebreakerSalt: Field;

  beforeAll(async () => {
    if (proofsEnabled) await MastermindZkApp.compile();

    // Set up the Mina local blockchain
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Local.testAccounts is an array of 10 test accounts that have been pre-filled with Mina
    codemasterKey = Local.testAccounts[0].privateKey;
    codebreakerKey = Local.testAccounts[1].privateKey;
    intruderKey = Local.testAccounts[2].privateKey;

    // Set up the zkapp account
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    // Initialize the off-chain Merkle Tree for guess & clue storage respectively
    guessTree = new MerkleTree(8);
    clueTree = new MerkleTree(8);

    // Generate random field as salt for the codemaster & codebreaker respectively
    codemasterSalt = Field.random();
    codebreakerSalt = Field.random();

    // Set up a valid secret combinartion for testing purposes
    // Better encode the colours as number or enums locally
    secretCombination = [];
  });

  describe('Deploy and initialize Mastermind zkApp', () => {
    it('Generate and Deploy `Mastermind` smart contract', async () => {
      await localDeploy(zkapp, codemasterKey, zkappPrivateKey);
    });

    // This is test verifies that the zkapp initial state values are correctly set up
    it('Initialize game', async () => {
      await initializeGame(zkapp, codemasterKey, 10);

      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).toEqual(Field(0));

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(Field(0));

      const turnCount = zkapp.turnCount.get();
      expect(turnCount).toEqual(new UInt8(0));

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(Field(0));

      const serializedGuess = zkapp.serializedGuess.get();
      expect(serializedGuess).toEqual(Field(0));

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(Field(0));
    });
  });

  describe('createGame method tests', () => {
    it.todo('should reject codemaster with invalid secret combination');
    it.todo('should create a game and update codemasterId');
    it.todo('should prevent other players from re-creating a game');
  });

  describe('makeGuess method tests', () => {
    it.todo(
      'should reject codebreaker to call this method before game is created'
    );
    it.todo('should reject codebreaker to make an invalid guess');
    it.todo('should make valid guess & update state');
    it.todo(
      'should reject the codebraker calling this method if the clue from previous turn is not reported'
    );

    //! this is import to test the rest of method apart from first turn
    //! the giveClue is tested separately
    it.todo('should accept codemaster clue');

    it.todo('should reject any caller other than the codebreaker');
    it.todo('should reject a codebreaker with different salt');
    it.todo('should accept another valid guess from the codebreaker');
  });

  describe('giveClue method tests', () => {
    it.todo('should reject any caller other than the codemaster');
    it.todo('should reject codemaster with non-compliant secret combination');
    it.todo('should reject codemaster with different salt');
    it.todo('should accept clue TX and update state');

    //TODO repeat the cycle few 10 times more and add win-lose case tests
  });
});
