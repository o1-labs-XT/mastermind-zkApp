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
  separateCombinationDigits,
  validateCombination,
  serializeClue,
  serializeClueHistory,
  deserializeClueHistory,
  getClueFromGuess,
  checkIfSolved,
  serializeCombinationHistory,
  deserializeCombinationHistory,
  getElementAtIndex,
  updateElementAtIndex,
} from './utils.js';

export class MastermindZkApp extends SmartContract {
  @state(UInt8) maxAttempts = State<UInt8>();
  @state(UInt8) turnCount = State<UInt8>();
  @state(Bool) isSolved = State<Bool>();

  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();

  @state(Field) solutionHash = State<Field>();
  @state(Field) packedGuessHistory = State<Field>();
  @state(Field) packedClueHistory = State<Field>();

  @method async initGame(maxAttempts: UInt8) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    // Sets your entire state to 0.
    super.init();

    maxAttempts.assertGreaterThanOrEqual(
      UInt8.from(5),
      'The minimum number of attempts allowed is 5!'
    );

    maxAttempts.assertLessThanOrEqual(
      UInt8.from(15),
      'The maximum number of attempts allowed is 15!'
    );

    this.maxAttempts.set(maxAttempts);
  }

  @method async createGame(unseparatedSecretCombination: Field, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    //! Restrict this method to be only called once at the beginning of a game
    turnCount.assertEquals(0, 'A mastermind game is already created!');

    //! Separate combination digits and validate
    const secretCombination = separateCombinationDigits(
      unseparatedSecretCombination
    );

    validateCombination(secretCombination);

    // Generate solution hash & store on-chain
    const solutionHash = Poseidon.hash([...secretCombination, salt]);
    this.solutionHash.set(solutionHash);

    // Generate codemaster ID
    const codemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Store codemaster ID on-chain
    this.codemasterId.set(codemasterId);

    // Increment on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }

  //! Before calling this method the codebreaker should interpret
  //! the codemaster clue beforehand and make a guess
  @method async makeGuess(guess: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    //! Assert that the secret combination is not solved yet
    this.isSolved
      .getAndRequireEquals()
      .assertFalse('You have already solved the secret combination!');

    //! Only allow codebreaker to call this method following the correct turn sequence
    const isCodebreakerTurn = turnCount.value.isEven().not();
    isCodebreakerTurn.assertTrue(
      'Please wait for the codemaster to give you a clue!'
    );

    //! Assert that the codebreaker has not reached the limit number of attempts
    const maxAttempts = this.maxAttempts.getAndRequireEquals();
    turnCount.assertLessThan(
      maxAttempts.mul(2),
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    // Generate an ID for the caller
    const computedCodebreakerId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

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

    //! Separate and validate the guess combination
    const guessDigits = separateCombinationDigits(guess);
    validateCombination(guessDigits);

    // Fetch the serialized guess history
    const serializedGuessHistory =
      this.packedGuessHistory.getAndRequireEquals();

    // Deserialize the guess history into an array of combinations
    const guessHistory = deserializeCombinationHistory(serializedGuessHistory);

    // Update the guess history with the new guess at the calculated index (based on turn count)
    const updatedGuessHistory = updateElementAtIndex(
      guess,
      guessHistory,
      turnCount.sub(1).div(2).value // Adjust index for alternating turns
    );

    // Serialize the updated guess history
    const serializedUpdatedGuessHistory =
      serializeCombinationHistory(updatedGuessHistory);

    // Store the updated serialized guess history
    this.packedGuessHistory.set(serializedUpdatedGuessHistory);

    // Increment turnCount and wait for the codemaster to give a clue
    this.turnCount.set(turnCount.add(1));
  }

  @method async giveClue(unseparatedSecretCombination: Field, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    // Generate codemaster ID
    const computedCodemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    //! Restrict method access solely to the correct codemaster
    this.codemasterId
      .getAndRequireEquals()
      .assertEquals(
        computedCodemasterId,
        'Only the codemaster of this game is allowed to give clue!'
      );

    //! Assert that the codebreaker has not reached the limit number of attempts
    const maxAttempts = this.maxAttempts.getAndRequireEquals();
    turnCount.assertLessThanOrEqual(
      maxAttempts.mul(2),
      'The codebreaker has finished the number of attempts without solving the secret combination!'
    );

    //! Assert that the secret combination is not solved yet
    this.isSolved
      .getAndRequireEquals()
      .assertFalse(
        'The codebreaker has already solved the secret combination!'
      );

    //! Assert that the turnCount is pair & not zero for the codemaster to call this method
    const isNotFirstTurn = turnCount.value.equals(0).not();
    const isCodemasterTurn = turnCount.value.isEven().and(isNotFirstTurn);
    isCodemasterTurn.assertTrue(
      'Please wait for the codebreaker to make a guess!'
    );

    // Separate the secret combination digits
    const solution = separateCombinationDigits(unseparatedSecretCombination);

    //! Compute solution hash and assert integrity to state on-chain
    const computedSolutionHash = Poseidon.hash([...solution, salt]);
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        computedSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    // Fetch and deserialize the on-chain guess history
    const serializedGuessHistory =
      this.packedGuessHistory.getAndRequireEquals();
    const guessHistory = deserializeCombinationHistory(serializedGuessHistory);

    // Get the latest guess based on the latest guess index
    const guessIndex = turnCount.div(2).sub(1).value;
    const latestGuess = getElementAtIndex(guessHistory, guessIndex);
    const guessDigits = separateCombinationDigits(latestGuess);

    // Determine clue (hit/blow) based on the guess and solution
    let clue = getClueFromGuess(guessDigits, solution);

    // Check if the guess is correct and update the solved status on-chain
    let isSolved = checkIfSolved(clue);
    this.isSolved.set(isSolved);

    // Serialize and update the on-chain clue history
    const serializedClue = serializeClue(clue);
    const serializedClueHistory = this.packedClueHistory.getAndRequireEquals();
    const clueHistory = deserializeClueHistory(serializedClueHistory);
    const updatedClueHistory = updateElementAtIndex(
      serializedClue,
      clueHistory,
      guessIndex
    );

    // Serialize and store the updated clue history on-chain
    const serializedUpdatedClueHistory =
      serializeClueHistory(updatedClueHistory);
    this.packedClueHistory.set(serializedUpdatedClueHistory);

    // Increment the on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }
}
