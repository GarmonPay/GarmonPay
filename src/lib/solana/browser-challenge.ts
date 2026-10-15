import { SOLANA_AUTH_CHAIN_ID, authNetwork, type AuthNetwork } from "./auth-chain";

/** Browser review before message signing. No transaction signing or activation. */
export function reviewBrowserChallenge(data: unknown,wallet: string,origin: string,now: number, network: AuthNetwork = SOLANA_AUTH_CHAIN_ID) {
 if(!data || typeof data!=='object' || !Number.isSafeInteger(now)) throw new Error('Invalid sign-in challenge');
 const d=data as Record<string,unknown>,url=new URL(origin);
 if(typeof d.challengeId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.challengeId) || typeof d.message!=='string' || d.message.length>2000 || typeof d.expiresAt!=='string') throw new Error('Invalid sign-in challenge');
 const lines=d.message.split('\n');
 if(lines.length!==11 || lines[0]!=='GarmonPay.com wants you to prove you own this wallet:' || lines[1]!==wallet || lines[2]!=='' || lines[3]!==url.origin || lines[4]!=='' || !/^Nonce: [A-Za-z0-9]{8,64}$/.test(lines[5]) || lines[8]!==`Network: ${authNetwork(network)}` || lines[9]!=='' || lines[10]!=='This does not authorize a transaction or transfer.' || /wants you to sign in with your Solana account:/i.test(d.message)) throw new Error('Sign-in purpose or wallet mismatch');
 const issuedText=lines[6].replace(/^Issued At: /,''),expiresText=lines[7].replace(/^Expiration Time: /,'');
 const issued=Date.parse(issuedText),expires=Date.parse(expiresText);
 if(!lines[6].startsWith('Issued At: ') || !lines[7].startsWith('Expiration Time: ') || !Number.isFinite(issued) || !Number.isFinite(expires) || issued>now || expires<=now || expires-issued!==300000 || expiresText!==d.expiresAt || new Date(issued).toISOString()!==issuedText || new Date(expires).toISOString()!==expiresText) throw new Error('Fresh bounded challenge required');
 return {challengeId:d.challengeId,message:d.message,expiresAt:d.expiresAt};
}
