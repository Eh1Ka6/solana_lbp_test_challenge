import * as anchor from '@project-serum/anchor';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair, sendAndConfirmTransaction,Transaction,ComputeBudgetProgram } from '@solana/web3.js';
import { Program  } from '@project-serum/anchor';
import { NeptuneLbp } from "../target/types/neptune_lbp";
import * as fs from 'fs';
import * as path from 'path';
import * as  solanaWeb3 from '@solana/web3.js' ;
import { TOKEN_PROGRAM_ID, createMint, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress,getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import TransactionFactory from '@project-serum/anchor/dist/cjs/program/namespace/transaction';
import chai from 'chai';
import chaiAsPromised from  'chai-as-promised'


chai.use(chaiAsPromised);
const expect = chai.expect;

// Function to load a keypair from a JSON file
function loadKeypairFromFile(filePath) {
  // Read the file content
  const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });

  // Parse the JSON content to an array
  const secretKey = JSON.parse(fileContent);

  // Create a keypair from the secret key
  const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
  return keypair;
}
async function createAtaForUser(mint, userKeypair, provider) {
  const res = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    provider.wallet.payer,// The payer of the transaction; also the owner of the ATA 
    mint, // The mint address of the token for which you're creating the ATA
    userKeypair.publicKey, // The owner of the newly created ATA
    // Pass additional options if necessary
  );

  return res
}
async function requestAirdrop(connection, publicKey, lamports) {
  const airdropSignature = await connection.requestAirdrop(
    publicKey,
    lamports,
  );

  await connection.confirmTransaction(airdropSignature);
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("neptune-lbp", () => {

  // Specify the path to the JSON file
  const keypairPath = path.join(__dirname, '../wallets/NeptkHfKK36uWkxTSGuta1gzwnPXjZSkmCsD7NW54ib.json');

  // Load the keypair
  const myKeypair = loadKeypairFromFile(keypairPath);
  // Configure the connection to the local Solana node
  const devnetConnection = new anchor.web3.Connection(
    // This URL assumes you're running a local Solana node on the default port
    "https://api.devnet.solana.com",
    "confirmed" // Use "confirmed" state for the commitment level
  );

  // creating copies to simplify further test creation
  // Pool Owner Sells InputToken ,  Buys OutputToken
  let _inputTokenMint
  let _outputTokenMint
  let _poolAccountPda
  let _ownerInputAta
  let _ownerOutputAta
  let _ownerBpAta
  let _aliceInputAta
  let _aliceOutputAta
  let _aliceBpAta
  let _bobInputAta
  let _bobOutputAta
  let _poolInputAta
  let _poolOutputAta
  let _poolBpAta
  let _bpTokenMint
  let _masterAccountPda
  let _masterInputAta
  let _masterOutputAta
  let _adminInputAta
  let _adminOutputAta

  const aliceKeyPath = path.join(__dirname, '../wallets/ACQXYUiRwziuoeXNeJyZ8bB2fdkmU7ftaiDLbmEqkSYW.json');
  const bobKeyPath = path.join(__dirname, '../wallets/B555Ds3zqJb3fSLDve4nz49NysP59QXFeXE9trVU1pUM.json');
  const aliceKeyPair = loadKeypairFromFile(aliceKeyPath)
  const bobKeyPair = loadKeypairFromFile(bobKeyPath)
  // creates first instruction
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    units: 1400000 
  });
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    microLamports: 1 
  });


  const wallet = new anchor.Wallet(myKeypair);

  // Configure the provider with the connection and wallet
  const provider = new anchor.AnchorProvider(devnetConnection, wallet, {
    skipPreflight: true,
  });

  // Set the provider for your Anchor program
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync('./target/idl/neptune_lbp.json', 'utf8'));
  const programId = new PublicKey("NepcLVBgrBqhggTDvG65e3S8f6GVCRVv5REZJBQN8x8");

  const program = new Program(idl, programId, provider);
  const [masterAccountPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from("master_account")],
    programId
  );
  it('Initializes the pool funds', async () => {
    // Use dynamically generated mint addresses for input and output tokens
    const inputTokenMint = await createMint(
      provider.connection,
      wallet.payer, // Payer of the transaction
      provider.wallet.publicKey, // Authority of the mint
      null, // Freeze authority (null if not used)
      9, // Decimals

    );
    _inputTokenMint = inputTokenMint
    // Create the output token mint
    const outputTokenMint = await createMint(
      provider.connection,
      wallet.payer, // Payer of the transaction
      provider.wallet.publicKey, // Authority of the mint
      null, // Freeze authority (null if not used)
      9, // Decimals

    );
    _outputTokenMint = outputTokenMint
    // Derive the address and bump seed for the Pool account PDA
    const [poolAccountPda, poolAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('pool_account'), provider.wallet.publicKey.toBuffer(), inputTokenMint.toBuffer()],
      program.programId
    );
    _poolAccountPda = poolAccountPda
    // Derive the address and bump seed for the Pool account PDA
    const [masterAccountPda, masterAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('master_account')],
      program.programId
    );
    _masterAccountPda = masterAccountPda;
    // Derive ATAs for input and output tokens for the pool account
    const inputTokenAta = await getAssociatedTokenAddress(
      inputTokenMint,
      poolAccountPda, // Imported from '@solana/spl-token'
      true,
      TOKEN_PROGRAM_ID, // Imported from '@solana/spl-token'
      ASSOCIATED_TOKEN_PROGRAM_ID,

    );
    _poolInputAta = inputTokenAta

    const outputTokenAta = await getAssociatedTokenAddressSync(
      outputTokenMint,
      poolAccountPda, // Imported from '@solana/spl-token'
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    _poolOutputAta = outputTokenAta
    // Derive the address and bump seed for the BP token mint PDA
    const [bpTokenMint, bpTokenMintBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('bp_token_mint'), poolAccountPda.toBuffer()],
      program.programId
    );
    _bpTokenMint = bpTokenMint

    // Parameters for initializing the pool
    const params = {
     
      startTimestamp: new anchor.BN(Date.now() / 1000+5), // Current timestamp
      endTimestamp: new anchor.BN(Date.now() / 1000 + 1000), // One hour later
      startWeights: [new anchor.BN(90), new anchor.BN(10)], // Example weights
      endWeights: [new anchor.BN(10), new anchor.BN(90)], // Example weights
      isSol: false
    };
    if (params.isSol) {

    // Convert SOL amount to lamports
    const amountLamports = solanaWeb3.LAMPORTS_PER_SOL * 1;

    // Create the transaction instruction for transferring SOL
    const transferInstruction = solanaWeb3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: poolAccountPda,
        lamports: amountLamports,
    });

    // Create a transaction object and add the transfer instruction
    const transaction = new solanaWeb3.Transaction().add(transferInstruction);

    // Send and confirm the transaction
    const signature = await solanaWeb3.sendAndConfirmTransaction(  provider.connection, transaction, [myKeypair]);
    console.log('Sol amount in pool initialised with signature:', signature);

    }


    const masterInputTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      myKeypair,
      inputTokenMint,
      masterAccountPda, // Imported from '@solana/spl-token'
      true, undefined, undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const masterOutputTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      myKeypair,
      outputTokenMint,
      masterAccountPda, // Imported from '@solana/spl-token'
      true, undefined, undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    _masterInputAta=masterInputTokenAta
    _masterOutputAta=masterOutputTokenAta
    // Transaction to initialize the pool
    let instructionTwo =  await program.methods.initializePool(params)
      .accounts({
        user: provider.wallet.publicKey,
        inputTokenMint: inputTokenMint,
        outputTokenMint: outputTokenMint,
        masterAccount: masterAccountPda,
        masterAccountInputFeeAta:masterInputTokenAta.address,
        masterAccountOutputFeeAta:masterOutputTokenAta.address,
        poolAccount: poolAccountPda, // Use the derived PDA
        bpTokenMint: bpTokenMint, // Assume this is correctly derived elsewhere
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).instruction()


    // add both instruction to one transaction
    let transaction = new Transaction().add(modifyComputeUnits)
    .add(addPriorityFee)
    .add(instructionTwo)

    // send transaction
    let tx = await sendAndConfirmTransaction(provider.connection,transaction,[wallet.payer],{
      skipPreflight: true,
    } )
   // const tx = await program.methods.calculateInvariantInstruction(normalizedWeights, balances)
     // .rpc();
    console.log("Transaction signature:", tx);
    console.log("Your transaction signature for initializing the pool", tx);

    // Create ATAs for user's input and output tokens
    const userInputTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      inputTokenMint,
      provider.wallet.publicKey,
    );
    _ownerInputAta = userInputTokenAta
    const userOutputTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      outputTokenMint,
      provider.wallet.publicKey,
    );
    _ownerOutputAta = userOutputTokenAta

    // Mint some tokens to user's ATAs to simulate having funds to initialize the pool
    await mintTo(
      provider.connection,
      wallet.payer, // payer
      inputTokenMint, // mint address
      userInputTokenAta.address, // destination
      provider.wallet.publicKey, // mint authority
      1000000000000, // amount: 10000 tokens considering 9 decimals
    );

    await mintTo(
      provider.connection,
      wallet.payer, // payer
      outputTokenMint, // mint address
      userOutputTokenAta.address, // destination
      provider.wallet.publicKey, // mint authority
      1000000000000, // amount: 1000 tokens considering 9 decimals
    );

    // Parameters for initializing the pool funds
    const initPoolFundsParams = {
      balances: [new anchor.BN(9), new anchor.BN(1)], // Example initial amounts for input and output tokens
      normalizedWeights: [new anchor.BN(90), new anchor.BN(10)], // Example normalized weights
    };

    const bpTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      myKeypair,
      bpTokenMint,
      poolAccountPda, // Imported from '@solana/spl-token'
      true, undefined, undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const ownerBpAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      myKeypair,
      bpTokenMint,
      myKeypair.publicKey, // Imported from '@solana/spl-token'
      false, undefined, undefined,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    _poolBpAta = bpTokenAta
    _ownerBpAta = ownerBpAta
    // Transaction to initialize the pool funds

 
    instructionTwo = await program.methods.initializePoolFunds(initPoolFundsParams)
      .accounts({
        user: provider.wallet.publicKey,
        inputTokenMint: inputTokenMint,
        outputTokenMint: outputTokenMint,
        bpTokenMint: bpTokenMint,
        poolAccount: poolAccountPda,
        userInputAta: userInputTokenAta.address,
        userOutputAta: userOutputTokenAta.address,
        userBpAta: ownerBpAta.address,
        poolInputAta: inputTokenAta, // Assuming these are already derived or created
        poolOutputAta: outputTokenAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).instruction()
       // add both instruction to one transaction
    transaction = new Transaction().add(modifyComputeUnits)
    .add(addPriorityFee)
    .add(instructionTwo)

    // send transaction
    const tx2 = await sendAndConfirmTransaction(provider.connection,transaction,[myKeypair],{
      skipPreflight: true,
    } )
    const poolInputTokenBalanceAfter = await provider.connection.getTokenAccountBalance(_poolInputAta);
    const poolOutputTokenBalanceAfter = await provider.connection.getTokenAccountBalance(_poolOutputAta);

    const ownerBpTokenBalanceAfter = await provider.connection.getTokenAccountBalance(ownerBpAta.address);

    
    console.log("Transaction signature for initializing the pool funds", tx);
    console.log(`Pool Balance after initialisation:`)
    console.log(`Input Token ${poolInputTokenBalanceAfter.value.amount}`);
    console.log(`Output Token ${poolOutputTokenBalanceAfter.value.amount}`);
    console.log(`User Bp Token ${ownerBpTokenBalanceAfter.value.amount}`);

  
  });
  // Allow a user to  swap a token
  it('Allows a user to Swap', async () => {
    await sleep(3000);
    const aliceOutputTokenAta = await createAtaForUser(_outputTokenMint, aliceKeyPair, provider);
    const aliceBpTokenAta = await createAtaForUser(_bpTokenMint, aliceKeyPair, provider);

    const bobOutputTokenAta = await createAtaForUser(_outputTokenMint, bobKeyPair, provider);
    const bobBpTokenAta = await createAtaForUser(_bpTokenMint, bobKeyPair, provider);
    _aliceOutputAta = aliceOutputTokenAta
    _aliceBpAta = aliceBpTokenAta
    _bobOutputAta = bobOutputTokenAta
    // Request an airdrop for Alice and Bob
   // Ensure the user has enough output tokens 
    // Mint some tokens to user's ATAs to simulate having funds to initialize the pool
    await mintTo(
      provider.connection,
      wallet.payer, // payer
      _outputTokenMint, // mint address
      aliceOutputTokenAta.address, // destination
      provider.wallet.publicKey, // mint authority
      1000000000000, // amount: 10000 tokens considering 9 decimals
    );

    await mintTo(
      provider.connection,
      wallet.payer, // payer
      _outputTokenMint, // mint address
      bobOutputTokenAta.address, // destination
      provider.wallet.publicKey, // mint authority
      1000000000000, // amount: 10000 tokens considering 9 decimals
    );
    const aliceInputTokenAta = await createAtaForUser(_inputTokenMint, aliceKeyPair, provider);
    _aliceInputAta=aliceInputTokenAta
    const userInputTokenBalanceBefore = await provider.connection.getTokenAccountBalance(_aliceInputAta.address);
    const userOutputTokenBalanceBefore = await provider.connection.getTokenAccountBalance(_aliceOutputAta.address);
  
    const amountOuputToken = new anchor.BN(1000000000); // 1 tokens, assuming 9 decimals
  
  
  const instruction = await program.methods.buySwap(amountOuputToken,true)
      .accounts({
        owner: provider.wallet.publicKey,
        outputTokenMint:_outputTokenMint,
        masterAccount: _masterAccountPda,
        user: aliceKeyPair.publicKey,
        userOutputAta: _aliceOutputAta.address, // The user's input token ATA
        userInputAta: aliceInputTokenAta.address, // The user's input token ATA
        userBpAta: _aliceBpAta.address, // The user's BP token ATA, needs to be created if it doesn't exist
        inputTokenMint: _inputTokenMint,
        poolAccount: _poolAccountPda, // The pool account PDA
        poolInputAta: _poolInputAta, // The pool's input token ATA
        poolOutputAta: _poolOutputAta, // The pool's input token ATA
        poolBpAta: _poolBpAta.address, // The pool's BP token ATA
        bpTokenMint: _bpTokenMint, // The BP token mint,
        feeCollectorInputAta: _masterInputAta.address, 
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
 
      })
      .signers([aliceKeyPair])
      .instruction();

    let transaction = new Transaction().add(modifyComputeUnits)
    .add(addPriorityFee)
    .add(instruction)

    // send transaction
    const txJoin = await sendAndConfirmTransaction(provider.connection,transaction,[aliceKeyPair],{
      skipPreflight: true,
    } )
    console.log("Transaction signature for  swapping into the pool", txJoin);

     const userInputTokenBalanceAfter = await provider.connection.getTokenAccountBalance(_aliceInputAta.address);
    const userOutputTokenBalanceAfter = await provider.connection.getTokenAccountBalance(_aliceOutputAta.address);
   
    console.log(`Swapper's input token balance before joining the pool: ${userInputTokenBalanceBefore.value.amount}`);
    console.log(`Swapper's input token balance after joining the pool: ${userInputTokenBalanceAfter.value.amount}`);
    console.log(`Swapper's ouput token balance before joining the pool: ${userOutputTokenBalanceBefore.value.amount}`);
    console.log(`Swapper's ouput token balance after joining the pool: ${userOutputTokenBalanceAfter.value.amount}`); 
    
  });

  


});
