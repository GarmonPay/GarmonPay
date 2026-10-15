function plain(value: string, max: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function coinDraft(input: { name?: string; ticker?: string; description?: string; keywords?: string }) {
  const name = plain(input.name ?? "", 32);
  const ticker = plain(input.ticker ?? "", 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const description = plain(input.description ?? "", 280);
  const keywords = plain(input.keywords ?? "", 120);
  if (name.length < 2) throw new Error("Enter a coin name.");
  if (ticker.length < 2 || ticker.length > 10) throw new Error("Enter a ticker of 2–10 letters or numbers.");
  return { name, ticker, description, keywords };
}

/** A prompt the member pastes into their own ChatGPT. GarmonPay does not send it to an image API. */
export function artworkPrompt(input: { name?: string; ticker?: string; description?: string; keywords?: string }) {
  const draft = coinDraft(input);
  const detail = [draft.keywords, draft.description].filter(Boolean).join(". ");
  const scene = detail ? `${detail}. ` : "";
  return `Create a premium square cryptocurrency token mascot image for a coin named ${draft.name}, ticker ${draft.ticker}. ${scene}Use cinematic purple and gold lighting, polished 3D detail, strong visual contrast, and professional cryptocurrency branding. Center the subject, use a clean composition, and make the artwork suitable for a token listing. Do not include watermarks or unnecessary text.`.replace(/\s+/g, " ").trim();
}

export const COIN_CREATOR_NOTICE = "This prepares names and a copyable artwork prompt. It does not launch a coin, create an official $GPAY token, call an image API, or change LaunchLab fees (platform 1.20%, creator 0.30%, protocol 0.25%).";
