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

import { checkIfSolved, deserializeClue } from './utils.js';

import { SolutionProof, GuessProof, ClueProof } from './zkPrograms.js';

export { MastermindZkApp };

class MastermindZkApp extends SmartContract {
  @state(UInt8) maxAttempts = State<UInt8>();
  @state(UInt8) turnCount = State<UInt8>();

  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();

  @state(Field) solutionHash = State<Field>();
  @state(Field) unseparatedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();

  @state(Bool) isSolved = State<Bool>();

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

  @method async createGame(validSecretProof: SolutionProof) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    //! Restrict this method to be only called once at the beginning of a game
    turnCount.assertEquals(0, 'A mastermind game is already created!');

    //! Verify that the solution's combination digits are valid
    validSecretProof.verify();

    // Store the solution hash on-chain
    this.solutionHash.set(validSecretProof.publicOutput);

    // Generate codemaster ID
    const codemasterId = Poseidon.hash(
      this.sender.getAndRequireSignature().toFields()
    );

    // Store codemaster ID on-chain
    this.codemasterId.set(codemasterId);

    // Increment on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }

  //! Warning: The Code Breaker must interpret the most recent clue from the Code Master before calling this method.
  //! The process involves retrieving the latest clue, unpacking it, and using it to guide the next guess.
  @method async makeGuess(validGuessProof: GuessProof) {
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

    //! Assert that the codebreaker has not reached the limited number of attempts
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

    //! Verify that the guess used in the proof is valid
    validGuessProof.verify();
    const guess = validGuessProof.publicInput;

    // Update the on-chain unseparated guess
    this.unseparatedGuess.set(guess);

    // Increment turnCount and wait for the codemaster to give a clue
    this.turnCount.set(turnCount.add(1));
  }

  @method async giveClue(validClueProof: ClueProof) {
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

    //! Assert that the codebreaker has not reached the limited number of attempts
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

    //! Assert that the turnCount is even & not zero for the codemaster to call this method
    const isNotFirstTurn = turnCount.value.equals(0).not();
    const isCodemasterTurn = turnCount.value.isEven().and(isNotFirstTurn);
    isCodemasterTurn.assertTrue(
      'Please wait for the codebreaker to make a guess!'
    );

    //! Verify that the clue computation is valid
    validClueProof.verify();

    // Retrieve the guess, solution hash, and the generated serialized clue from the verified proof
    const guess = validClueProof.publicInput;
    const [proofSolutionHash, serializedClue] = validClueProof.publicOutput;

    // Fetch the most recent on-chain guess
    const unseparatedGuess = this.unseparatedGuess.getAndRequireEquals();

    //! Assert that the guess in the proof matches the committed on-chain value
    unseparatedGuess.assertEquals(
      guess,
      'The provided guess in the proof does not match the committed on-chain value!'
    );

    //! Assert that the computed solution hash in the proof matches the committed on-chain value
    this.solutionHash
      .getAndRequireEquals()
      .assertEquals(
        proofSolutionHash,
        'The secret combination is not compliant with the stored hash on-chain!'
      );

    // Check if the guess is correct & update the on-chain state
    const clue = deserializeClue(serializedClue);
    let isSolved = checkIfSolved(clue);
    this.isSolved.set(isSolved);

    // Update the on-chain clue
    this.serializedClue.set(serializedClue);

    // Increment the on-chain turnCount
    this.turnCount.set(turnCount.add(1));
  }
}
