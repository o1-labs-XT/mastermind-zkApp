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
import { serializeCombination } from './utils';

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

    // This test verifies that the zkapp initial state values are correctly set up
    it('Initialize game', async () => {
      const roundLimit = 10;
      await initializeGame(zkapp, codemasterKey, roundLimit);

      const rounds = zkapp.roundsLimit.get();
      expect(rounds).toEqual(UInt8.from(roundLimit));

      const turnCount = zkapp.turnCount.get();
      expect(turnCount).toEqual(new UInt8(0));

      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).toEqual(Field(0));

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(Field(0));

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(Field(0));

      const serializedGuess = zkapp.serializedGuess.get();
      expect(serializedGuess).toEqual(Field(0));

      const serializedClue = zkapp.serializedClue.get();
      expect(serializedClue).toEqual(Field(0));

      const isSolved = zkapp.isSolved.get().toBoolean();
      expect(isSolved).toEqual(false);
    });
  });

  describe('createGame method tests', () => {
    async function testInvalidCreateGame(
      secretCombination: number[],
      errorMessage?: string
    ) {
      const serializedSecretCombination =
        serializeCombination(secretCombination);

      const createGameTx = async () => {
        const tx = await Mina.transaction(codemasterKey.toPublicKey(), () => {
          zkapp.createGame(serializedSecretCombination, codemasterSalt);
        });

        await tx.prove();
        await tx.sign([codemasterKey]).send();
      };

      expect(createGameTx).rejects.toThrowError(errorMessage);
    }

    it('should reject codemaster with invalid secret combination: first digit is 0', () => {
      const errorMessage = 'Combination digit 1 should not be zero!';
      testInvalidCreateGame([0, 1, 4, 6], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: second digit is 0', () => {
      const errorMessage = 'Combination digit 2 should not be zero!';
      testInvalidCreateGame([3, 0, 9, 6], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: third digit is 0', () => {
      const errorMessage = 'Combination digit 3 should not be zero!';
      testInvalidCreateGame([7, 2, 0, 5], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: fouth digit is 0', () => {
      const errorMessage = 'Combination digit 4 should not be zero!';
      testInvalidCreateGame([6, 9, 3, 0], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: first digit is greater than 9', () => {
      const errorMessage = 'Combination digit 1 should be between 1 and 9!';
      testInvalidCreateGame([10, 9, 3, 0], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: second digit is greater than 9', () => {
      const errorMessage = 'Combination digit 2 should be between 1 and 9!';
      testInvalidCreateGame([2, 15, 3, 0], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: third digit is greater than 9', () => {
      const errorMessage = 'Combination digit 3 should be between 1 and 9!';
      testInvalidCreateGame([1, 9, 13, 0], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: fourth digit is greater than 9', () => {
      const errorMessage = 'Combination digit 4 should be between 1 and 9!';
      testInvalidCreateGame([1, 9, 2, 14], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: second digit is not unique', () => {
      const errorMessage = 'Combination digit 2 is not unique!';
      testInvalidCreateGame([1, 1, 2, 9], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: third digit is not unique', () => {
      const errorMessage = 'Combination digit 3 is not unique!';
      testInvalidCreateGame([1, 2, 2, 9], errorMessage);
    });

    it('should reject codemaster with invalid secret combination: fourth digit is not unique', () => {
      const errorMessage = 'Combination digit 4 is not unique!';
      testInvalidCreateGame([1, 3, 9, 9], errorMessage);
    });

    it('should create a game and update codemasterId & turnCount on-chain', async () => {
      const secretCombination = [1, 2, 3, 4];
      const serializedSecretCombination =
        serializeCombination(secretCombination);

      const createGameTx = await Mina.transaction(
        codemasterKey.toPublicKey(),
        () => {
          zkapp.createGame(serializedSecretCombination, codemasterSalt);
        }
      );

      await createGameTx.prove();
      await createGameTx.sign([codemasterKey]).send();

      // Test that the on-chain states are updated
      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).not.toEqual(Field(0));

      const turnCount = zkapp.turnCount.get().toNumber();
      expect(turnCount).toEqual(1);
    });

    it('should prevent players from re-creating a game: current codemaster included', async () => {
      const errorMessage = 'A mastermind game is already created!';
      testInvalidCreateGame([2, 3, 4, 5], errorMessage);
    });
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
