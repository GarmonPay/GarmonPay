/**
 * Chain line in the sign-in message Phantom shows on iPhone.
 *
 * Phantom's Sign In With Solana specification allows only:
 * mainnet, testnet, devnet, localnet, solana:mainnet, solana:testnet, solana:devnet.
 * Phantom's own example signs with `mainnet`. The iPhone rejected `solana:mainnet`.
 * Phantom Connect's CAIP-2 id is a different product identifier and is not in
 * that sign-in allowlist.
 *
 * `mainnet` is Solana mainnet. The mobile connect link already asks Phantom
 * for cluster `mainnet-beta`, which is that same network. Sign-in does not
 * use Devnet and does not move SOL.
 */
export const PHANTOM_SIWS_CHAIN_IDS = ["mainnet", "testnet", "devnet", "localnet", "solana:mainnet", "solana:testnet", "solana:devnet"] as const;
export const SOLANA_AUTH_CHAIN_ID = "mainnet" as const;

export type AuthNetwork = 'mainnet' | 'devnet' | 'testnet';
export const AUTH_NETWORKS = {mainnet:{message:'mainnet',standard:'solana:mainnet',cluster:'mainnet-beta'},devnet:{message:'devnet',standard:'solana:devnet',cluster:'devnet'},testnet:{message:'testnet',standard:'solana:testnet',cluster:'testnet'}} as const;
export function authNetwork(value: unknown): AuthNetwork {
 if (value === undefined) return 'mainnet';
 if (value !== 'mainnet' && value !== 'devnet' && value !== 'testnet') throw new Error('Select a supported wallet network.');
 return value;
}
