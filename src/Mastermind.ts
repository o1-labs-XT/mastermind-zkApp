import { Field, SmartContract, state, State, method, UInt8, Bool } from 'o1js';
export class MastermindZkApp extends SmartContract {
  @state(Field) codemasterId = State<Field>();
  @state(Field) codebreakerId = State<Field>();
  @state(Field) solutionHash = State<Field>();
  @state(Field) serializedGuess = State<Field>();
  @state(Field) serializedClue = State<Field>();
  @state(UInt8) turnCount = State<UInt8>();

  @method initGame() {
    super.init();

    this.codemasterId.set(Field(0));
    this.codebreakerId.set(Field(0));
    this.turnCount.set(UInt8.from(0));
    this.solutionHash.set(Field(0));
    this.serializedGuess.set(Field(0));
    this.serializedClue.set(Field(0));
  }

  @method createGame(serializedSecretCombination: Field, salt: Field) {
    //! restrict this method to be only called once at the beginnig of a game
    // 1. generate codemaster id -> taking address & salt
    // 2. generate solution hash
    // 3. initiate game & update turnCount
  }

  @method makeGuess(serializedGuess: Field, salt: Field) {
    //TODO before calling this method the codebreaker should read the codemaster
    //TODO clue beforehand and make a guess
    // 1. generate codebreaker id --> taking address & salt
    //? if ==> first turn --> store the codebreaker id
    //! else ==> assert that the caller is the codebreaker
    //! 2. assert that the turnCount is odd for the codebreaker to call this method
    // 3. store serialized guess on-chain
    //? we need to store the record of guesses in a merkle tree or a serialized field
    // 4. update turnCount and wait for codemaster to give a clue
  }

  @method giveClue(serializedSecretCombination: Field, salt: Field) {
    //! 1. assert that the turnCount is pair for the codemaster to call this method
    // 2. generate codemaster id -> taking address & salt
    //! 3. assert that the caller is the codemaster
    //! 4. generate solution hash and assert to state on-chain
    // 5. fetch the on-chain guess
    // 6. deserialize secret combination
    // 7. scan the guess through the solution and return clue pegs(black or white)
    //? we need to store the record of clues in a merkle tree or a serialized field
    // 8. serialize & store clue on-chain
    // 9. if turnCount >= 12 --> then game is over
    // 10. update turnCount
    //? other checks to announce game points
  }
}
