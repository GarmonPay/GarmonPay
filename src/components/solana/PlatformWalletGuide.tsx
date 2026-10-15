"use client";
import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";

type Role = "admin" | "fee" | "nft" | "vesting";
type Prepared = {
  submitted: false;
  platformExists: false;
  platformId: string;
  programId: string;
  requiredSigner: string;
  feeWallet: string;
  nftWallet: string;
  vestingWallet: string;
  feeRate: string;
  creatorFeeRate: string;
  rentLamports: string;
  blockhash: string;
  lastValidBlockHeight: number;
  unsignedTransaction: string;
  adminOwnership: "unproven";
  destinationOwnership: "unproven";
  accounts: { address: string; signer: boolean; writable: boolean }[];
};
type ServerSetup = {
  configured?: boolean;
  admin?: string;
  fee?: string;
  nft?: string;
  vesting?: string;
  adminLamports?: number;
  estimatedCostLamports?: number;
  platformExists?: boolean;
  programId?: string;
  platformId?: string;
};
const roles: { key: Role; label: string; detail: string }[] = [
  { key: "admin", label: "Admin", detail: "Signs the platform transaction and pays its rent." },
  { key: "fee", label: "Fee collection", detail: "Receives the platform trading fee. It does not sign creation." },
  { key: "nft", label: "NFT lock", detail: "Receives the locked LP after graduation. It does not sign creation." },
  { key: "vesting", label: "Vesting", detail: "Named on the platform account. It does not sign creation." },
];
const storageKey = "garmonpay-platform-public-wallets-v1";

