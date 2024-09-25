# Mina zkApp: Mina Mastermind

![alt text](./mastermind-board.png)

# Table of Contents

- This README is divided into two main sections: **Mastermind Game Documentation** and **General zkApp Documentation**.

  - **The Mastermind Game Documentation** is focused on the specific implementation of the Mastermind game as a zkApp example. This section details the game rules, the structure of the zkApp tailored for Mastermind, and the methods specific to this game.

  - **The General zkApp Documentation** provides broader information about zkApps, including their structure, security considerations, best practices, and relevant APIs. This section is applicable to any zkApp you might develop, not just the Mastermind game.

## Mastermind Game Documentation

- [Understanding the Mastermind Game](#understanding-the-mastermind-game)

  - [Overview](#overview)
  - [Game Rules](#game-rules)

- [Mastermind zkApp Structure](#mastermind-zkapp-structure)

  - [Mastermind States](#mastermind-states)
    - [maxAttempts](#maxattempts)
    - [turnCount](#turncount)
    - [codemasterId & codebreakerId](#codemasterid--codebreakerid)
    - [solutionHash](#solutionhash)
    - [unseparatedGuess](#unseparatedguess)
    - [serializedClue](#serializedclue)
    - [isSolved](#issolved)
  - [Mastermind Methods](#mastermind-methods)
    - [initGame](#initgame)
    - [createGame](#creategame)
    - [makeGuess](#makeguess)
    - [giveClue](#giveclue)

- [How to Build & Test](#how-to-build--test)
  - [How to build](#how-to-build)
  - [How to run tests](#how-to-run-tests)
  - [How to run coverage](#how-to-run-coverage)
- [License](#license)

# Understanding the Mastermind Game

## Overview

- The game involves two players: a `Code Master` and a `Code Breaker`.
- Inspired by [mastermind-noir](https://github.com/vezenovm/mastermind-noir), this version replaces colored pegs with a combination of 4 unique, non-zero digits.

## Game Rules

- The Code Master hosts a game and sets a secret combination for the Code Breaker to guess.

- The Code Breaker makes a guess and waits for the Code Master to provide a clue.

- The clue indicates the following:

  - **Hits**: Digits that are correctly guessed and in the correct position.
  - **Blows**: Digits that are correct but in the wrong position.

  Example:

  |        | P1  | P2  | P3  | P4  |
  | ------ | --- | --- | --- | --- |
  | Secret | 5   | 9   | 3   | 4   |
  | Guess  | 5   | 7   | 8   | 9   |
  | Clue   | 2   | 0   | 0   | 1   |

  - Code Master's secret combination: **5 9 3 4**
  - Code Breaker's guess: **5 7 8 9**
  - Clue: **2 0 0 1**
    - Result: `1` hit and `1` blow.
      - The hit is `5` in the first position.
      - The blow is `9` in the fourth position.
      -

- The game continues with alternating guesses and clues until the Code Breaker achieves 4 hits and uncovers the secret combination or fails to do so within the **maximum allowed attempts**.

# Mastermind zkApp Structure

Following the game rules, the [MastermindZkApp](./src/Mastermind.ts) should be deployed:

- The zkApp is initialized by calling the `initGame` method, with `maxAttempts` as the method parameter to set an upper limit.

- After initialization, the Code Master calls the `createGame` method to start the game and set a secret combination for the Code Breaker to solve.

- The Code Breaker then makes a guess by calling the `makeGuess` method with a valid combination as an argument.

- The Code Master submits the solution again to be checked against the previous guess and provides a clue.

- The Code Breaker should analyze the given clue and make another meaningful guess.

- The game continues by alternating between `makeGuess` and `giveClue` methods until the Code Breaker either uncovers the secret combination or fails by exceeding the allowed `maxAttempts`, concluding the game.

Now, let's dive deeper into the states and methods of our Mastermind zkApp.

## Mastermind States

The Mastermind zkApp uses all 8 available states. Exceeding this limit would render the zkApp unusable, as it would surpass the maximum storage capacity.

Let's break down the purpose of each state and discuss the small workarounds used to minimize the number of states stored on-chain.

### maxAttempts

- This state is set during game initialization and is crucial for limiting the number of attempts in the game.

- Without this state, the game would be biased in favor of the Code Breaker, allowing the game to continue indefinitely until the secret combination is solved.

### turnCount

- This state is essential for tracking game progress. It helps determine when the maximum number of attempts (`maxAttempts`) has been reached and also identifies whose turn it is to make a move. If the `turnCount` is even, it's the Code Master's turn to give a clue; if it's odd, it's the Code Breaker's turn to make a guess.

### codemasterId & codebreakerId

- These states represent the unique identifiers of the players, which are stored as the **hash** of their `PublicKey`.

- We avoid storing the `PublicKey` directly because it occupies two fields. By hashing the `PublicKey`, we save two storage states, reducing the total required states from four to two.

- Player identifiers are crucial for correctly associating each method call with the appropriate player, such as linking `makeGuess` to the Code Breaker and `giveClue` to the Code Master.

- Restricting access to methods ensures that only the intended players can interact with the zkApp, preventing intruders from disrupting the 1 vs 1 interactive game.

### solutionHash

- The solution must remain private; otherwise, the game loses its purpose. Therefore, whenever the Code Master provides a clue, they should enter the `secretCombination` as a method parameter.

- To maintain the integrity of the solution, the solution is hashed and stored on-chain when the game is first created.

- Each time the Code Master calls the `giveClue` method, the entered private secret combination is salted, hashed, and compared against the `solutionHash` stored on-chain. This process ensures the integrity of the combination and helps prevent side-channel attacks.

- **Note:** Unlike player IDs, where hashing is used for data compression, here it is used to preserve the privacy of the on-chain state and to ensure the integrity of the values entered privately with each method call.

### unseparatedGuess

- This state represents the Code Breaker's guess as a single field encoded in decimal.
  - For example, if the guess is `4 5 2 3`, this state would be stored as a Field value of `4523`.
- The Code Master will later retrieve this value and separate it into the four individual digits to compare against the solution.

### serializedClue

- This state is a single field representing a clue, which is packed as a serialized value. A clue consists of four digits, each of which can be either `0`, `1`, or `2`, meaning the clue digits fall within the range of a 2-bit number. These digits are combined and stored on-chain as an 8-bit field in decimal.

- This state demonstrates a bit-serialization technique to compact multiple small field elements into one.

**Note:** To interpret the clue, the Code Breaker must deserialize and separate the clue digits to meaningfully understand the outcome of their previous guess.

### isSolved

This state is a `Bool` that indicates whether the Code Breaker has successfully uncovered the solution.

It is crucial for determining the end of the game, signaling completion once the Code Breaker achieves 4 hits within the allowed `maxAttempts`.

## Mastermind Methods

### initGame

**Note**: The `init()` method is predefined in the base `SmartContract` class, similar to a constructor.

- It is automatically called when you deploy your zkApp with the zkApp CLI for the first time.
- It is not called during contract upgrades or subsequent deployments.
- The base `init()` method initializes provable types like `Field`, `UInt8` to `0`, and the `Bool` type to `Bool(false)`, as it's a wrapper around a field with a value of `0`.
- Note that you cannot pass arguments to the `init` method of a `SmartContract`.

---

There are three variations for initializing a zkApp:

1. **All state initialized as `0` (no state with non-zero value):**

   - If you don't need to set any state to a non-zero value, there's no need to override `init()` or create a custom initialization method.
   - The base `init()` method will be automatically invoked when the zkApp is first deployed using the zkApp CLI.

2. **Initialize at least one state with a constant value:**

   - Override the `init()` method to initialize your on-chain state with constant values.
   - Include the base `init()` method's logic by calling `super.init()` to set all state variables to `0`.
   - Then, set the specific state variables to constant values, such as `Field(10)` or `Bool(true)`.
   - Example:

     ```ts
     class HelloWorld extends SmartContract {
       @state(Field) x = State<Field>();

       init() {
         super.init();
         this.x.set(Field(10)); // Set initial state to a constant value
       }
     }
     ```

3. **Initialize at least one state with a value dependent on an argument:**

   - Create a separate zkApp method with the adequate name
   - Within this method, call `super.init()` to initialize all state variables to `0`.
   - Use the method's parameters to set specific state variables based on the caller's input.
   - Example:

     ```ts
     class HelloWorld extends SmartContract {
       @state(Field) x = State<Field>();

       @method async initWorld(myValue: Field) {
         super.init();
         this.x.set(myValue); // Set initial state based on caller's input
       }
     }
     ```

**Notes:**

- In the Mastermind zkApp, we used the third variation to initialize the game, as it allows the caller to set the value of `maxAttempts`.

- In variations `1` and `2`, the `init()` method, whether default or overridden, is automatically executed when the zkApp is deployed. In contrast, the custom init method in the third variation must be called manually to initialize the states.

- Since the custom initialization method can be called by anyone at any time, refer to the [Security Considerations](#initialize-must-be-called-first-and-only-once) to ensure it is implemented securely.

---

### createGame

- This method should be called **after** initializing the game and **only once**.
- The method executes successfully when the following conditions are met:

  - The code master provides two arguments: `unseparatedSecretCombination` and a `salt`.

  - The `unseparatedSecretCombination` is split into an array of fields representing the four digits. An error is thrown if the number is not in the range of `1000` to `9999`.

  - The separated digits are validated to ensure they are unique and non-zero, with errors thrown if they do not meet these criteria.

  - The secret combination is then hashed with the salt and stored on-chain as `solutionHash`.

  - The caller's `PublicKey` is hashed and stored on-chain as `codemasterId` once the combination is validated.

  - Finally, the `turnCount` is incremented, signaling that the game is ready for the code breaker to `makeGuess`.
  - The first user to call this method with valid inputs will be designated as the code master.

**Note:** For simplicity, security checks in this method have been abstracted. For more details, please refer to the [Security Considerations](#safeguarding-private-inputs-in-zk-snark-circuits).

---

### makeGuess

- This method should be called directly after a game is created or when a clue is given for the previous guess.

- There are a few restrictions on calling this method to maintain a consistent progression of the game:

  - If the game `isSolved`, the method can be called, but it will throw an error.
  - If the code breaker exceeds the `maxAttempts`, the method can be called, but it will throw an error.
  - This method also enforces the correct sequence of player interactions by only allowing the code breaker to make a guess if the `turnCount` state is `odd`. If any of these conditions are not met, the method can be called, but it will throw an error.

- Special handling is required when the method is called for the first time:

  - The first player to call the method and make a guess will be registered as the code breaker for the remainder of the game.
  - The [Provable.if API](#provableif) is used to either set the current caller's `PublicKey` hash or fetch the registered code breaker ID.

- Once the `makeGuess` method is called successfully for the first time and a code breaker ID is registered, the method will restrict any caller except the registered one.

- After all the preceding checks pass, the code breaker's guess combination is validated, stored on-chain, and the `turnCount` is incremented. This then awaits the code master to read the guess and provide a clue.

---

### giveClue

- Similar to the `makeGuess` method, there are a few restrictions on calling this method to maintain a consistent progression of the game:

  - The caller is restricted to be only the registered code master ID.
  - The correct sequence is enforced by checking that `turnCount` is non-zero (to avoid colliding with the `createGame` method call) and even.
  - If the game `isSolved`, this method is blocked and cannot be executed.
  - If the code breaker exceeds the `maxAttempts`, this method is blocked and cannot be executed.

- After the preceding checks pass, the plain `unseparatedSecretCombination` input is separated into 4 digits, hashed along with the salt, and asserted against the `solutionHash` state to ensure the integrity of the secret.

- Next, the guess from the previous turn is fetched, separated, and compared against the secret combination digits to provide a clue:

  - If the clue results in 4 hits (e.g., `2 2 2 2`), the game is marked as solved, and the `isSolved` state is set to `Bool(true)`.
  - The clue is then serialized into `4` 2-bit Fields, packed as an 8-bit field in decimal, and stored on-chain.
  - Note that this technique requires the adversary to deserialize and correctly interpret the digits before making the next guess.

- Finally, the `turnCount` is incremented, making it odd and awaiting the code breaker to deserialize and read the clue before making a meaningful guess—assuming the game is not already solved or has not reached the maximum number of attempts.

---

# How to Build & Test

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

# License

[Apache-2.0](LICENSE)
