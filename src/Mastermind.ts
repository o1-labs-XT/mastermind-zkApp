import {
  Field,
  SmartContract,
  state,
  State,
  method,
  UInt8,
  Provable,
  Poseidon,
  Experimental,
} from 'o1js';

import {
  separateCombinationDigits,
  validateCombination,
  serializeClue,
  getClueFromGuess,
  checkIfSolved,
} from './utils.js';

export { MastermindZkApp, offchainState };

const { OffchainState } = Experimental;

const offchainState = OffchainState(
  {
    roundToGuessMap: OffchainState.Map(UInt8, Field),
    guessToClueMap: OffchainState.Map(Field, Field),
  },
  { logTotalCapacity: 4, maxActionsPerUpdate: 2 }
);

class StateProof extends offchainState.Proof {}

class MastermindZkApp extends SmartContract {
  @state(UInt8) maxAttempts = State<UInt8>();
  @state(UInt8) turnCount = State<UInt8>();

  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();

  @state(Field) solutionHash = State<Field>();
  @state(OffchainState.Commitments) offchainStateCommitments =
    offchainState.emptyCommitments();

  offchainState = offchainState.init(this);

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

  //! Warning: The Code Breaker must interpret the most recent clue from the Code Master before calling this method.
  //! The process involves retrieving the latest clue from the settled offchain state, unpacking it, and using it to guide the next guess.
  @method async makeGuess(guess: Field) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertTrue('The game has not been initialized yet!');

    const turnCount = this.turnCount.getAndRequireEquals();

    //! Assert that the secret combination is not solved yet
    turnCount.value.assertNotEquals(
      255,
      'You have already solved the secret combination!'
    );

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

    //! Separate and validate the guess combination
    const guessDigits = separateCombinationDigits(guess);
    validateCombination(guessDigits);

    // while `roundCount` represents the game's progress in terms of rounds.
    // For example, the first guess and the corresponding clue constitute the first round.
    const roundCount = turnCount.sub(1).div(2);

    // Update the current round with the given guess as its value
    // -> tracks the order in which guesses are made.
    this.offchainState.fields.roundToGuessMap.update(roundCount, {
      from: undefined,
      to: guess,
    });

    // Map the given guess as a key to an initial placeholder clue (set to the maximum field value)
    // -> prepares it to be updated with the actual clue later.
    this.offchainState.fields.guessToClueMap.update(guess, {
      from: undefined,
      to: Field(-1),
    });

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

    //! Assert that the secret combination is not solved yet
    turnCount.value.assertNotEquals(
      255,
      'The codebreaker has already solved the secret combination!'
    );

    //! Assert that the codebreaker has not reached the limited number of attempts
    const maxAttempts = this.maxAttempts.getAndRequireEquals();
    turnCount.assertLessThanOrEqual(
      maxAttempts.mul(2),
      'The codebreaker has finished the number of attempts without solving the secret combination!'
    );

    //! Assert that the turnCount is even & not zero for the codemaster to call this method
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

    const roundCount = turnCount.div(2).sub(1);

    // The `roundCount` is used to fetch the latest guess from the `offchainState`,
    // which will then be updated with the corresponding clue.
    const latestGuess = (
      await this.offchainState.fields.roundToGuessMap.get(roundCount)
    ).value;

    const guessDigits = separateCombinationDigits(latestGuess);

    // Determine clue (hit/blow) based on the guess and solution
    let clue = getClueFromGuess(guessDigits, solution);
    const serializedClue = serializeClue(clue);

    this.offchainState.fields.guessToClueMap.update(latestGuess, {
      from: Field(-1),
      to: serializedClue,
    });

    // Check if the guess is correct and update the solved status on-chain
    const isSolved = checkIfSolved(clue);
    const updatedTurnCount = Provable.if(
      isSolved,
      UInt8,
      UInt8.from(255),
      turnCount.add(1)
    ).value;

    // Update the on-chain turnCount
    this.turnCount.set(UInt8.Unsafe.fromField(updatedTurnCount));
  }

  /**
   * Settles the offchain state by providing a storage proof to this method.
   * This methods automatically retrieves and resolves all pending state changes using a recursive reducer
   * before passing the proof to the smart contract's `settle()` method.
   *
   * Note: The `StateProof` should be generated for the transaction calling this method
   * using the following:
   *
   * `const proof = await zkapp.offchainState.createSettlementProof();`
   */
  @method async settle(proof: StateProof) {
    await this.offchainState.settle(proof);
  }
}
