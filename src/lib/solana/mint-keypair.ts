import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

/** Server-side mint signing material. Address format and key ownership, never vanity text. */
export class SealedMintKeypair {
  readonly publicKey: string;
  #secret: Uint8Array;
  private constructor(publicKey: string, secret: Uint8Array) { this.publicKey = publicKey; this.#secret = secret; }
  static seal(publicKey: string, secret: Uint8Array) {
    let signer: Keypair | undefined;
    try {
      const address = new PublicKey(publicKey);
      if (secret.length !== 64) throw new Error("Invalid mint keypair");
      signer = Keypair.fromSecretKey(secret);
      if (!signer.publicKey.equals(address)) throw new Error("Mint signer does not match the public address");
      return new SealedMintKeypair(address.toBase58(), Uint8Array.from(secret));
    } finally { secret.fill(0); signer?.secretKey.fill(0); }
  }
  sign(message: Uint8Array) {
    if (this.#secret.length !== 64) throw new Error("Mint key is no longer available");
    return nacl.sign.detached(message, this.#secret);
  }
  ephemeralSigner() {
    if (this.#secret.length !== 64) throw new Error("Mint key is no longer available");
    const copy = Uint8Array.from(this.#secret);
    try { return Keypair.fromSecretKey(copy); } catch (error) { copy.fill(0); throw error; }
  }
  destroy() { this.#secret.fill(0); this.#secret = new Uint8Array(0); }
  toJSON() { return { publicKey: this.publicKey }; }
}
