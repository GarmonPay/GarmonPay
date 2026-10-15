import { readFileSync } from "node:fs";
import { ComputeBudgetProgram, Keypair, PublicKey, Connection, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { describe, expect, it } from "vitest";
import { DEVNET_RPC, DEVNET_SOL_CONFIG } from "./launchlab-flow";
import { AUTHORIZED_PLATFORM_ADDRESSES } from "./platform-setup";
import { assertDevnetCluster, assertSignedDevnetLaunch, buildDevnetLaunchTransaction, devnetCoinStep, metadataUri, readDevnetLaunchContext } from "./devnet-coin";
import { GpaySearchError, findGpayMint, gpayTail } from "./gpay-browser";

const mint = new PublicKey("4rQuZkHs8nNxFNFuXBF92HLP1HJyDsz586bfC8b3gpay");

describe("Devnet coin creation", () => {
  it("keeps the launch on the Devnet program and requires a gpay mint", async () => {
    expect(gpayTail(mint.toBytes())).toBe("gpay");
    expect(() => assertDevnetCluster("mainnet-beta")).toThrow(/Devnet/);
    expect(devnetCoinStep(false, AUTHORIZED_PLATFORM_ADDRESSES.admin)).toBe("platform");
    expect(devnetCoinStep(true, Keypair.generate().publicKey.toBase58())).toBe("mint");
    expect(() => devnetCoinStep(false, Keypair.generate().publicKey.toBase58())).toThrow(/admin wallet/);
    const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const config = await connection.getAccountInfo(DEVNET_SOL_CONFIG, "confirmed");
    expect(config?.owner.toBase58()).toBe("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6");
    const payer = Keypair.generate().publicKey;
    const built = buildDevnetLaunchTransaction({
      payer: payer.toBase58(),
      mint: mint.toBase58(),
      blockhash: "11111111111111111111111111111111",
      name: "Garmon Check",
      symbol: "CHECK",
      uri: metadataUri("ab".repeat(16)),
      configData: new Uint8Array(config!.data),
    });
    expect(built.programId).toBe("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6");
    expect(built.transaction.instructions.some(instruction => instruction.programId.equals(LAUNCHPAD_PROGRAM))).toBe(false);
    const mintKey = built.transaction.instructions.flatMap(instruction => instruction.keys).find(key => key.pubkey.equals(mint));
    expect(mintKey?.isSigner).toBe(true);
    const message = built.transaction.compileMessage();
    const mintIndex = message.accountKeys.findIndex(key => key.equals(mint));
    expect(mintIndex).toBeGreaterThanOrEqual(0);
    expect(mintIndex).toBeLessThan(message.header.numRequiredSignatures);
    const raw = Buffer.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
    const round = Transaction.from(Buffer.from(raw, "base64"));
    expect(round.serializeMessage().equals(built.transaction.serializeMessage())).toBe(true);
    expect(() => assertSignedDevnetLaunch(raw, built.transaction, payer, mint)).toThrow(/The mint and wallet signatures are required/);
    const other = buildDevnetLaunchTransaction({
      payer: payer.toBase58(),
      mint: Keypair.generate().publicKey.toBase58(),
      blockhash: "11111111111111111111111111111111",
      name: "Garmon Check",
      symbol: "CHECK",
      uri: metadataUri("ab".repeat(16)),
      configData: new Uint8Array(config!.data),
    });
    const otherRaw = Buffer.from(other.transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
    expect(() => assertSignedDevnetLaunch(otherRaw, built.transaction, payer, mint)).toThrow(/do not match the Devnet token/);
    expect(() => buildDevnetLaunchTransaction({
      payer: payer.toBase58(), mint: "not-a-mint", blockhash: "11111111111111111111111111111111",
      name: "Garmon Check", symbol: "CHECK", uri: metadataUri("ab".repeat(16)), configData: new Uint8Array(config!.data),
    })).toThrow(/mint address/);
    const source = readFileSync(new URL("./devnet-coin.ts", import.meta.url), "utf8");
    expect(source).not.toContain("api.mainnet-beta.solana.com");
    expect(source).not.toContain(LAUNCHPAD_PROGRAM.toBase58());
  });

  it("accepts a signed transaction when the creator account is the payer", () => {
    const payer = Keypair.generate();
    const mintSigner = Keypair.generate();
    const blockhash = Keypair.generate().publicKey.toBase58();
    const transaction = () => new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
      new TransactionInstruction({
        programId: DEV_LAUNCHPAD_PROGRAM,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: false },
          { pubkey: mintSigner.publicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.from([7]),
      }),
    );
    const expected = transaction();
    const signed = transaction();
    signed.partialSign(mintSigner, payer);
    const raw = signed.serialize().toString("base64");
    expect(assertSignedDevnetLaunch(raw, expected, payer.publicKey, mintSigner.publicKey).verifySignatures()).toBe(true);
  });

  it("simulates a standard Devnet mint without sending it", async () => {
    const mint = Keypair.generate();
    try {
      const context = await readDevnetLaunchContext(AUTHORIZED_PLATFORM_ADDRESSES.admin);
      const built = buildDevnetLaunchTransaction({
        payer: AUTHORIZED_PLATFORM_ADDRESSES.admin,
        mint: mint.publicKey.toBase58(),
        blockhash: context.latest.blockhash,
        name: "Standard Mint",
        symbol: "STD",
        uri: metadataUri("cd".repeat(16)),
        configData: context.configData,
      });
      expect(built.programId).toBe("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6");
      built.transaction.partialSign(mint);
      const simulation = await context.connection.simulateTransaction(new VersionedTransaction(built.transaction.compileMessage()), {
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
      });
      expect(simulation.value.err).toBeNull();
      expect(simulation.value.logs?.some(line => line.includes("InitializeV2"))).toBe(true);
    } finally {
      mint.secretKey.fill(0);
    }
  });

  it("stops a tiny search without launching", async () => {
    try {
      const found = await findGpayMint({ maxAttempts: 2, batch: 2 });
      expect(found.publicKey.endsWith("gpay")).toBe(true);
      found.secret.fill(0);
    } catch (error) {
      expect(error).toBeInstanceOf(GpaySearchError);
    }
  });
});
