import { validateCombination } from './utils';
import { Field } from 'o1js';

describe('Provable utilities unit tests', () => {
  describe('validate combination tests', () => {
    describe('InValid Combinations: contains 0', () => {
      it('should reject combination: first digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 1 should not be zero!';
        const combination = [0, 3, 4, 5].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: second digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 2 should not be zero!';
        const combination = [1, 0, 9, 8].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 3 should not be zero!';
        const combination = [7, 2, 0, 5].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is 0', () => {
        const expectedErrorMessage = 'Combination digit 4 should not be zero!';
        const combination = [9, 1, 5, 0].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Invalid Combinations: contains double-digit numbers', () => {
      it('should reject combination: first digit is greater than 9', () => {
        const expectedErrorMessage =
          'Combination digit 1 should be between 1 and 9!';
        const combination = [10, 2, 7, 8].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: second digit is greater than 9', () => {
        const expectedErrorMessage =
          'Combination digit 2 should be between 1 and 9!';
        const combination = [2, 15, 3, 7].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is greater than 9', () => {
        const expectedErrorMessage =
          'Combination digit 3 should be between 1 and 9!';
        const combination = [1, 9, 13, 3].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is greater than 9', () => {
        const expectedErrorMessage =
          'Combination digit 4 should be between 1 and 9!';
        const combination = [2, 9, 1, 11].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Invalid Combinations: Not unique digits', () => {
      it('should reject combination: second digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 2 is not unique!';
        const combination = [1, 1, 9, 3].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: third digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 3 is not unique!';
        const combination = [2, 5, 5, 7].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });

      it('should reject combination: fourth digit is not unique', () => {
        const expectedErrorMessage = 'Combination digit 4 is not unique!';
        const combination = [2, 7, 5, 2].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).toThrowError(
          expectedErrorMessage
        );
      });
    });

    describe('Valid Combinations', () => {
      it('should accept a valid combination: case 1', () => {
        const combination = [2, 7, 5, 3].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 2', () => {
        const combination = [9, 8, 6, 4].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).not.toThrow();
      });

      it('should accept a valid combination: case 3', () => {
        const combination = [7, 1, 3, 5].map(Field) as [
          Field,
          Field,
          Field,
          Field
        ];
        expect(() => validateCombination(combination)).not.toThrow();
      });
    });
  });
});
