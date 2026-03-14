/**
 * Disposable/temporary email domains to block at signup.
 * Extend this set as needed; consider loading from DB or config in production.
 */

export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "guerrillamail.com",
  "guerrillamail.org",
  "guerrillamail.net",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "throwaway.email",
  "fakeinbox.com",
  "trashmail.com",
  "yopmail.com",
  "getnada.com",
  "maildrop.cc",
  "sharklasers.com",
  "grr.la",
  "guerrillamailblock.com",
  "dispostable.com",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "33mail.com",
  "inboxkitten.com",
  "tmpeml.com",
  "tempail.com",
  "disposable.com",
  "minuteinbox.com",
  "mintemail.com",
  "mytemp.email",
  "tempinbox.com",
  "anonymbox.com",
  "dropmail.me",
  "getairmail.com",
  "spamgourmet.com",
  "mailsac.com",
  "mailinator2.com",
  "tempmailo.com",
  "yepmail.com",
  "jetable.org",
  "mail-temp.com",
  "temp-mail.io",
  "temp-mail.live",
  "tmailinator.com",
  "discard.email",
  "discardmail.com",
  "emailfake.com",
  "fakemailgenerator.com",
  "mailcatch.com",
  "nospamfor.us",
  "spam4.me",
  "spamfree24.org",
  "trashmail.ws",
  "wegwerfmail.de",
  "burnermail.io",
  "gettempmail.com",
  "inboxbear.com",
  "mailslite.com",
  "tempmail.plus",
  "temp-mail.org",
  "temp-mail.ru",
  "throwawaymail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
