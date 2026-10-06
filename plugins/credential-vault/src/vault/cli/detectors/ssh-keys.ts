import { createHash } from "node:crypto";
import { SecretValue } from "../../secret.js";
import type { SecretMaterial } from "../../record.js";
import { joinSource } from "../credential-source.js";
import { fingerprintsOf } from "../material-from-input.js";
import { origin, slugify, type Detector, type Finding } from "../scan-finding.js";

/** A private-key PEM header, in any of the encodings `ssh-keygen` emits. */
const PRIVATE_KEY_HEADER = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;

/** Files in `~/.ssh` that are never a private key, so they are not opened as one. */
const SSH_NON_KEY =
  /(\.pub$|^config$|^known_hosts|^authorized_keys$|^environment$|\.DS_Store$|\.ps1$|^id_[a-z0-9]+\.pub$)/i;

/**
 * Whether an OpenSSH-format private key is passphrase-protected, read from the
 * `ciphername` field rather than by trying to decrypt it — the point of a scan is
 * to never need the passphrase. `none` means unencrypted; anything else is a
 * cipher the private half is sealed with. Classic PEM keys announce it in the
 * clear with `Proc-Type`/`DEK-Info` or an `ENCRYPTED` header. `null` means the
 * format was not recognised and the honest answer is "unknown".
 */
export function sshKeyPassphraseState(pem: string): "none" | "encrypted" | "unknown" {
  if (/-----BEGIN OPENSSH PRIVATE KEY-----/.test(pem)) {
    const body = pem
      .split(/\r?\n/)
      .filter((line) => line && !line.includes("-----"))
      .join("");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body, "base64");
    } catch {
      return "unknown";
    }
    const magic = "openssh-key-v1\0";
    if (
      bytes.length < magic.length + 4 ||
      bytes.subarray(0, magic.length).toString("latin1") !== magic
    )
      return "unknown";
    let offset = magic.length;
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    if (offset + length > bytes.length) return "unknown";
    return bytes.subarray(offset, offset + length).toString("latin1") === "none"
      ? "none"
      : "encrypted";
  }
  if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(pem)) return "encrypted";
  if (/Proc-Type:\s*4,ENCRYPTED/i.test(pem) || /DEK-Info:/i.test(pem)) return "encrypted";
  if (PRIVATE_KEY_HEADER.test(pem)) return "none";
  return "unknown";
}

/** The OpenSSH SHA256 fingerprint of a `type base64 comment` public-key line. */
export function sshPublicKeyFingerprint(publicKey: string): string | null {
  const blob = publicKey.trim().split(/\s+/)[1];
  if (!blob || !/^[A-Za-z0-9+/]+=*$/.test(blob)) return null;
  try {
    return `SHA256:${createHash("sha256").update(Buffer.from(blob, "base64")).digest("base64").replace(/=+$/, "")}`;
  } catch {
    return null;
  }
}

/** The comment (third field) of a public-key line, which is where the key names itself. */
function sshPublicKeyComment(publicKey: string): string | null {
  const parts = publicKey.trim().split(/\s+/);
  return parts.length >= 3 ? parts.slice(2).join(" ") : null;
}

/**
 * Private keys under `~/.ssh`. An SSH key is the one credential family that
 * cannot be re-minted from a login screen — if it is lost the owner re-enrols a
 * new public key everywhere it was trusted — so it is exactly what a vault meant
 * to prevent lock-out has to hold. Only keys whose public half is on disk are
 * imported: the record model stores the public key alongside the private one, and
 * a key with no `.pub` cannot round-trip, so it is reported for the owner to
 * complete rather than stored broken. The passphrase itself is never captured;
 * `passphrase` stays null and its presence is recorded so the supervisor knows
 * whether the key can be used unattended.
 */
export const sshKeys: Detector = {
  name: "ssh-keys",
  provider: "ssh",
  /**
   * Detects SSH keys in the .ssh directory of the source machine.
   *
   * Guarantees a list of findings for each private key found with a valid header.
   * If the public key half is missing, it includes a warning in the findings.
   *
   * @param source - The source of the files to check.
   * @param context - Additional context for the detection process.
   * @returns An array of findings, each describing an SSH key or a missing public key.
   */
  async detect(source, context) {
    const directory = joinSource(source.home, ".ssh");
    const names = await source.listDirectory(directory);
    const findings: Finding[] = [];
    for (const name of names.sort()) {
      if (SSH_NON_KEY.test(name)) continue;
      const file = joinSource(directory, name);
      const contents = await source.readFile(file);
      if (!contents || !PRIVATE_KEY_HEADER.test(contents)) continue;
      const passphrase = sshKeyPassphraseState(contents);
      const publicKeyLine = (await source.readFile(`${file}.pub`))?.trim() ?? null;
      const fingerprintValue = publicKeyLine ? sshPublicKeyFingerprint(publicKeyLine) : null;
      const comment = publicKeyLine ? sshPublicKeyComment(publicKeyLine) : null;
      const suggestedId = slugify("ssh", name, source.machine);
      const purpose = `ssh/${slugify(name)}`;
      if (!publicKeyLine) {
        findings.push({
          detector: this.name,
          provider: "ssh",
          type: "ssh_key",
          suggestedId,
          label: `SSH key ${name} on ${source.machine} (public half missing)`,
          purpose,
          account: comment,
          expiresAt: null,
          plan: "unknown",
          origin: origin(source, "file", file, context),
          fingerprints: [],
          notes: [
            `no ${name}.pub on disk: the record model needs the public half, so this key is reported rather than imported`,
          ],
          material: null,
        });
        continue;
      }
      const material: SecretMaterial = {
        type: "ssh_key",
        privateKey: new SecretValue(contents),
        publicKey: publicKeyLine,
        passphrase: null,
        fingerprint: fingerprintValue,
        comment,
      };
      findings.push({
        detector: this.name,
        provider: "ssh",
        type: "ssh_key",
        suggestedId,
        label: `SSH key ${name}${comment ? ` (${comment})` : ""} on ${source.machine}`,
        purpose,
        account: comment,
        expiresAt: null,
        plan: "unknown",
        origin: origin(source, "file", file, context),
        fingerprints: fingerprintsOf(material),
        notes: [
          passphrase === "encrypted"
            ? "passphrase-protected: the passphrase is not in the vault, so unattended use needs it added separately"
            : passphrase === "none"
              ? "no passphrase: usable unattended"
              : "passphrase state unrecognised",
          ...(fingerprintValue ? [`fingerprint ${fingerprintValue}`] : []),
        ],
        material,
      });
    }
    return findings;
  },
};
