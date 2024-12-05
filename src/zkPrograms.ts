import { Field, Poseidon, Provable, ZkProgram } from 'o1js';
import {
  getClueFromGuess,
  separateCombinationDigits,
  serializeClue,
  validateCombination,
} from './utils.js';

export {
  SolutionProgram,
  SolutionProof,
  GuessProgram,
  GuessProof,
  ClueProgram,
  ClueProof,
};

/**
 * Note: Although both the secret and the guess are combinations that could be validated within the same `ZkProgram` methods,
 * we have separated them into different programs due to differing public input and output signatures.
 */
let SolutionProgram = ZkProgram({
  name: 'valid-combination-proof',
  publicOutput: Field,

  // Validates the Code Master's secret combination and returns the solution hash
  methods: {
    validateSecret: {
      privateInputs: [Field, Field],
      async method(unseparatedSecretCombination: Field, salt: Field) {
        const secretCombination = separateCombinationDigits(
          unseparatedSecretCombination
        );

        validateCombination(secretCombination);

        const solutionHash = Poseidon.hash([...secretCombination, salt]);

        return {
          publicOutput: solutionHash,
        };
      },
    },
  },
});

let GuessProgram = ZkProgram({
  name: 'valid-combination-proof',
  publicInput: Field,

  // Validates the Code Breaker's guess combination
  methods: {
    validateGuess: {
      privateInputs: [],
      async method(guess: Field) {
        const guessDigits = separateCombinationDigits(guess);
        validateCombination(guessDigits);
      },
    },
  },
});

let ClueProgram = ZkProgram({
  name: 'valid-clue-proof',
  publicOutput: Provable.Array(Field, 2),
  publicInput: Field,

  // Generates a clue based on the Code Breaker's guess, used by the Code Master
  methods: {
    getClueFromGuess: {
      privateInputs: [Field, Field],
      async method(guess: Field, secret: Field, salt: Field) {
        const solution = separateCombinationDigits(secret);
        const computedSolutionHash = Poseidon.hash([...solution, salt]);

        const guessDigits = separateCombinationDigits(guess);
        const clue = getClueFromGuess(guessDigits, solution);
        const serializedClue = serializeClue(clue);

        return {
          publicOutput: [computedSolutionHash, serializedClue],
        };
      },
    },
  },
});

let SolutionProof_ = ZkProgram.Proof(SolutionProgram);
class SolutionProof extends SolutionProof_ {}

let GuessProof_ = ZkProgram.Proof(GuessProgram);
class GuessProof extends GuessProof_ {}

let ClueProof_ = ZkProgram.Proof(ClueProgram);
class ClueProof extends ClueProof_ {}

/**
 * The following code demonstrates how to unit-test ZkProgram proofs.
 * You can generate proofs, verify their validity, and check the integrity of the expected public inputs and outputs.
 *
 * Note: This code is commented out to prevent execution when importing from the same file.
 * We have not included specific test cases here because the logic within the ZkPrograms is already tested in
 * `./utils.test.ts` and through integration tests in `./Mastermind.test.ts`.
 */

/* 
import { assert } from 'o1js';

console.time('Compiling SolutionProgram...');
await SolutionProgram.compile();
console.timeEnd('Compiling SolutionProgram...');

let proof;
({ proof } = await SolutionProgram.validateSecret(Field(1234), Field.random()));
const isSecretProofValid = await SolutionProgram.verify(proof);

assert(isSecretProofValid, 'Proof is not valid!');
Provable.log(
  'Solution Proof: PublicOutput (solution hash):',
  proof.publicOutput,
  '\n'
);

// ----------------------------------------

console.time('Compiling GuessProgram...');
await GuessProgram.compile();
console.timeEnd('Compiling GuessProgram...');

({ proof } = await GuessProgram.validateGuess(Field(3456)));
const isGuessProofValid = await GuessProgram.verify(proof);

assert(isGuessProofValid, 'Proof is not valid!');
Provable.log('Guess Proof: PublicInput (guess):', proof.publicInput, '\n');

// ----------------------------------------

console.time('Compiling ClueProgram...');
await ClueProgram.compile();
console.timeEnd('Compiling ClueProgram...');

({ proof } = await ClueProgram.getClueFromGuess(
  Field(3456), // Guess
  Field(1234), // Secret
  Field.random() // Salt
));

const isClueProofValid = await ClueProgram.verify(proof);
assert(isClueProofValid, 'Proof is not valid!');

Provable.log('Clue Proof: PublicInput (guess):', proof.publicInput);
Provable.log(
  'Clue Proof: PublicOutput (solution hash):',
  proof.publicOutput[0]
);
Provable.log(
  'Clue Proof: PublicOutput (serialized clue):',
  proof.publicOutput[1]
); 
*/
