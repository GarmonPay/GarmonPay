import { Transaction, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { runHostedMint, mintSealKey } from "./hosted-mint";
import { AUTHORIZED_PLATFORM_ADDRESSES } from "./platform-setup";
import { metadataUri } from "./devnet-coin";
import { reviewWalletLaunch } from "./devnet-wallet-review";

describe.runIf(process.env.RUN_DEVNET_READ_TESTS === "1")("ordinary mint real Devnet preparation", () => {
 it("prepares, simulates and mint-signs an ordinary mint through the production handler used by Create Coin", async () => {
  const key=mintSealKey({SOLANA_AUTH_RATE_SECRET:'isolated-integration-test-secret-12345'} as NodeJS.ProcessEnv);
  const owner=AUTHORIZED_PLATFORM_ADDRESSES.admin;
  const draft={name:'Ordinary Mint Check',symbol:'ORDCHK',description:'Unsigned acceptance check. Devnet only.',website:'',social:''};
  const started=await runHostedMint({action:'start',owner,draft},key);
  const jobId=String(started.body.jobId), mint=String(started.body.mint);
  expect(mint.endsWith('gpay')).toBe(false);
  const prepared=await runHostedMint({action:'prepare',owner,draft,cookie:started.cookie,jobId,uri:metadataUri(jobId)},key);
  expect(prepared.status).toBe(200);
  const body=prepared.body as Record<string,any>;
  expect(body.simulationPassed).toBe(true);
  expect(body.cluster).toBe('devnet');
  const tx=Transaction.from(Buffer.from(body.unsignedTransaction,'base64'));
  expect(reviewWalletLaunch(tx,owner,mint)).toBeTruthy();
  const mintSig=tx.signatures.find(s=>s.publicKey.toBase58()===mint)?.signature;
  expect(mintSig).toBeTruthy();
  expect(nacl.sign.detached.verify(tx.serializeMessage(),mintSig!,new PublicKey(mint).toBytes())).toBe(true);
  expect(tx.signatures.find(s=>s.publicKey.toBase58()===owner)?.signature).toBeNull();
  console.info(JSON.stringify({mint,simulationPassed:true,mintSignatureVerified:true,memberSigned:false,submitted:false,estimatedTotalLamports:body.estimatedTotalLamports}));
 },60000);
});
