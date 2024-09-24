/**
 * This file contains integration tests for the Mastermind zkApp. The tests involve deploying, initializing,
 * and advancing the game logic in a controlled sequence.
 *
 * The integration tests cover various scenarios, including a case where the Code Breaker fails to solve the game
 * with `maxAttempts = 5` and another where the game is successfully solved.
 *
 * These tests focus on verifying:
 * - Method access control, ensuring zkApp method calls are restricted to the correct addresses (e.g., `makeGuess` restricted to the Code Breaker).
 * - Enforcement of method call frequency limits (e.g., ensuring `initGame` and `createGame` are executed only once).
 * - Correct method call sequence (e.g., verifying that `createGame` is called before `makeGuess`).
 * - Validation of input integrity, including checks on value ranges, sizes, and the correctness of hashes and salts.
 * - Accurate updates to the on-chain state following method executions.
 */

import { MastermindZkApp } from './Mastermind';
import { Field, Mina, PrivateKey, PublicKey, AccountUpdate, UInt8 } from 'o1js';
import {
  deserializeClue,
  compressCombinationDigits,
  deserializeClueHistory,
} from './utils';

let proofsEnabled = false;

async function localDeploy(
  zkapp: MastermindZkApp,
  deployerKey: PrivateKey,
  zkappPrivateKey: PrivateKey
) {
  const deployerAccount = deployerKey.toPublicKey();
  const tx = await Mina.transaction(deployerAccount, async () => {
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
  const initTx = await Mina.transaction(deployerAccount, async () => {
    await zkapp.initGame(UInt8.from(rounds));
  });

  await initTx.prove();
  await initTx.sign([deployerKey]).send();
}

describe('Mastermind ZkApp Tests', () => {
  let codemasterKey: PrivateKey,
    codemasterPubKey: PublicKey,
    codemasterSalt: Field,
    codebreakerKey: PrivateKey,
    codebreakerPubKey: PublicKey,
    intruderKey: PrivateKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp;

  beforeAll(async () => {
    if (proofsEnabled) await MastermindZkApp.compile();

    // Set up the Mina local blockchain
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Local.testAccounts is an array of 10 test accounts that have been pre-filled with Mina
    codemasterKey = Local.testAccounts[0].key;
    codemasterPubKey = codemasterKey.toPublicKey();

    // Generate random field as salt for the codemaster
    codemasterSalt = Field.random();

    codebreakerKey = Local.testAccounts[1].key;
    codebreakerPubKey = codebreakerKey.toPublicKey();

    intruderKey = Local.testAccounts[2].key;

    // Set up the zkapp account
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);
  });

  describe('Deploy and initialize Mastermind zkApp', () => {
    it('Deploy a `Mastermind` zkApp', async () => {
      await localDeploy(zkapp, codemasterKey, zkappPrivateKey);
    });

    it('Should reject calling `createGame` method before `initGame`', async () => {
      const createGameTx = async () => {
        const tx = await Mina.transaction(codemasterPubKey, async () => {
          await zkapp.createGame(Field(1234), codemasterSalt);
        });

        await tx.prove();
        await tx.sign([codemasterKey]).send();
      };

      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(createGameTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Should reject calling `giveClue` method before `initGame`', async () => {
      const giveClueTx = async () => {
        const tx = await Mina.transaction(codemasterPubKey, async () => {
          await zkapp.giveClue(Field(1234), codemasterSalt);
        });

        await tx.prove();
        await tx.sign([codemasterKey]).send();
      };

      const expectedErrorMessage = 'The game has not been initialized yet!';
      await expect(giveClueTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts exceeds 15', async () => {
      const initTx = async () => await initializeGame(zkapp, codemasterKey, 20);

      const expectedErrorMessage =
        'The maximum number of attempts allowed is 15!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject calling `initGame` when maxAttempts is below 5', async () => {
      const initTx = async () => await initializeGame(zkapp, codemasterKey, 4);

      const expectedErrorMessage =
        'The minimum number of attempts allowed is 5!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    // This test verifies that the zkapp initial state values are correctly set up
    it('Initialize game', async () => {
      const maxAttempts = 5;
      await initializeGame(zkapp, codemasterKey, maxAttempts);

      // Initialized with `super.init()`
      const turnCount = zkapp.turnCount.get();
      expect(turnCount).toEqual(new UInt8(0));

      const codemasterId = zkapp.codemasterId.get();
      expect(codemasterId).toEqual(Field(0));

      const codebreakerId = zkapp.codebreakerId.get();
      expect(codebreakerId).toEqual(Field(0));

      const solutionHash = zkapp.solutionHash.get();
      expect(solutionHash).toEqual(Field(0));

      const unseparatedGuess = zkapp.packedGuessHistory.get();
      expect(unseparatedGuess).toEqual(Field(0));

      const serializedClue = zkapp.packedClueHistory.get();
      expect(serializedClue).toEqual(Field(0));

      // Initialized manually
      const rounds = zkapp.maxAttempts.get();
      expect(rounds).toEqual(UInt8.from(maxAttempts));

      const isSolved = zkapp.isSolved.get().toBoolean();
      expect(isSolved).toEqual(false);
    });
  });

  describe('createGame method tests', () => {
    async function testInvalidCreateGame(
      combination: number[],
      expectedErrorMessage?: string
    ) {
      const secretCombination = compressCombinationDigits(
        combination.map(Field)
      );

      const createGameTx = async () => {
        const tx = await Mina.transaction(codemasterPubKey, async () => {
          await zkapp.createGame(secretCombination, codemasterSalt);
        });

        await tx.prove();
        await tx.sign([codemasterKey]).send();
      };

      await expect(createGameTx()).rejects.toThrowError(expectedErrorMessage);
    }

    it('should reject calling `initGame` a second time', async () => {
      const initTx = async () => await initializeGame(zkapp, codemasterKey, 5);

      const expectedErrorMessage = 'The game has already been initialized!';
      await expect(initTx()).rejects.toThrowError(expectedErrorMessage);
    });

    it('should reject codemaster with invalid secret combination: second digit is 0', async () => {
      const expectedErrorMessage = 'Combination digit 2 should not be zero!';
      await testInvalidCreateGame([5, 0, 4, 6], expectedErrorMessage);
    });

    it('should reject codemaster with invalid secret combination: third digit is not unique', () => {
      const expectedErrorMessage = 'Combination digit 3 is not unique!';
      testInvalidCreateGame([2, 3, 2, 9], expectedErrorMessage);
    });

    // secretCombination = [1, 2, 3, 4]
    it('should create a game and update codemasterId & turnCount on-chain', async () => {
      const secretCombination = Field(1234);

      const createGameTx = await Mina.transaction(
        codemasterKey.toPublicKey(),
        async () => {
          zkapp.createGame(secretCombination, codemasterSalt);
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
      const expectedErrorMessage = 'A mastermind game is already created!';
      testInvalidCreateGame([2, 3, 4, 5], expectedErrorMessage);
    });

    describe('makeGuess method tests: first guess', () => {
      async function testInvalidGuess(
        guess: number[],
        expectedErrorMessage?: string
      ) {
        const unseparatedGuess = compressCombinationDigits(guess.map(Field));

        const makeGuessTx = async () => {
          const tx = await Mina.transaction(
            codebreakerKey.toPublicKey(),
            async () => {
              await zkapp.makeGuess(unseparatedGuess);
            }
          );

          await tx.prove();
          await tx.sign([codebreakerKey]).send();
        };

        await expect(makeGuessTx()).rejects.toThrowError(expectedErrorMessage);
      }

      it('should reject codebreaker with invalid guess combination: fouth digit is 0', async () => {
        const expectedErrorMessage = 'Combination digit 4 should not be zero!';
        await testInvalidGuess([6, 9, 3, 0], expectedErrorMessage);
      });

      it('should reject codebreaker with invalid guess combination: second digit is not unique', async () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        await testInvalidGuess([1, 1, 2, 9], expectedErrorMessage);
      });

      // validGuess = [1, 5, 6, 2]
      it('should accept codebreaker valid guess & update on-chain state', async () => {
        // Test that the codebreakerId is not updated yet
        const codebreakerId = zkapp.codebreakerId.get();
        expect(codebreakerId).toEqual(Field(0));

        const firstGuess = [1, 5, 6, 2];
        const unseparatedGuess = compressCombinationDigits(
          firstGuess.map(Field)
        );

        const makeGuessTx = await Mina.transaction(
          codebreakerPubKey,
          async () => {
            await zkapp.makeGuess(unseparatedGuess);
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
        const expectedErrorMessage =
          'Please wait for the codemaster to give you a clue!';
        await testInvalidGuess([1, 2, 2, 9], expectedErrorMessage);
      });
    });

    describe('giveClue method tests', () => {
      async function testInvalidClue(
        combination: number[],
        expectedErrorMessage?: string,
        signerKey = codemasterKey,
        signerSalt = codemasterSalt
      ) {
        const secretCombination = compressCombinationDigits(
          combination.map(Field)
        );

        const giveClueTx = async () => {
          const tx = await Mina.transaction(
            signerKey.toPublicKey(),
            async () => {
              await zkapp.giveClue(secretCombination, signerSalt);
            }
          );

          await tx.prove();
          await tx.sign([signerKey]).send();
        };

        await expect(giveClueTx()).rejects.toThrowError(expectedErrorMessage);
      }

      it('should reject any caller other than the codemaster', async () => {
        const expectedErrorMessage =
          'Only the codemaster of this game is allowed to give clue!';
        await testInvalidClue([1, 2, 3, 4], expectedErrorMessage, intruderKey);
      });

      it('should reject codemaster with different salt', async () => {
        const differentSalt = Field.random();
        const expectedErrorMessage =
          'The secret combination is not compliant with the stored hash on-chain!';
        await testInvalidClue(
          [1, 2, 3, 4],
          expectedErrorMessage,
          codemasterKey,
          differentSalt
        );
      });

      it('should reject codemaster with non-compliant secret combination', async () => {
        const expectedErrorMessage =
          'The secret combination is not compliant with the stored hash on-chain!';
        await testInvalidClue([1, 5, 3, 4], expectedErrorMessage);
      });

      it('should accept codemaster clue and update on-chain state', async () => {
        const solution = [1, 2, 3, 4];
        const unseparatedSolution = compressCombinationDigits(
          solution.map(Field)
        );

        const giveClueTx = await Mina.transaction(
          codemasterKey.toPublicKey(),
          async () => {
            zkapp.giveClue(unseparatedSolution, codemasterSalt);
          }
        );

        await giveClueTx.prove();
        await giveClueTx.sign([codemasterKey]).send();

        // Test that the on-chain states are updated: serializedClue, isSolved, and turnCount
        const latestClueIndex = zkapp.turnCount.get().sub(3).div(2).toNumber();
        const serializedClueHistory = zkapp.packedClueHistory.get();
        const clueHistory = deserializeClueHistory(serializedClueHistory);
        const serializedClue = clueHistory[latestClueIndex];
        const clue = deserializeClue(serializedClue);

        expect(clue).toEqual([2, 0, 0, 1].map(Field));

        const isSolved = zkapp.isSolved.get().toBoolean();
        expect(isSolved).toEqual(false);

        const turnCount = zkapp.turnCount.get().toNumber();
        expect(turnCount).toEqual(3);
      });

      it('should reject the codemaster from calling this method out of sequence', async () => {
        const expectedErrorMessage =
          'Please wait for the codebreaker to make a guess!';
        await testInvalidClue([1, 2, 3, 4], expectedErrorMessage);
      });
    });

    describe('makeGuess method tests: second guess onwards', () => {
      async function testInvalidGuess(
        guess: number[],
        expectedErrorMessage?: string,
        signerKey = codebreakerKey
      ) {
        const unseparatedGuess = compressCombinationDigits(guess.map(Field));

        const makeGuessTx = async () => {
          const tx = await Mina.transaction(
            signerKey.toPublicKey(),
            async () => {
              await zkapp.makeGuess(unseparatedGuess);
            }
          );

          await tx.prove();
          await tx.sign([signerKey]).send();
        };

        await expect(makeGuessTx()).rejects.toThrowError(expectedErrorMessage);
      }

      it('should reject any caller other than the codebreaker', async () => {
        const expectedErrorMessage =
          'You are not the codebreaker of this game!';
        await testInvalidGuess([1, 4, 7, 2], expectedErrorMessage, intruderKey);
      });

      // validGuess2 = [1, 4, 7, 2]
      it('should accept another valid guess & update on-chain state', async () => {
        const secondGuess = [1, 4, 7, 2];
        const compactGuess = compressCombinationDigits(secondGuess.map(Field));

        const makeGuessTx = await Mina.transaction(
          codebreakerKey.toPublicKey(),
          async () => {
            await zkapp.makeGuess(compactGuess);
          }
        );

        await makeGuessTx.prove();
        await makeGuessTx.sign([codebreakerKey]).send();

        // Test that the on-chain states are updated
        const updatedCodebreakerId = zkapp.codebreakerId.get();
        expect(updatedCodebreakerId).not.toEqual(Field(0));

        const turnCount = zkapp.turnCount.get().toNumber();
        expect(turnCount).toEqual(4);
      });

      it('should reject the codebraker from calling this method out of sequence', async () => {
        const expectedErrorMessage =
          'Please wait for the codemaster to give you a clue!';
        await testInvalidGuess([1, 2, 4, 8], expectedErrorMessage);
      });
    });

    describe('test game to completion reaching number limit of attempts=5', () => {
      async function makeGuess(guess: number[]) {
        const unseparatedGuess = compressCombinationDigits(guess.map(Field));

        const makeGuessTx = await Mina.transaction(
          codebreakerKey.toPublicKey(),
          async () => {
            await zkapp.makeGuess(unseparatedGuess);
          }
        );

        await makeGuessTx.prove();
        await makeGuessTx.sign([codebreakerKey]).send();
      }

      async function giveClue(expectedClue: number[]) {
        const solution = [1, 2, 3, 4];
        const unseparatedSolution = compressCombinationDigits(
          solution.map(Field)
        );

        const giveClueTx = await Mina.transaction(
          codemasterKey.toPublicKey(),
          async () => {
            await zkapp.giveClue(unseparatedSolution, codemasterSalt);
          }
        );

        await giveClueTx.prove();
        await giveClueTx.sign([codemasterKey]).send();

        const latestClueIndex = zkapp.turnCount.get().sub(3).div(2).toNumber();
        const serializedClueHistory = zkapp.packedClueHistory.get();
        const clueHistory = deserializeClueHistory(serializedClueHistory);
        const serializedClue = clueHistory[latestClueIndex];
        const clue = deserializeClue(serializedClue);

        expect(clue).toEqual(expectedClue.map(Field));
      }

      // Should give clue of second guess and then alternate guess/clue round till roundsLimit=5
      it('should give clue of second guess', async () => {
        await giveClue([2, 1, 0, 1]);
      });

      it('should make third guess', async () => {
        await makeGuess([1, 3, 4, 8]);
      });

      it('should give clue of third guess', async () => {
        await giveClue([2, 1, 1, 0]);
      });

      it('should make fourth guess', async () => {
        await makeGuess([5, 8, 3, 7]);
      });

      it('should give clue of fourth guess', async () => {
        await giveClue([0, 0, 2, 0]);
      });

      it('should make fifth guess', async () => {
        await makeGuess([9, 1, 2, 4]);
      });

      it('should give clue of fifth guess', async () => {
        await giveClue([0, 1, 1, 2]);
      });

      it('should reject 6th guess: reached limited number of attempts', async () => {
        const expectedErrorMessage =
          'You have reached the number limit of attempts to solve the secret combination!';
        await expect(makeGuess([1, 2, 3, 4])).rejects.toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject giving 6th clue: reached limited number of attempts', async () => {
        const expectedErrorMessage =
          'The codebreaker has finished the number of attempts without solving the secret combination!';
        await expect(giveClue([2, 2, 2, 2])).rejects.toThrowError(
          expectedErrorMessage
        );
      });
    });
  });
});

describe('Deploy new Game and  block the game upon solving the secret combination', () => {
  let codemasterKey: PrivateKey,
    codebreakerKey: PrivateKey,
    zkappAddress: PublicKey,
    zkappPrivateKey: PrivateKey,
    zkapp: MastermindZkApp,
    codemasterSalt: Field;

  beforeAll(async () => {
    if (proofsEnabled) await MastermindZkApp.compile();

    // Set up the Mina local blockchain
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);

    // Local.testAccounts is an array of 10 test accounts that have been pre-filled with Mina
    codemasterKey = Local.testAccounts[0].key;
    codebreakerKey = Local.testAccounts[1].key;

    // Set up the zkapp account
    zkappPrivateKey = PrivateKey.random();
    zkappAddress = zkappPrivateKey.toPublicKey();
    zkapp = new MastermindZkApp(zkappAddress);

    // Generate random field as salt for the codemaster
    codemasterSalt = Field.random();
  });

  async function makeGuess(guess: number[]) {
    const unseparatedGuess = compressCombinationDigits(guess.map(Field));

    const makeGuessTx = await Mina.transaction(
      codebreakerKey.toPublicKey(),
      async () => {
        await zkapp.makeGuess(unseparatedGuess);
      }
    );

    await makeGuessTx.prove();
    await makeGuessTx.sign([codebreakerKey]).send();
  }

  async function giveClue(expectedClue: number[]) {
    const solution = [7, 1, 6, 3];
    const unseparatedSolution = compressCombinationDigits(solution.map(Field));

    const giveClueTx = await Mina.transaction(
      codemasterKey.toPublicKey(),
      async () => {
        await zkapp.giveClue(unseparatedSolution, codemasterSalt);
      }
    );

    await giveClueTx.prove();
    await giveClueTx.sign([codemasterKey]).send();

    const latestClueIndex = zkapp.turnCount.get().sub(3).div(2).toNumber();
    const serializedClueHistory = zkapp.packedClueHistory.get();
    const clueHistory = deserializeClueHistory(serializedClueHistory);
    const latestClueSerialized = clueHistory[latestClueIndex];
    const clue = deserializeClue(latestClueSerialized);

    expect(clue).toEqual(expectedClue.map(Field));
  }

  it('Generate and Deploy `Mastermind` smart contract', async () => {
    await localDeploy(zkapp, codemasterKey, zkappPrivateKey);
  });

  // Initialize the game to reset the game
  it('Initialize a new game', async () => {
    await initializeGame(zkapp, codemasterKey, 10);
  });

  // Create a new game
  it('should create a new game with new secret', async () => {
    const secretCombination = [7, 1, 6, 3];
    const compactSecretCombination = compressCombinationDigits(
      secretCombination.map(Field)
    );

    const createGameTx = await Mina.transaction(
      codemasterKey.toPublicKey(),
      async () => {
        await zkapp.createGame(compactSecretCombination, codemasterSalt);
      }
    );

    await createGameTx.prove();
    await createGameTx.sign([codemasterKey]).send();
  });

  it('should solve the game in the first round', async () => {
    await makeGuess([7, 1, 6, 3]);
  });

  it('should give clue and report that the secret is solved', async () => {
    await giveClue([2, 2, 2, 2]);

    const isSolved = zkapp.isSolved.get().toBoolean();
    expect(isSolved).toEqual(true);
  });

  it('should reject next guess: secret is already solved', async () => {
    const expectedErrorMessage =
      'You have already solved the secret combination!';
    await expect(makeGuess([7, 1, 6, 3])).rejects.toThrowError(
      expectedErrorMessage
    );
  });

  it('should reject next clue: secret is already solved', async () => {
    const expectedErrorMessage =
      'The codebreaker has already solved the secret combination!';
    await expect(giveClue([2, 2, 2, 2])).rejects.toThrowError(
      expectedErrorMessage
    );
  });
});
