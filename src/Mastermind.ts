//TODO Store the record of guesses in a merkle tree or a serialized field
//TODO Store the record of clues in a merkle tree or a serialized field
//TODO Add events
//TODO? prevent the codemaster from being the codebreaker of the same game

import {
  Field,
  SmartContract,
  state,
  State,
  method,
  UInt8,
  Provable,
  Poseidon,
  Bool,
} from 'o1js';

import {
  deserializeCombination,
  validateCombination,
  serializeClue,
} from './utils';

export class MastermindZkApp extends SmartContract {
  @state(UInt8) roundsLimit = State<UInt8>();
  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();
  @state(Field) solutionHash = State<Field>();
  @state(Field) serializedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();
  @state(UInt8) turnCount = State<UInt8>();
  @state(Bool) isSolved = State<Bool>();

  @method initGame(roundsNO: UInt8) {
    super.init();

    this.roundsLimit.set(roundsNO);
    this.turnCount.set(UInt8.from(0));
    this.codemasterId.set(Field(0));
    this.codebreakerId.set(Field(0));
    this.solutionHash.set(Field(0));
    this.serializedGuess.set(Field(0));
    this.serializedClue.set(Field(0));
    this.isSolved.set(Bool(false));
  }

  @method createGame(serializedSecretCombination: Field, salt: Field) {
    const turnCount = this.turnCount.getAndRequireEquals();

    //! Restrict this method to be only called once at the beginnig of a game
    turnCount.assertEquals(0, 'A mastermind game is already created!');

    //! Deserialize and validate solution
    const secretCombination = deserializeCombination(
      serializedSecretCombination
    );
    validateCombination(secretCombination);

    // Generate solution hash & store on-chain
    const solutionHash = Poseidon.hash([...secretCombination, salt]);
    this.solutionHash.set(solutionHash);

    // Generate codemaster ID -> taking address & salt
    const codemasterId = Poseidon.hash([...this.sender.toFields(), salt]);

    // Store codemaster ID on-chain
    this.codemasterId.set(codemasterId);

    // Initiate game & increment on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }

  //! Before calling this method the codebreaker should read
  //! the codemaster clue beforehand and make a guess
  @method makeGuess(serializedGuess: Field, salt: Field) {
    const turnCount = this.turnCount.getAndRequireEquals();

    //! Only allow codebreaker to call this method following the correct turn sequence
    const isCodebreakerTurn = turnCount.value.isEven().not();
    isCodebreakerTurn.assertTrue(
      'Please wait for the codemaster to give you a clue!'
    );

    //! Assert that the secret combination is not solved yet
    this.isSolved
      .getAndRequireEquals()
      .assertFalse('You have already solved the secret combination!');

    //! Assert that the codebreaker has not reached the limit number of attempts
    const roundLimit = this.roundsLimit.getAndRequireEquals();
    turnCount.assertLessThan(
      roundLimit.mul(2),
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    // Compute codebreaker ID -> taking address & salt
    const computedCodebreakerId = Poseidon.hash([
      ...this.sender.toFields(),
      salt,
    ]);

    const setCodeBreakerId = () => {
      this.codebreakerId.set(computedCodebreakerId);
      return computedCodebreakerId;
    };

    //? If first guess ==> set the codebreaker ID
    //? Else           ==> fetch the codebreaker ID
    const isFirstGuess = turnCount.value.equals(1);
    const codebreakerId = Provable.if(
      isFirstGuess,
      setCodeBreakerId(),
      this.codebreakerId.getAndRequireEquals()
    );

    //! Restrict method access solely to the correct codebreaker
    computedCodebreakerId.assertEquals(
      codebreakerId,
      'You are not the codebreaker of this game!'
    );

    //! Deserialize and validate the guess combination
    const guess = deserializeCombination(serializedGuess);
    validateCombination(guess);

    // Update the on-chain serialized guess
    this.serializedGuess.set(serializedGuess);

    // Increment turnCount and wait for the codemaster to give a clue
    this.turnCount.set(turnCount.add(1));
  }

  @method giveClue(serializedSecretCombination: Field, salt: Field) {
    const turnCount = this.turnCount.getAndRequireEquals();

    //! Assert that the turnCount is pair & not zero for the codemaster to call this method
    const isNotFirstTurn = turnCount.value.equals(0).not();
    const isCodemasterTurn = turnCount.value.isEven().and(isNotFirstTurn);
    isCodemasterTurn.assertTrue(
      'Please wait for the codebreaker to make a guess!'
    );

    //! Assert that the secret combination is not solved yet
    this.isSolved
      .getAndRequireEquals()
      .assertFalse(
        'The codebreaker has already solved the secret combination!'
      );

    //! Assert that the codebreaker has not reached the limit number of attempts
    const roundLimit = this.roundsLimit.getAndRequireEquals();
    turnCount.assertLessThanOrEqual(
      roundLimit.mul(2),
      'The codebreaker has finished the number of attempts without solving the secret combination!'
    );

    // Generate codemaster ID
    const computedCodemasterId = Poseidon.hash([
      ...this.sender.toFields(),
      salt,
    ]);

    //! Restrict method access solely to the correct codemaster
    this.codemasterId
      .getAndRequireEquals()
      .assertEquals(
        computedCodemasterId,
        'Only the codemaster of this game is allowed to give clue!'
      );

    // Deserialize the secret combination
    const solution = deserializeCombination(serializedSecretCombination);

    //! Compute solution hash and assert integrity to state on-chain
    const computedSolutionHash = Poseidon.hash([...solution, salt]);
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        computedSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    // Fetch & deserialize the on-chain guess
    const serializedGuess = this.serializedGuess.getAndRequireEquals();
    const guess = deserializeCombination(serializedGuess);

    // Scan the guess through the solution and return clue result(hit or blow)
    let clue = Array.from({ length: 4 }, () => Field(0));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const isEqual = guess[i].equals(solution[j]).toField();
        // eslint-disable-next-line o1js/no-if-in-circuit
        if (i == j) clue[i] = clue[i].add(isEqual.mul(2));
        else clue[i] = clue[i].add(isEqual);
      }
    }

    // Check if the guess is correct & update the on-chain state
    let isSolved = Bool(true);
    for (let i = 0; i < 4; i++) {
      let isHit = clue[i].equals(2);
      isSolved = isSolved.and(isHit);
    }
    this.isSolved.set(isSolved);

    // Serialize & update the on-chain clue
    const serializedClue = serializeClue(clue);
    this.serializedClue.set(serializedClue);

    // Increment the on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }
}
