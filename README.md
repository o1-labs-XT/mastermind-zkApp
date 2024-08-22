# Mina zkApp: Mina Mastermind

![alt text](./mastermind-board.png)

# Table of Contents [TODO]

- General

- Game Specific

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

  - Code Master's secret combination: **1 2 3 4**
  - Code Breaker's guess: **1 7 8 2**
  - Clue: **2 0 0 1**
    - Result: `1` hit and `1` blow.
      - The hit is `1` in the first position.
      - The blow is `2` in the fourth position.

- The game continues with alternating guesses and clues until the Code Breaker achieves 4 hits and uncovers the secret combination or fails to do so within the **maximum allowed attempts**.

# Mina zkApp strucuture

## Introduction

- By the definition of a smart contract:

  > Smart contracts are digital contracts stored on a blockchain that are automatically executed when predetermined terms and conditions are met.

- zkApps are essentially smart contracts on the Mina blockchain that are executed when certain `preconditions` are met and can trigger updates to their on-chain state through zero-knowledge proofs.

- Specifically, a zkApp is an account on the Mina blockchain with a verification key and 8 storage states that can be updated following the successful verification of zero-knowledge proofs. These proofs dictate the logic for how these states are updated.

## zkApp components

As demonstrated in the [Mastermind zkApp](./src/Mastermind.ts), a zkApp primarily consists of a set of states (up to 8) and methods.

### States

- These are the 8 states associated with the zkApp account, stored on-chain.

- All zkApp states are **public**.

- A state creates a precondition that is checked when the proof is sent in a transaction to the blockchain to be verified.

- Each state occupies approxiamtely 256 bits in size.

- You can use other provable types like `Bool`, `UInt8`, etc., but even if they appear smaller in size, they still occupy a full 256-bit field element.

- Keep in mind that some structs take up more than one Field.

  - For example, a `PublicKey` occupies two of the eight fields.

- A state is defined as follows:
  ```ts
  @state(Field) myState = State<Field>();
  ```

---

- **Note**: While the 8 on-chain states may be insufficient for some applications, there are workarounds using various techniques and APIs, which will be demonstrated in the upcoming advanced Mastermind Levels.

### Methods

- Interaction with a zkApp occurs through calling one or more of its methods.

- A method call **always** generates a proof that must be verified on-chain.

- A method can read on-chain data before generating a proof but can only trigger updates (write) after the transaction proof is successfully verified.

- All method parameters are **private**, and you can include any number of parameters you need.

- If we think of a method as a circuit:

  - The circuit's private inputs are the method parameters.
  - The circuit's public inputs are the on-chain states.
    - As in any ZK circuit, the private inputs commit to the public inputs.
    - The zkApp's on-chain state is fetched before the proof is generated.
    - The method call also sets preconditions on the on-chain state:
      - A precondition ensures that a specific condition (equality, greater than, less than, etc.) at the time the state was read for proof generation is still satisfied when the proof is verified on-chain.
      - This guarantees correct execution and prevents data races during state updates.

