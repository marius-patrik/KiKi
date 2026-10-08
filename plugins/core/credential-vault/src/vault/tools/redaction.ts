import type { SecretRecord } from "../record.js";

export const REDACTED = "[redacted]";

/**
 * Every form the material could plausibly take in something coming back: the
 * value itself, its percent-encoding, its base64, and the base64 of
 * `user:password` for basic auth. Short values are dropped — scrubbing a
 * three-character token out of a response would destroy the response and
 * disclose nothing.
 */
export function redactionTokens(record: SecretRecord): string[] {
  const plain: string[] = [];
  const material = record.material;
  switch (material.type) {
    case "api_key":
      plain.push(material.apiKey.reveal());
      break;
    case "oauth_token":
      plain.push(material.accessToken.reveal());
      if (material.refreshToken) plain.push(material.refreshToken.reveal());
      break;
    case "password":
      plain.push(material.password.reveal());
      plain.push(
        Buffer.from(`${material.username}:${material.password.reveal()}`, "utf8").toString(
          "base64",
        ),
      );
      break;
    case "cookie_jar":
      plain.push(material.jar.reveal());
      break;
    case "totp_seed":
      plain.push(material.parameters.secret.reveal());
      break;
    case "passkey":
      plain.push(material.privateKey.reveal());
      break;
    case "ssh_key":
      plain.push(material.privateKey.reveal());
      if (material.passphrase) plain.push(material.passphrase.reveal());
      break;
    case "recovery_codes":
      for (const code of material.codes) plain.push(code.reveal());
      break;
    case "generic_note":
      plain.push(material.note.reveal());
      break;
  }
  const tokens = new Set<string>();
  for (const value of plain) {
    if (value.length < 4) continue;
    tokens.add(value);
    tokens.add(encodeURIComponent(value));
    tokens.add(Buffer.from(value, "utf8").toString("base64"));
  }
  // Longest first, so a token that contains another is replaced whole.
  return [...tokens]
    .filter((token) => token.length >= 4)
    .sort((left, right) => right.length - left.length);
}

/** redact implementation. */
export function redact(value: string, tokens: readonly string[]): string {
  let out = value;
  for (const token of tokens) {
    if (out.includes(token)) out = out.split(token).join(REDACTED);
  }
  return out;
}
