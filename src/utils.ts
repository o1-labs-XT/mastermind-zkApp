//TODO Refactor serialize & deserialize

import { Field } from 'o1js';

export {
  serializeCombination,
  deserializeCombination,
  validateCombination,
  serializeClue,
  deserializeClue,
  getClueFromGuess,
};

function serializeCombination(combination: number[]) {
  const combinationBits = combination.map((x) => Field(x).toBits(4));
  const serializedCombination = Field.fromBits(combinationBits.flat());

  return serializedCombination;
}

function deserializeCombination(
  serializedCombination: Field
): [Field, Field, Field, Field] {
  const bits = serializedCombination.toBits(16);
  const combA = Field.fromBits(bits.slice(0, 4));
  const combB = Field.fromBits(bits.slice(4, 8));
  const combC = Field.fromBits(bits.slice(8, 12));
  const combD = Field.fromBits(bits.slice(12, 16));

  return [combA, combB, combC, combD];
}

function validateCombination(combination: [Field, Field, Field, Field]) {
  for (let i = 0; i < 4; i++) {
    // Check that the combination does not contain the digit 0
    combination[i]
      .equals(0)
      .assertFalse(`Combination digit ${i + 1} should not be zero!`);

    // Check that the combination contains one-digit numbers only
    combination[i].assertLessThanOrEqual(
      9,
      `Combination digit ${i + 1} should be between 1 and 9!`
    );

    // Check that the combination digits are unique
    for (let j = i + 1; j < 4; j++) {
      combination[i].assertNotEquals(
        combination[j],
        `Combination digit ${j + 1} is not unique!`
      );
    }
  }
}

function serializeClue(clue: Field[]) {
  const clueBits = clue.map((f) => f.toBits(2)).flat();
  const serializedClue = Field.fromBits(clueBits);

  return serializedClue;
}

function deserializeClue(serialziedClue: Field): [Field, Field, Field, Field] {
  const bits = serialziedClue.toBits(8);
  const clueA = Field.fromBits(bits.slice(0, 2));
  const clueB = Field.fromBits(bits.slice(2, 4));
  const clueC = Field.fromBits(bits.slice(4, 6));
  const clueD = Field.fromBits(bits.slice(6, 8));

  return [clueA, clueB, clueC, clueD];
}

/**
 * Compares the guess with the solution and returns a clue indicating hits and blows.
 * A "hit" is when a guess digit matches a solution digit in both value and position.
 * A "blow" is when a guess digit matches a solution digit in value but not position.
 *
 * @param guess - The array representing the guessed combination.
 * @param solution - The array representing the correct solution.
 * @returns - An array where each element represents the clue for a corresponding guess digit.
 *                           2 indicates a "hit" and 1 indicates a "blow".
 */
function getClueFromGuess(
  guess: [Field, Field, Field, Field],
  solution: [Field, Field, Field, Field]
) {
  let clue = Array.from({ length: 4 }, () => Field(0));

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const isEqual = guess[i].equals(solution[j]).toField();
      if (i === j) {
        clue[i] = clue[i].add(isEqual.mul(2)); // 2 for a hit (correct digit and position)
      } else {
        clue[i] = clue[i].add(isEqual); // 1 for a blow (correct digit, wrong position)
      }
    }
  }

  return clue;
}