- Within a method, you can use o1js data types and primitives to define your custom logic.

  - For more details, refer to this guide on [methods](https://docs.minaprotocol.com/zkapps/writing-a-zkapp/introduction-to-zkapps/smart-contracts#methods).

- A method call does **not** just submit a proof for verification but can also read data from the blockchain and perform actions like updating on-chain states, emitting events, and dispatching actions.

- You can declare methods using the `@method` decorator as follows:
  ```ts
  @method async myMethod(secret: Field) {...}
  ```

# Mina zkApp strucuture

Following the game rules, the [MastermindZkApp](./src/Mastermind.ts) should be deployed:

- The zkApp is initialized by calling the `initGame` method, with `maxAttempts` as the method parameter to set an upper limit.

- After initialization, the Code Master calls the `createGame` method to start the game and set a secret combination for the Code Breaker to solve.

- The Code Breaker then makes a guess by calling the `makeGuess` method with a valid combination as a parameter.

- The Code Master submits the solution again to be checked against the previous guess and provides a clue.

- The Code Breaker should analyze the given clue and make another meaningful guess.

- The game continues by alternating between `makeGuess` and `giveClue` until the Code Breaker either uncovers the secret combination or fails by exceeding the allowed `maxAttempts`, concluding the game.

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

- We avoid storing the `PublicKey` directly because it occupies two fields. By hashing the `PublicKey`, we save two storage states, reducing the required states from four to two.

- Player identifiers are crucial for correctly associating each method call with the appropriate player, such as linking `makeGuess` to the Code Breaker and `giveClue` to the Code Master.

- Restricting access to methods ensures that only the intended players can interact with the zkApp, preventing intruders from disrupting the 1 vs 1 interactive game.

### solutionHash

- The solution must remain private; otherwise, the game loses its purpose. Therefore, whenever the Code Master provides a clue, they should enter the `secretCombination` as a method parameter.

- To maintain the integrity of the solution, the solution is hashed and stored on-chain when the game is first created.

- Each time the Code Master calls the `giveClue` method, the entered private secret combination is hashed and compared against the `solutionHash` stored on-chain to verify its integrity.

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

### initGame()

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

- Since the custom initialization method can be called by anyone at any time, refer to [Security Considerations] to ensure it is implemented securely.

### createGame()

- This method should be called **after** initializing the game and **only once**.
- The method executes successfully when the following conditions are met:
  - The code master provides two arguments: `unseparatedSecretCombination` and a `salt`.
  - The `unseparatedSecretCombination` is split into an array of fields representing the four digits. An error is thrown if the number is not in the range of `1000` to `9000`.
  - The separated digits are validated to ensure they are unique and non-zero, with errors thrown if they do not meet these criteria.
  - The secret combination is then hashed with the salt and stored on-chain as `solutionHash`.
  - The caller's `PublicKey` is hashed and stored on-chain as `codemasterId` once the combination is validated.
  - Finally, the `turnCount` is incremented, signaling that the game is ready for the code breaker to `makeGuess`.
  - The first user to call this method with valid inputs will be designated as the code master.

**Note:** Security checks in this method are abstracted for simplicity. Please refer to [Security Considerations] for more details.

---

### makeGuess() [TODO]

- placeholder

### giveClue() [TODO]

- placeholder

## Security Consdierations [TORefine]

To ensure that a zkApp operates securely and prevents unintended behavior, it is essential to implement robust security measures that enforce trustless and consistent operation. Key security considerations include:

- **Method Call Frequency and Sequence Enforcement**

- **Method Call Authorization**

- **Input and On-Chain State Validation**

- **Security of Private Input**

- **Avoidance of Underconstrained Proofs**

### Method Call Frequency & Sequence Enforcement

- It's crucial to limit the frequency of method calls based on specific conditions, such as ensuring certain methods can only be executed once or under specific circumstances.

- Additionally, ensure that methods are called in the correct order to prevent the app from entering an invalid or unintended state.

#### Initialize: Must Be Called First and Only Once

- For the `initGame` method, it's essential to ensure that this method is called immediately after deployment, with no other methods executed beforehand.

- Additionally, we must enforce that this method is called **only once**. If the game is in progress and someone calls the method to reset the game, it could be catastrophic.

- To restrict the sequence and frequency of calling this method, we use the following API:

  ```ts
  const isInitialized = this.account.provedState.getAndRequireEquals();
  isInitialized.assertFalse('The game has already been initialized!');
  ```

  - By asserting that `provedState` is `false`, you ensure that `initGame` cannot be called again after the zkApp is initially set up. Without this assertion, your zkApp could be reset by anyone calling the init method.

  - It's also crucial that **all** other methods assert that `provedState` is `true` to ensure the zkApp has been properly initialized, as `provedState` becomes `true` after `initGame` is invoked.

#### Enforce Method Call Once in a Specific Sequence

For the `createGame` method, we need to ensure that a player can call this method **only once after the game is initialized** and before any other methods are executed.

- To enforce this restriction, we use an on-chain variable called `turnCount`.
  - `turnCount` is initialized to `0`, and in other methods, every player action increments this count.
  - Therefore, we assert that `turnCount` is zero to confirm that no other method was called before `createGame`.
  ```ts
  turnCount.assertEquals(0, 'A mastermind game is already created!');
  ```

### Method Call Authorization

- Restricting method calls to specific addresses is crucial to ensure that only authorized parties can execute sensitive operations.

In the case of our Mastermind zkApp, it's essential to limit method access to the code master and the code breaker. Otherwise, anyone could access the zkApp and disrupt the game flow.

Generally, as seen in the [codemasterId & codebreakerId states](###codemasterId-&-codebreakerId), the check involves storing the method caller ID, typically by hashing their `PublicKey`, and asserting that the caller is authorized to execute the method.

For example:

```ts
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
```

**Note:** This logic works well in the game since it doesn't require much state. However, if we need to authorize a large number of users, it could become problematic due to the limited 8 states of storage available.

To learn more about scaling data storage, including off-chain storage, actions/reducers, or other packing techniques, follow the next levels of this game and explore the relevant APIs in the o1js library.

### Input and On-Chain State Validation

- Validate inputs and on-chain state for correctness by checking value ranges, enforcing equality, and applying necessary conditions.

For example, in the case of the `maxAttempts` state, it’s useful to allow flexibility in setting the number of attempts. However, an unrestricted range could be manipulated—small values like `0` to `4` would favor the Code Master by giving fewer chances to the Code Breaker, while larger values would do the opposite. Therefore, it’s important to assert that the `maxAttempts` state falls within a reasonable range, such as `5` to `20`, to ensure a balanced game.

For example:

```ts
maxAttempts.assertGreaterThanOrEqual(
  UInt8.from(5),
  'The minimum number of attempts allowed is 5!'
);

maxAttempts.assertLessThanOrEqual(
  UInt8.from(15),
  'The maximum number of attempts allowed is 15!'
);
```

### Security of Private Input

Protect the security of private inputs by securely committing them as state hashes, ensuring they cannot be manipulated or exposed.

Since the combination is a 4-digit number, it could inadvertently disclose information about the `solutionHash`, as state updates are publicly stored on the Mina blockchain and could be easily brute-forced.

To enhance security, a salt (random field) is introduced to the hash input: `hash(secret, salt)`. This adds approximately 256 bits of security, making it astronomically difficult to uncover the original input through brute force.

However, while the use of salt increases security, it also adds complexity in debugging, as it becomes more difficult to trace errors related to the hash. The hash now varies with each change in the secret or the salt, making it harder to pinpoint the source of issues.

- [TODO] Add a screenshot

### Avoidance of Underconstrained Proofs

- Ensure that all provable code is fully constrained to prevent any underconstrained proofs, which could lead to vulnerabilities or unintended behavior.

It's crucial to properly constrain the provable code by using assertions.

- For example, the API `Field.equals(2)` is not the same as `Field.assertEquals(2)`. The former returns a `Bool`, while the latter adds a constraint on the equality and will cause proof generation and verification to fail if the equality check fails.
- The same applies to other comparisons and checks, such as `greaterThan`, `lessThan`, etc.

- Be cautious when using the `Provable.witness` API. Ensure that its output is consistently constrained, operating based on another field or variable.
  - Please refer to the API documentation [here](#) for more details.

---

For more details on security considerations, refer to this excellent guide on [Security and zkApps](https://docs.minaprotocol.com/zkapps/writing-a-zkapp/introduction-to-zkapps/secure-zkapps)

## Good practices [TODO]

### structure of the project

- separate provable code as circiut templates
- main zkApp readability
- conventions and notations

### Unit and integration tests

- unit tests for internal circuit template behaviour
- integration tests for zkApp happy and unhappy behaviour

- start with localBlockchain and later to devnet & mainnet

### Provability

- In tests you can see some provable function like `combineDigits` be used as normal TS function with flexibility to convert to TS types like `bigint` etc.
- That said, provable code outside a provable enivornment(`zkApp` or `zkProgram`) is normal TS code
- This is valid for Provable to non-provable environment, in our case testing, but not the other way around
- It's only possible to migrate non-provable code to inside Provable environment(`zkApp` or `zkProgram`) by using the `Provable.witness()` API **and** constrainig the operation correcting as seen in [give link]()

### Digit checks [TORemove]

- Note that since the combination is asserted to be a four-digit number
  - there is no need to check that each digit is a single 0 to 9 digit as in other bit-serialization techniques eg. {@link serializeClue }
  - there is no need to check that the first digit is 0 as it render the combination to be a 3-digit field

### Advanced: Benchmarking circuits [TODO]

- zkApp `anazlyzeMethods`
- `Provable.constraintSystem`

## API explanation [TODO]

### Provable.witness

- how it works
- when it should be used
- security and constraint

### Provable.Array

- what does it serve;
- When it's used

### Provable.if

- how does it work
- an alternative

### Field vs {UInt8, UInt32, UInt64}

- The `UInt8` provable type is used for this state, which optimizes the storage size and allows a value range from `0` to `255`.

- There are certain methods specific to the provable `UInt` types that calls the need to use these types but if they are only used to inherit for Field, then just use Field

- `UInt` provable type use custom gates underhood that are more efficient when it comes to range checks

## Notes [TODO]

- Mention why this game is not operational

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
