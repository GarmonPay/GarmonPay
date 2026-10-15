function plain(value: string, max: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A prompt the member pastes into their own ChatGPT. GarmonPay does not send it to an image API. */
export function artworkPrompt(input: { name?: string; symbol?: string; description?: string; concept?: string }) {
  const name = plain(input.name ?? "", 32) || "this token";
  const symbol = plain(input.symbol ?? "", 10);
  const sentence = (value: string) => plain(value, 280).replace(/[. ]+$/g, "");
  const concept = sentence(input.concept ?? "");
  const description = sentence(input.description ?? "");
  const detail = [concept, description && description.toLowerCase() !== concept.toLowerCase() ? description : ""].filter(Boolean).join(". ");
  const ticker = symbol ? `, ticker ${symbol}` : "";
  const scene = detail ? `${detail}. ` : "";
  return `Create a premium square cryptocurrency token mascot image for a coin named ${name}${ticker}. ${scene}Use cinematic lighting, polished 3D detail, strong visual contrast, and professional cryptocurrency branding. Center the subject, use a clean composition, and make the artwork suitable for a token listing. Do not include watermarks or unnecessary text.`.replace(/\s+/g, " ").trim();
}
