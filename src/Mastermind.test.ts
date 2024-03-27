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
  Provable,
} from 'o1js';
import { deserializeClue, serializeCombination } from './utils';

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

  describe('makeGuess method tests: first guess', () => {
    async function testInvalidGuess(guess: number[], errorMessage?: string) {
      const serializedGuess = serializeCombination(guess);

      const makeGuessTx = async () => {
        const tx = await Mina.transaction(codebreakerKey.toPublicKey(), () => {
          zkapp.makeGuess(serializedGuess, codebreakerSalt);
        });

        await tx.prove();
        await tx.sign([codebreakerKey]).send();
      };

      expect(makeGuessTx).rejects.toThrowError(errorMessage);
    }

    it('should reject codebreaker with invalid guess combination: first digit is 0', async () => {
      const errorMessage = 'Combination digit 1 should not be zero!';
      await testInvalidGuess([0, 1, 4, 6], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: second digit is 0', async () => {
      const errorMessage = 'Combination digit 2 should not be zero!';
      await testInvalidGuess([3, 0, 9, 6], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: third digit is 0', async () => {
      const errorMessage = 'Combination digit 3 should not be zero!';
      await testInvalidGuess([7, 2, 0, 5], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: fouth digit is 0', async () => {
      const errorMessage = 'Combination digit 4 should not be zero!';
      await testInvalidGuess([6, 9, 3, 0], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: first digit is greater than 9', async () => {
      const errorMessage = 'Combination digit 1 should be between 1 and 9!';
      await testInvalidGuess([10, 9, 3, 0], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: second digit is greater than 9', async () => {
      const errorMessage = 'Combination digit 2 should be between 1 and 9!';
      await testInvalidGuess([2, 15, 3, 0], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: third digit is greater than 9', async () => {
      const errorMessage = 'Combination digit 3 should be between 1 and 9!';
      await testInvalidGuess([1, 9, 13, 0], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: fourth digit is greater than 9', async () => {
      const errorMessage = 'Combination digit 4 should be between 1 and 9!';
      await testInvalidGuess([1, 9, 2, 14], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: second digit is not unique', async () => {
      const errorMessage = 'Combination digit 2 is not unique!';
      await testInvalidGuess([1, 1, 2, 9], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: third digit is not unique', async () => {
      const errorMessage = 'Combination digit 3 is not unique!';
      await testInvalidGuess([1, 2, 2, 9], errorMessage);
    });

    it('should reject codebreaker with invalid guess combination: fourth digit is not unique', async () => {
      const errorMessage = 'Combination digit 4 is not unique!';
      await testInvalidGuess([1, 3, 9, 9], errorMessage);
    });

    it('should accept codebreaker valid guess & update on-chain state', async () => {
      // Test that the codebreakerId is not updated yet
      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(Field(0));

      const firstGuess = [1, 5, 6, 2];
      const serializedGuess = serializeCombination(firstGuess);

      const makeGuessTx = await Mina.transaction(
        codebreakerKey.toPublicKey(),
        () => {
          zkapp.makeGuess(serializedGuess, codebreakerSalt);
        }
      );

      await makeGuessTx.prove();
      await makeGuessTx.sign([codebreakerKey]).send();

      // Test that the on-chain states are updated
      const updatedCodebreakerId = zkapp.codebreakerId.get();
      expect(updatedCodebreakerId).not.toEqual(Field(0));

      const turnCount = zkapp.turnCount.get().toNumber();
      expect(turnCount).toEqual(2);
    });

    it('should reject the codebraker from calling this method if the clue from previous turn is not reported yet', async () => {
      const errorMessage = 'Please wait for the codemaster to give you a clue!';
      await testInvalidGuess([1, 2, 2, 9], errorMessage);
    });
  });

  describe('giveClue method tests', () => {
    async function testInvalidClue(
      secretCombination: number[],
      errorMessage?: string,
      signerKey = codemasterKey,
      signerSalt = codemasterSalt
    ) {
      const serializedSecretCombination =
        serializeCombination(secretCombination);

      const giveClueTx = async () => {
        const tx = await Mina.transaction(signerKey.toPublicKey(), () => {
          zkapp.giveClue(serializedSecretCombination, signerSalt);
        });

        await tx.prove();
        await tx.sign([signerKey]).send();
      };

      expect(giveClueTx).rejects.toThrowError(errorMessage);
    }

    it('should reject any caller other than the codemaster', async () => {
      const errorMessage =
        'Only the codemaster of this game is allowed to give clue!';
      await testInvalidClue([1, 2, 3, 4], errorMessage, intruderKey);
    });

    it('should reject codemaster with different salt', async () => {
      const differentSalt = Field.random();
      const errorMessage =
        'Only the codemaster of this game is allowed to give clue!';
      await testInvalidClue(
        [1, 2, 3, 4],
        errorMessage,
        codemasterKey,
        differentSalt
      );
    });

    it('should reject codemaster with non-compliant secret combination', async () => {
      const errorMessage =
        'The secret combination is not compliant with the stored hash on-chain!';
      await testInvalidClue([1, 5, 3, 4], errorMessage);
    });

    it('should accept codemaster clue and update on-chain state', async () => {
      const solution = [1, 2, 3, 4];
      const serializedSolution = serializeCombination(solution);

      const giveClueTx = await Mina.transaction(
        codemasterKey.toPublicKey(),
        () => {
          zkapp.giveClue(serializedSolution, codemasterSalt);
        }
      );

      await giveClueTx.prove();
      await giveClueTx.sign([codemasterKey]).send();

      // Test that the on-chain states are updated: serializedClue, isSolved, and turnCount
      const serializedClue = zkapp.serializedClue.get();
      const clue = deserializeClue(serializedClue);
      expect(clue).toEqual([2, 0, 0, 1].map(Field));
      
      const isSolved = zkapp.isSolved.get().toBoolean();
      expect(isSolved).toEqual(false);
      
      const turnCount = zkapp.turnCount.get().toNumber();
      expect(turnCount).toEqual(3);
    });

    //TODO repeat the cycle few 10 times more and add win-lose case tests
  });

  describe('makeGuess method tests: second guess onwards', () => {
    //! the giveClue is tested separately
    it.todo(
      'should reject codebreaker to call this method before game is created'
    );
    it.todo('should accept codemaster clue');

    it.todo('should reject any caller other than the codebreaker');
    it.todo('should reject a codebreaker with different salt');
    it.todo('should accept another valid guess from the codebreaker');
  });
});
