export function CoinMark({ symbol, imageUrl, size = 72 }: { symbol: string; imageUrl?: string | null; size?: number }) {
  const safe = imageUrl?.startsWith("https://") ? imageUrl : "";
  if (safe) return <img className="gp-token-art" src={safe} alt="" width={size} height={size} />;
  const letters = (symbol || "GP").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "GP";
  return <span className="gp-token-mark" style={{ width: size, height: size }} aria-hidden="true">{letters}</span>;
}
