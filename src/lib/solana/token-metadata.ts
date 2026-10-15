export type TokenMetadata = { name: string; symbol: string; description: string; website: string; social: string };
function text(value: unknown, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) throw new Error("Invalid token metadata");
  return value.trim();
}
function link(value: unknown) {
  const input = text(value ?? "", 200); if (!input) return "";
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /(^|\.)(localhost|local|internal)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) throw new Error("Use a public HTTPS URL");
  return url.href;
}
/** URLs are stored only; the server never fetches arbitrary project links. */
export function validateTokenMetadata(body: Record<string, unknown>): TokenMetadata {
  const name = text(body.name, 32, true), symbol = text(body.symbol, 10, true);
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new Error("Ticker must be 1–10 uppercase letters or digits");
  return { name, symbol, description: text(body.description, 2000, true), website: link(body.website), social: link(body.social) };
}
