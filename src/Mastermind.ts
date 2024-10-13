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
  Experimental,
} from 'o1js';

import {
  separateCombinationDigits,
  validateCombination,
  serializeClue,
  getClueFromGuess,
  checkIfSolved,
} from './utils.js';

export { MastermindZkApp, MerkleMap };

const { IndexedMerkleMap } = Experimental;
const height = 4;
class MerkleMap extends IndexedMerkleMap(height) {}

const EMPTY_INDEXED_TREE4_ROOT =
  Field(
    848604956632493824118771612864662079593461935463909306433364671356729156850n
  );

class MastermindZkApp extends SmartContract {
  @state(UInt8) maxAttempts = State<UInt8>();
  @state(UInt8) turnCount = State<UInt8>();
  @state(Bool) isSolved = State<Bool>();

  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();

  @state(Field) solutionHash = State<Field>();
  @state(Field) historyCommitment = State<Field>();
  @state(Field) lastGuess = State<Field>();

  @method async initGame(maxAttempts: UInt8) {
    const isInitialized = this.account.provedState.getAndRequireEquals();
    isInitialized.assertFalse('The game has already been initialized!');

    // Sets your entire state to 0.
    super.init();

    // Initialize root as the empty root of an indexed Merkle tree with height 4
    this.historyCommitment.set(EMPTY_INDEXED_TREE4_ROOT);

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
  //! The process involves retrieving the latest clue from the history tree, unpacking it, and using it to guide the next guess.
  @method async makeGuess(guess: Field, history: MerkleMap) {
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

    // Validate integrity of the history Merkle Map
    const currentRoot = this.historyCommitment.getAndRequireEquals();
    currentRoot.assertEquals(history.root);

    // Insert the new guess with an initial value of 0
    // This prevents the Code Breaker from repeating the same guess in future attempts
    history = history.clone();
    history.insert(guess, Field(0));

    // Update on-chain history root / commitment
    const historyCommitmentNew = history.root;
    this.historyCommitment.set(historyCommitmentNew);

    // Update last guess for the code master to fetch
    this.lastGuess.set(guess);

    // Increment turnCount and wait for the codemaster to give a clue
    this.turnCount.set(turnCount.add(1));
  }

  @method.returns(MerkleMap) async giveClue(
    unseparatedSecretCombination: Field,
    salt: Field,
    history: MerkleMap
  ) {
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

    // Validate integrity of the Merkle Map
    const currentRoot = this.historyCommitment.getAndRequireEquals();
    currentRoot.assertEquals(history.root);

    const lastGuess = this.lastGuess.getAndRequireEquals();

    //TODO test and add error message
    history = history.clone();

    // Assert that no clue was given yet!
    history.get(lastGuess).assertEquals(0);

    const guessDigits = separateCombinationDigits(lastGuess);

    // Determine clue (hit/blow) based on the guess and solution
    let clue = getClueFromGuess(guessDigits, solution);

    // Assign the packed clue to the last guess in the history Merkle Map
    const serializedClue = serializeClue(clue);
    history.update(lastGuess, serializedClue);

    // Update on-chain history root / commitment
    const historyCommitmentNew = history.root;
    this.historyCommitment.set(historyCommitmentNew);

    // Check if the guess is correct and update the solved status on-chain
    let isSolved = checkIfSolved(clue);
    this.isSolved.set(isSolved);

    // Increment the on-chain turnCount
    this.turnCount.set(turnCount.add(1));

    return history;
  }
}
