# Mina zkApp: Mina Mastermind

## Understanding The Game

The game has two players, a code master and code breaker. 

The code master generates 4 secret digits in a set sequence. Digits can be between 1-9 and the digits must all be different. 
Then, each turn, the code breaker tries to guess the code master's digits, who then gives the number of matches.  
If the matching digits are in their right positions, they are "hits", if they in different positions, they are "blows". 

Example:

Code master private solution: 4 2 7 1 <br />
Code breaker's public solution: 1 2 3 4 <br />
Answer: 1 hit and 2 blows. (The hit is "2" in the second position, the blows are "4" and "1".) <br />

The code breaker wins by guessing the secret sequence in a set number of attempts. In the example above, if the maximum number of attempts is not yet reached and in the next round the code breaker guessed the exact sequence "4 2 7 1" they will have 4 hits and win the game. 

## On Chain State Variables

### roundsLimit 

- Stores the max number of turns the codebreaker has to guess the solution(secret combination)
- This value is provided during game initialization

### turnCount

- Stores the amount of guesses the codebreaker has taken during a game.
- This is incremented each time the codebreaker calls `(makeGuess)`

### codemasterId & codebreakerId

- Stores unique identifiers for both players the codemaster and codebreaker.
- Each ID is a hashed address and salt.

### Solutions hash

- Stores the hashed secret combination set by the codemaster. 
- The secret combination along with a salt is passed when calling the `(createGame)` method.

### serializedGuess

- Stores array of guesses by the codebreaker in raw Field format.

### serializedClue

- Stores array of clues given by the codemaster in raw Field format.

### isSolved

- Stores boolean which represent the state if the game.

## initGame()
- Called by the deployer account to initialize the app/game.
- Takes 1 Uint argument to set the max amount of rounds. 

## createGame()
- Called by the codemaster/player.
- Takes 2 Field arguments, the codemaster's serialized secretCombination and a salt.

## makeGuess()
- Called by the codebreaker/player.
- Takes 2 Field arguments, the codebreaker's serialized guess and a salt.

## giveClue()
- Called by the codemaster/player.
- Takes 2 Field arguments, the codemaster's serialized secretCombination and a salt.
- Responsible for verifying the guess against the secret combination and updating the `isSolved` value on chain inorder to determine the outcome of the game.

---

## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