function empty() { return { admin: "", fee: "", nft: "", vesting: "" }; }

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function solLabel(lamports: number) {
  return `${(lamports / 1_000_000_000).toFixed(9)} SOL`;
}
function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function PlatformWalletGuide() {
  const [wallets, setWallets] = useState(empty);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [locked, setLocked] = useState(false);
  const [adminLamports, setAdminLamports] = useState<number | null>(null);
  const [message, setMessage] = useState("No platform wallets are configured. Enter four public addresses you control. Do not enter a seed phrase or private key.");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/solana/launches/platform", { cache: "no-store", credentials: "include" });
        const payload = await response.json() as ServerSetup;
        if (cancelled) return;
        if (payload.configured && payload.admin && payload.fee && payload.nft && payload.vesting) {
          setWallets({ admin: payload.admin, fee: payload.fee, nft: payload.nft, vesting: payload.vesting });
          setLocked(true);
          setAdminLamports(payload.adminLamports ?? null);
          const balance = typeof payload.adminLamports === "number" ? ` Admin devnet balance: ${solLabel(payload.adminLamports)}.` : "";
          setMessage(payload.platformExists
            ? `The configured devnet platform account is already present.${balance}`
            : `The four platform addresses are configured.${balance} The platform account has not been created.`);
          return;
        }
      } catch { /* Fall through to a local public-address draft. */ }
      try {
        const saved = localStorage.getItem(storageKey);
        if (!saved || saved.length > 400 || cancelled) return;
        const parsed = JSON.parse(saved) as Partial<Record<Role, string>>;
        const next = empty();
        for (const role of roles) {
          const value = parsed[role.key]?.trim() ?? "";
          if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) next[role.key] = value;
        }
        setWallets(next);
      } catch { /* Ignore an unreadable local draft. */ }
    })();
    return () => { cancelled = true; };
  }, []);
  function edit(role: Role, value: string) {
    setPrepared(null);
    setWallets(current => ({ ...current, [role]: value.trim() }));
  }
  async function prepare() {
    setBusy(true);
    setPrepared(null);
    try {
      if (!locked) localStorage.setItem(storageKey, JSON.stringify(wallets));
      const response = await fetch("/api/solana/launches/platform", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wallets) });
      const payload = await response.json();
      if (!response.ok || payload.submitted !== false || payload.platformExists !== false || !payload.unsignedTransaction) {
        setMessage(payload.error || "The platform transaction could not be prepared. Nothing was submitted.");
        return;
      }
      setPrepared(payload);
      setMessage(adminLamports === 0
        ? "Unsigned devnet transaction prepared. The admin balance is 0 lamports, so it cannot be submitted yet."
        : "This is an unsigned devnet transaction. It has not been submitted, and the platform account does not exist yet.");
    } catch {
      setMessage("The platform transaction could not be prepared. Nothing was submitted.");
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!prepared) return;
    const provider = (window as unknown as { solana?: { signTransaction?: (tx: Transaction) => Promise<Transaction> } }).solana;
    if (!provider?.signTransaction) {
      setMessage("A compatible wallet is required to sign. Nothing was submitted.");
      return;
    }
    setBusy(true);
    try {
      const refreshed = await fetch("/api/solana/launches/platform", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wallets) });
      const fresh = await refreshed.json() as Prepared & { error?: string };
      if (!refreshed.ok || fresh.submitted !== false || !fresh.unsignedTransaction || !Number.isSafeInteger(fresh.lastValidBlockHeight)) {
        setMessage(fresh.error || "The platform transaction could not be refreshed. Nothing was submitted.");
        return;
      }
      const transaction = Transaction.from(decodeBase64(fresh.unsignedTransaction));
      const signed = await provider.signTransaction(transaction);
      const adminSigned = signed.signatures.some(entry => entry.publicKey.equals(new PublicKey(fresh.requiredSigner)) && entry.signature != null);
      const reviewed = transaction.serializeMessage();
      const signedMessage = signed.serializeMessage();
      const unchanged = reviewed.length === signedMessage.length && reviewed.every((byte, index) => byte === signedMessage[index]);
      if (!adminSigned || !unchanged || !signed.verifySignatures()) {
        setMessage("The admin signature could not be verified. Nothing was submitted.");
        return;
      }
      const signedBytes = signed.serialize();
      const response = await fetch("/api/solana/launches/platform/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: encodeBase64(signedBytes), lastValidBlockHeight: fresh.lastValidBlockHeight }),
      });
      const payload = await response.json();
      if (!response.ok || payload.confirmed !== true || payload.platformExists !== true || typeof payload.signature !== "string") {
        setMessage(payload.error || "The admin signature stayed in this browser. Devnet did not confirm a platform account.");
        return;
      }
      setPrepared(null);
      setMessage(`Devnet confirmed platform ${payload.platformId}. Signature ${payload.signature}.`);
    } catch {
      setMessage("Wallet signing was cancelled or failed. Nothing was submitted.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="gp-sol-readiness" aria-labelledby="platform-wallet-setup">
    <h3 id="platform-wallet-setup">Devnet admin activation</h3>
    <p className="gp-sol-muted" role="status">{message}</p>
    {adminLamports !== null ? <p className="gp-sol-muted">Confirmed admin devnet balance: {solLabel(adminLamports)} ({adminLamports} lamports).</p> : null}
    {roles.map(role => <label key={role.key}>{role.label}
      <input value={wallets[role.key]} maxLength={44} autoComplete="off" spellCheck={false} placeholder="Public address" readOnly={locked} onChange={event => edit(role.key, event.target.value)} />
      <span className="gp-sol-muted text-sm">{role.detail}</span>
    </label>)}
    <div className="gp-sol-inline-actions">
      <button type="button" className="gp-button" disabled={busy} onClick={() => void prepare()}>{busy ? "Checking…" : "Prepare devnet platform transaction"}</button>
      {prepared ? <button type="button" className="gp-button gp-button-gold" disabled={busy} onClick={() => void sign()}>Sign and submit on devnet</button> : null}
    </div>
    {prepared ? <dl>
      <div><dt>Program</dt><dd><code className="break-all text-xs">{prepared.programId}</code></dd></div>
      <div><dt>Derived platform id</dt><dd><code className="break-all text-xs">{prepared.platformId}</code></dd></div>
      <div><dt>On-chain account</dt><dd>Not created</dd></div>
      <div><dt>Approved fees</dt><dd>1.20% platform + 0.30% creator = 1.50%. Raydium adds a 0.25% protocol fee, so a buy or sell pays 1.75% on the curve.</dd></div>
      <div><dt>Fee wallet</dt><dd><code className="break-all text-xs">{prepared.feeWallet}</code></dd></div>
      <div><dt>NFT wallet</dt><dd><code className="break-all text-xs">{prepared.nftWallet}</code></dd></div>
      <div><dt>Vesting wallet</dt><dd><code className="break-all text-xs">{prepared.vestingWallet}</code></dd></div>
      <div><dt>Required signer</dt><dd><code className="break-all text-xs">{prepared.requiredSigner}</code></dd></div>
      <div><dt>Estimated cost</dt><dd>{prepared.rentLamports} lamports rent, plus the signature fee, paid by the admin{adminLamports === null ? "" : `. Admin balance: ${adminLamports} lamports`}</dd></div>
      <div><dt>Ownership</dt><dd>Unproven until the admin signs. Fee, NFT, and vesting addresses do not sign this transaction.</dd></div>
    </dl> : null}
  </section>;
}
