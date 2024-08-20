//TODO UInt32 range optimization checks
//? TODO Add events

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
  getClueFromGuess,
  checkIfSolved,
} from './utils.js';

export class MastermindZkApp extends SmartContract {
  @state(UInt8) roundsLimit = State<UInt8>();
  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();
  @state(Field) solutionHash = State<Field>();
  @state(Field) unseparatedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();
  @state(UInt8) turnCount = State<UInt8>();
  @state(Bool) isSolved = State<Bool>();

  // Note that we have an input for this method this is why we dont use `init() {}` instead
  //! This method can be called by anyone anytime -> risk to reset the game
  @method async initGame(roundsNO: UInt8) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    // Sets your entire state to 0.
    super.init();

    // Only set the states with initial non-zero values
    this.roundsLimit.set(roundsNO);

    // Boolean states are set to false thanks to the `super.init()` -> no need to set like in this line
    // this.isSolved.set(Bool(false));
  }

  @method async createGame(unseparatedSecretCombination: Field, salt: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    //! Restrict this method to be only called once at the beginnig of a game
    turnCount.assertEquals(0, 'A mastermind game is already created!');

    //! Deserialize and validate solution
    const secretCombination = separateCombinationDigits(
      unseparatedSecretCombination
    );

    validateCombination(secretCombination);

    // Generate solution hash & store on-chain
    const solutionHash = Poseidon.hash([...secretCombination, salt]);
    this.solutionHash.set(solutionHash);

    // Generate codemaster ID -> taking address & salt
    const codemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Store codemaster ID on-chain
    this.codemasterId.set(codemasterId);

    // Initiate game & increment on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }

  //! Before calling this method the codebreaker should read
  //! the codemaster clue beforehand and make a guess
  @method async makeGuess(unseparatedGuess: Field) {
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
    const roundLimit = this.roundsLimit.getAndRequireEquals();
    turnCount.assertLessThan(
      roundLimit.mul(2),
      'You have reached the number limit of attempts to solve the secret combination!'
    );

    // Compute codebreaker ID
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

    //! Deserialize and validate the guess combination
    const guessDigits = separateCombinationDigits(unseparatedGuess);
    validateCombination(guessDigits);

    // Update the on-chain unseparated guess
    this.unseparatedGuess.set(unseparatedGuess);

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
    const roundLimit = this.roundsLimit.getAndRequireEquals();
    turnCount.assertLessThanOrEqual(
      roundLimit.mul(2),
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

    // Deserialize the secret combination
    const solution = separateCombinationDigits(unseparatedSecretCombination);

    //! Compute solution hash and assert integrity to state on-chain
    const computedSolutionHash = Poseidon.hash([...solution, salt]);
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        computedSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    // Fetch & deserialize the on-chain guess
    const unseparatedGuess = this.unseparatedGuess.getAndRequireEquals();
    const guessDigits = separateCombinationDigits(unseparatedGuess);

    // Scan the guess through the solution and return clue result(hit or blow)
    let clue = getClueFromGuess(guessDigits, solution);

    // Check if the guess is correct & update the on-chain state
    let isSolved = checkIfSolved(clue);
    this.isSolved.set(isSolved);

    // Serialize & update the on-chain clue
    const serializedClue = serializeClue(clue);
    this.serializedClue.set(serializedClue);

    // Increment the on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }
}
