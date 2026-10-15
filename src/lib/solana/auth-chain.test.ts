import { describe, expect, it } from "vitest";
import { CLUSTER_GENESIS } from "./platform-setup";
import { PHANTOM_SIWS_CHAIN_IDS, SOLANA_AUTH_CHAIN_ID, AUTH_NETWORKS, authNetwork } from "./auth-chain";
import { challengeMessage } from "./auth-crypto";
import { reviewBrowserChallenge } from "./browser-challenge";

const wallet = "11111111111111111111111111111111";
const origin = "https://garmonpay.com";
const now = Date.parse("2026-10-13T21:00:00.000Z");

describe("mainnet sign-in chain", () => {
  it("uses the chain id from Phantom's own sign-in example", () => {
    expect(PHANTOM_SIWS_CHAIN_IDS).toContain(SOLANA_AUTH_CHAIN_ID);
    expect(SOLANA_AUTH_CHAIN_ID).toBe("mainnet");
    expect(SOLANA_AUTH_CHAIN_ID).not.toBe("devnet");
    expect(SOLANA_AUTH_CHAIN_ID).not.toBe("solana:devnet");
    expect(CLUSTER_GENESIS["mainnet-beta"]).not.toBe(CLUSTER_GENESIS.devnet);
  });

  it("binds the signed message to mainnet and rejects the other chain ids", () => {
    const message = challengeMessage(wallet, "abcdef1234567890", origin, new Date(now).toISOString(), new Date(now + 300000).toISOString());
    expect(message.split("\n")[8]).toBe("Network: mainnet");
    expect(message).not.toContain("wants you to sign in with your Solana account");
    expect(message).not.toContain("Chain ID:");
    expect(message).not.toContain("solana:mainnet");
    expect(message).not.toContain("solana:devnet");
    expect(message).not.toContain(CLUSTER_GENESIS.devnet);
    expect(message).not.toContain(CLUSTER_GENESIS["mainnet-beta"]);
    const data = { challengeId: "11111111-1111-4111-8111-111111111111", message, expiresAt: new Date(now + 300000).toISOString() };
    expect(reviewBrowserChallenge(data, wallet, origin, now).message).toBe(message);
    for (const chain of ["solana:mainnet", "devnet", "solana:devnet", `solana:${CLUSTER_GENESIS["mainnet-beta"].slice(0, 32)}`]) {
      expect(() => reviewBrowserChallenge({ ...data, message: message.replace("Network: mainnet", `Network: ${chain}`) }, wallet, origin, now)).toThrow();
    }
  });
});

describe('wallet network identifiers',()=>{it('uses distinct canonical identifiers for message, Wallet Standard and mobile cluster',()=>{
 for(const network of ['mainnet','devnet','testnet'] as const){const message=challengeMessage(wallet,'abcdef1234567890',origin,new Date(now).toISOString(),new Date(now+300000).toISOString(),network);const data={challengeId:'11111111-1111-4111-8111-111111111111',message,expiresAt:new Date(now+300000).toISOString()};expect(reviewBrowserChallenge(data,wallet,origin,now,network).message).toBe(message);expect(AUTH_NETWORKS[network].standard).toBe('solana:'+network);if(network!=='mainnet')expect(()=>reviewBrowserChallenge(data,wallet,origin,now,'mainnet')).toThrow();}
 expect(AUTH_NETWORKS.mainnet.cluster).toBe('mainnet-beta');expect(AUTH_NETWORKS.devnet.cluster).toBe('devnet');expect(()=>authNetwork('ethereum')).toThrow();
});});
