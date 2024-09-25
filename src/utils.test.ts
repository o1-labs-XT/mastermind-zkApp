import {
  deserializeClue,
  deserializeClueHistory,
  deserializeCombinationHistory,
  getClueFromGuess,
  separateCombinationDigits,
  serializeClue,
  serializeClueHistory,
  serializeCombinationHistory,
  validateCombination,
  getElementAtIndex,
  updateElementAtIndex,
} from './utils';
import { Field } from 'o1js';

function generateRandomCombinations(length: number): Field[] {
  const randomNumbers: number[] = [];

  for (let i = 0; i < length; i++) {
    const randomFourDigitNumber = Math.floor(1000 + Math.random() * 9000);
    randomNumbers.push(randomFourDigitNumber);
  }

  return randomNumbers.map(Field);
}

describe('Provable utilities - unit tests', () => {
  describe('Tests for separateCombinationDigits function', () => {
    it('should reject a 3-digit combination', () => {
      const combination = Field(123);
      const expectedErrorMessage =
        'The combination must be a four-digit Field!';
      expect(() => separateCombinationDigits(combination)).toThrowError(
        expectedErrorMessage
      );
    });

    it('should reject a 5-digit combination', () => {
      const combination = Field(12345);
      const expectedErrorMessage =
        'The combination must be a four-digit Field!';
      expect(() => separateCombinationDigits(combination)).toThrowError(
        expectedErrorMessage
      );
    });

    it('should return the correct separated digits - case 1', () => {
      const combination = Field(1234);
      const expectedDigits = [1, 2, 3, 4].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });

    it('should return the correct separated digits - case 2', () => {
      const combination = Field(5678);
      const expectedDigits = [5, 6, 7, 8].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });

    it('should return the correct separated digits - case 3', () => {
      const combination = Field(7185);
      const expectedDigits = [7, 1, 8, 5].map(Field);

      expect(separateCombinationDigits(combination)).toEqual(expectedDigits);
    });
  });

  describe('Tests for validateCombination function', () => {
    describe('InValid Combinations: contains 0', () => {
      // No need to check if the first digit is 0, as this would reduce the combination to a 3-digit value.
      it('should reject combination: second digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 2 should not be zero!';
        const combination = [1, 0, 9, 8].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 3 should not be zero!';
        const combination = [7, 2, 0, 5].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 4 should not be zero!';
        const combination = [9, 1, 5, 0].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Invalid Combinations: Not unique digits', () => {
      it('should reject combination: second digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        const combination = [1, 1, 9, 3].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        const combination = [2, 5, 5, 7].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        const combination = [2, 7, 5, 2].map(Field);
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Valid Combinations', () => {
      it('should accept a valid combination: case 1', () => {
        const combination = [2, 7, 5, 3].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 2', () => {
        const combination = [9, 8, 6, 4].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 3', () => {
        const combination = [7, 1, 3, 5].map(Field);
        expect(() => validateCombination(combination)).not.toThrow();
      });
    });
  });

  describe('Tests for getClueFromGuess function', () => {
    it('should return the correct clue: 0 hits - 0 blows', () => {
      const solution = [1, 2, 3, 4].map(Field);
      const guess = [5, 7, 8, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([0, 0, 0, 0].map(Field));
    });

    it('should return the correct clue: 1 hits - 0 blows', () => {
      const solution = [1, 2, 3, 4].map(Field);
      const guess = [1, 7, 8, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 0, 0, 0].map(Field));
    });

    it('should return the correct clue: 4 hits - 0 blows', () => {
      const solution = [1, 7, 3, 9].map(Field);
      const guess = [1, 7, 3, 9].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 2, 2, 2].map(Field));
    });

    it('should return the correct clue: 1 hits - 1 blows', () => {
      const guess = [1, 7, 8, 2].map(Field);
      const solution = [1, 2, 3, 4].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 0, 0, 1].map(Field));
    });

    it('should return the correct clue: 2 hits - 2 blows', () => {
      const guess = [5, 3, 2, 7].map(Field);
      const solution = [5, 2, 3, 7].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([2, 1, 1, 2].map(Field));
    });

    it('should return the correct clue: 0 hits - 4 blows', () => {
      const guess = [1, 2, 3, 4].map(Field);
      const solution = [4, 3, 2, 1].map(Field);
      const clue = getClueFromGuess(guess, solution);

      expect(clue).toEqual([1, 1, 1, 1].map(Field));
    });
  });

  describe('Tests for packing/unpacking multiple fields', () => {
    describe('combination history', () => {
      it('should correctly pack and unpack a combination history of 4 updated elements', () => {
        const inputs = generateRandomCombinations(4);
        const packed = serializeCombinationHistory(inputs);
        const unpacked = deserializeCombinationHistory(packed);

        expect(unpacked.slice(0, inputs.length)).toEqual(inputs);
      });

      it('should correctly pack and unpack a combination history of 15 elements', () => {
        const inputs = generateRandomCombinations(15);
        const packed = serializeCombinationHistory(inputs);
        const unpacked = deserializeCombinationHistory(packed);

        expect(unpacked.slice(0, inputs.length)).toEqual(inputs);
      });

      it('should throw an error when attempting to pack more than 15 elements in combination history', () => {
        const shouldReject = () => {
          const inputs = generateRandomCombinations(16);
          const packed = serializeCombinationHistory(inputs);
          deserializeCombinationHistory(packed);
        };
        expect(shouldReject).toThrow();
      });
    });

    describe('clue history tests', () => {
      it('should correctly pack and unpack a clue history of 3 updated elements', () => {
        const clues = [
          [2, 0, 0, 1],
          [1, 2, 0, 0],
          [2, 2, 2, 2],
        ].map((c) => c.map(Field));

        const serializedClues = clues.map(serializeClue);
        const packedSerializedClues = serializeClueHistory(serializedClues);
        const unpackedSerializedClues = deserializeClueHistory(
          packedSerializedClues
        );
        const unpackedDeserializedClues =
          unpackedSerializedClues.map(deserializeClue);

        expect(unpackedDeserializedClues.slice(0, clues.length)).toEqual(clues);
      });

      it('should correctly pack and unpack a clue history of 15 elements', () => {
        const clues = Array.from({ length: 15 }, () => [1, 2, 1, 0].map(Field));
        const serializedClues = clues.map(serializeClue);
        const packedSerializedClues = serializeClueHistory(serializedClues);
        const unpackedSerializedClues = deserializeClueHistory(
          packedSerializedClues
        );
        const unpackedDeserializedClues =
          unpackedSerializedClues.map(deserializeClue);

        expect(unpackedDeserializedClues.slice(0, clues.length)).toEqual(clues);
      });

      it('should throw an error when attempting to pack more than 15 elements in clue history', () => {
        const shouldReject = () => {
          const clues = Array.from({ length: 16 }, () =>
            [1, 2, 1, 0].map(Field)
          );
          const serializedClues = clues.map(serializeClue);
          const packedSerializedClues = serializeClueHistory(serializedClues);
          deserializeClueHistory(packedSerializedClues);
        };
        expect(shouldReject).toThrow();
      });
    });
  });

  describe('Tests for dynamic indexing & updating of field arrays', () => {
    describe('getElementAtIndex', () => {
      it('should return the same elements as JS array indexing', () => {
        const fieldArray = generateRandomCombinations(10);
        for (let i = 0; i < fieldArray.length; i++) {
          expect(getElementAtIndex(fieldArray, Field(i))).toEqual(
            fieldArray[i]
          );
        }
      });

      it('should throw an error for out-of-bounds index', () => {
        const fieldArray = generateRandomCombinations(15);
        const shouldReject = () => {
          const outOfBoundIndex = Field(16);
          getElementAtIndex(fieldArray, outOfBoundIndex);
        };

        expect(shouldReject).toThrow(
          'Invalid index: Index out of bounds or multiple indices match!'
        );
      });
    });

    describe('updateElementAtIndex', () => {
      it('should correctly update an element at the specified index', () => {
        const fieldArray = generateRandomCombinations(10);
        const newValue = Field(9999);
        const indexToUpdate = Field(4); // Choose an index to update

        const updatedArray = updateElementAtIndex(
          newValue,
          fieldArray,
          indexToUpdate
        );

        // Ensure the updated index has the new value
        expect(getElementAtIndex(updatedArray, indexToUpdate)).toEqual(
          newValue
        );

        // Ensure other elements remain unchanged
        for (let i = 0; i < fieldArray.length; i++) {
          if (i !== 4) {
            expect(getElementAtIndex(updatedArray, Field(i))).toEqual(
              fieldArray[i]
            );
          }
        }
      });

      it('should throw an error for out-of-bounds index during update', () => {
        const fieldArray = generateRandomCombinations(10);
        const newValue = Field(9999);
        const outOfBoundIndex = Field(12); // Out of bounds for an array of length 10

        const shouldReject = () => {
          updateElementAtIndex(newValue, fieldArray, outOfBoundIndex);
        };

        expect(shouldReject).toThrow('Invalid index: Index out of bounds!');
      });
    });
  });
});
