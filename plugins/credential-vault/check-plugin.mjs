// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding; internal near-duplicate CLI-scenario boilerplate
import * as plugin from "./lib/index.js";
import { loadOrCreateKey, Vault } from "./lib/vault.js";
import { Context } from "@deepseek-ai/cordis";
import { LocalCredentialProvider } from "@deepseek-ai/dsh-credentials-local";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { assertLoaderShape } from "../../scripts/plugin-check-kit.mjs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert";
import { SecretValue } from "./lib/vault/secret.js";
import {
  createSecretRecord,
  descriptorOf,
  rotateSecretRecord,
  SECRET_TYPES,
} from "./lib/vault/record.js";
import { EncryptedFileVault, MemoryVault, VaultCredentialStore } from "./lib/vault/store.js";
import {
  KeyFileMasterKey,
  PassphraseMasterKey,
  StaticMasterKey,
  deriveScryptKey,
  sameKey,
} from "./lib/vault/masterkey.js";
import {
  createTotpParameters,
  decodeBase32,
  encodeBase32,
  formatOtpauthUri,
  generateTotp,
  hotpCode,
  parseOtpauthUri,
  verifyTotp,
} from "./lib/vault/totp.js";
import {
  MemoryAuditLog,
  PrivilegedVaultCustodian,
  VaultAccessError,
  VaultMaterialSealedError,
} from "./lib/vault/agent.js";
import { classifyAuthFailure, planReauth, ReauthSupervisor } from "./lib/vault/supervisor.js";
import {
  findProviderDescriptor,
  registerOAuthSupplement,
  registerProviderRoutes,
} from "./lib/vault/provider-descriptor.js";
import { fingerprint, formatFingerprint, vaultCommand } from "./lib/vault/cli.js";
import { slugRecordId } from "./lib/refs.js";

assertLoaderShape(plugin, "credentials");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

const home = mkdtempSync(join(tmpdir(), "dsh-accounts-"));
const credentialFile = join(home, "credentials.yaml");

const ctx = new Context();
plugin.apply(ctx, { home });
if (!ctx.accounts) throw new Error("ctx.accounts not provided");
console.log("vault path:", ctx.accounts.vaultPath());

// Vault round-trip through the service.
await ctx.accounts.set("TEST_REF", "secret-value");
let hit = await ctx.accounts.resolve("TEST_REF");
assert.deepEqual(hit, { value: "secret-value", origin: "vault" });

// The vault records must not hold plaintext.
const vaultRecords = readdirSync(join(home, "vault")).filter((file) => file.endsWith(".vault"));
assert.ok(vaultRecords.length > 0, "no vault records written");
const document = readFileSync(join(home, "vault", vaultRecords[0]), "utf8");
assert.ok(!document.includes("secret-value"), "vault holds plaintext");
const key = await loadOrCreateKey(join(home, "accounts.key"));
assert.equal(key.byteLength, 32, "vault key is not 32 bytes");
console.log("vault record encrypted at rest ok");

await ctx.accounts.unset("TEST_REF");
hit = await ctx.accounts.resolve("TEST_REF");
assert.equal(hit, undefined);
console.log("vault set/get/unset ok");

// Fallback to the harness credential seam, vault shadowing it.
const credentialsFiber = await ctx.plugin(LocalCredentialProvider, {
  path: credentialFile,
  watch: false,
});
assert.ok(ctx.credentials, "ctx.credentials not provided");
await ctx.credentials.set("AMBIENT_REF", "from-harness");
let ambient = await ctx.accounts.resolve("AMBIENT_REF");
assert.deepEqual(ambient, { value: "from-harness", origin: "credentials" });
await ctx.accounts.set("AMBIENT_REF", "from-vault");
ambient = await ctx.accounts.resolve("AMBIENT_REF");
assert.deepEqual(ambient, { value: "from-vault", origin: "vault" });
assert.equal(await ctx.credentials.resolve("AMBIENT_REF").then((r) => r.value), "from-harness");
credentialsFiber.dispose();
console.log("fallback + shadowing ok");

// Claude Code importer.
const claudeDir = join(home, "claude");
mkdirSync(claudeDir, { recursive: true });
const claudeJson = join(claudeDir, ".credentials.json");
writeFileSync(
  claudeJson,
  JSON.stringify({
    hasCompletedOnboarding: true,
    oauthAccessToken: "claude-oauth-token",
    primaryApiKey: "claude-api-key",
    customApiKeyResponses: {},
  }),
);
const claudeImports = await ctx.accounts.importFile(claudeJson);
assert.deepEqual(claudeImports.map((r) => r.ref).sort(), [
  "CLAUDE_API_KEY",
  "CLAUDE_SUB_OAUTH_TOKEN",
]);
assert.equal((await ctx.accounts.resolve("CLAUDE_SUB_OAUTH_TOKEN")).value, "claude-oauth-token");
assert.equal((await ctx.accounts.resolve("CLAUDE_API_KEY")).value, "claude-api-key");
console.log(
  "claude importer ok:",
  claudeImports.map((r) => r.ref),
);

// Cursor importer against a synthetic vscdb.
const cursorDir = join(home, "cursor", "User", "globalStorage");
mkdirSync(cursorDir, { recursive: true });
const vscdb = join(cursorDir, "state.vscdb");
{
  const db = new DatabaseSync(vscdb);
  db.exec("CREATE TABLE ItemTable (key TEXT, value TEXT)");
  const insert = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
  insert.run("cursorAuth/accessToken", "cursor-jwt-token");
  insert.run("cursorAuth/cachedEmail", "user@example.com");
  db.close();
}
const cursorImports = await ctx.accounts.importFile(vscdb);
assert.ok(
  cursorImports.some((r) => r.ref === "CURSOR_SUB_TOKEN"),
  "cursor token not imported",
);
assert.equal((await ctx.accounts.resolve("CURSOR_SUB_TOKEN")).value, "cursor-jwt-token");
console.log(
  "cursor importer ok:",
  cursorImports.map((r) => r.ref),
);

// Unknown files are rejected.
await assert.rejects(ctx.accounts.importFile(join(home, "nope.txt")));
console.log("unknown file rejected ok");

// GitHub CLI importer + canonical ref mapping.
const ghDir = join(home, ".config", "gh");
mkdirSync(ghDir, { recursive: true });
const ghHosts = join(ghDir, "hosts.yml");
writeFileSync(
  ghHosts,
  [
    "github.com:",
    "    user: octocat",
    "    oauth_token: gho_example-oauth-token",
    "    git_protocol: https",
    "    users:",
    "        octocat:",
    "            oauth_token: gho_example-oauth-token",
    "ghe.example.com:",
    "    user: acme-corp",
    "    oauth_token: ghs_enterprise-token",
  ].join("\n"),
);
const ghImports = await ctx.accounts.importFile(ghHosts);
assert.deepEqual(ghImports.map((r) => r.ref).sort(), [
  "GITHUB_ENTERPRISE_HOST",
  "GITHUB_ENTERPRISE_TOKEN",
  "GITHUB_OAUTH_TOKEN",
  "GITHUB_USER",
]);
assert.equal((await ctx.accounts.resolve("GITHUB_OAUTH_TOKEN")).value, "gho_example-oauth-token");
assert.equal((await ctx.accounts.resolve("GITHUB_ENTERPRISE_TOKEN")).value, "ghs_enterprise-token");
assert.equal((await ctx.accounts.resolve("GITHUB_USER")).value, "octocat");
assert.equal((await ctx.accounts.resolve("GITHUB_ENTERPRISE_HOST")).value, "ghe.example.com");
console.log("github importer ok:", ghImports.map((r) => r.ref).sort());

// Canonical ref for the github purpose resolves to the token ref.
const { refTag, canonicalRefsForPurpose } = plugin;
assert.equal(refTag("GITHUB_OAUTH_TOKEN"), "ref:GITHUB_OAUTH_TOKEN");
assert.deepEqual(canonicalRefsForPurpose("github", "oauth_token"), ["GITHUB_OAUTH_TOKEN"]);
console.log("github ref mapping ok");

// The github provider route + OAuth supplement registered by apply().
const githubDescriptor = findProviderDescriptor("github");
assert.ok(githubDescriptor, "github provider route not registered");
assert.equal(githubDescriptor.id, "github");
assert.equal(githubDescriptor.baseUrl, "https://api.github.com");
console.log("github provider route ok:", githubDescriptor.baseUrl);

// The OAuth supplement is only registered when a client id is configured.
assert.equal(findProviderDescriptor("github").auth, null, "no client id -> no refresh protocol");
const withOauth = new Context();
plugin.apply(withOauth, { home, githubClientId: "Iv1.example" });
const oauthAuth = findProviderDescriptor("github").auth;
assert.ok(oauthAuth, "github OAuth supplement not registered with a client id");
assert.equal(oauthAuth.method, "oauth_pkce");
assert.equal(oauthAuth.authorizeUrl, "https://github.com/login/oauth/authorize");
assert.equal(oauthAuth.tokenUrl, "https://github.com/login/oauth/access_token");
assert.equal(oauthAuth.clientId, "Iv1.example");
assert.deepEqual(oauthAuth.scopes, ["repo", "workflow"]);
console.log("github oauth supplement ok:", oauthAuth.method);

// v1 -> v2 migration: a legacy accounts.vault document is migrated into tagged
// records and retired, and resolve() keeps finding the same values.
const legacyHome = mkdtempSync(join(tmpdir(), "dsh-legacy-"));
const legacy = new Vault(join(legacyHome, "accounts.vault"), join(legacyHome, "accounts.key"));
await legacy.set("CLAUDE_SUB_OAUTH_TOKEN", "migrated-token");
await legacy.set("KIMI_API_KEY", "migrated-key");
const migratedCtx = new Context();
plugin.apply(migratedCtx, { home: legacyHome });
assert.deepEqual(await migratedCtx.accounts.resolve("CLAUDE_SUB_OAUTH_TOKEN"), {
  value: "migrated-token",
  origin: "vault",
});
assert.deepEqual(await migratedCtx.accounts.resolve("KIMI_API_KEY"), {
  value: "migrated-key",
  origin: "vault",
});
assert.ok(!existsSync(join(legacyHome, "accounts.vault")), "legacy document not retired");
assert.ok(
  existsSync(join(legacyHome, "accounts.vault.v1-migrated")),
  "legacy document not preserved",
);
const migratedList = await migratedCtx.accounts.list();
assert.ok(migratedList.includes("CLAUDE_SUB_OAUTH_TOKEN"), "migrated token not listed");
assert.ok(migratedList.includes("KIMI_API_KEY"), "migrated key not listed");
console.log("v1->v2 migration ok:", migratedList.join(", "));
rmSync(legacyHome, { recursive: true, force: true });

/* -------------------------------------------------------------------------- */
/* SecretValue redaction — mirrored from Andromeda "secret material never      */
/* leaks".                                                                     */
/* -------------------------------------------------------------------------- */
{
  const value = new SecretValue("topsecret-123");
  assert.equal(value.toString(), "[redacted]");
  assert.equal(value.toJSON(), "[redacted]");
  assert.equal(JSON.stringify(value), '"[redacted]"');
  assert.equal(inspect(value), "SecretValue([redacted])");
  assert.ok(!JSON.stringify({ nested: value }).includes("topsecret"));
  assert.equal(Object.getOwnPropertyNames(value).includes("value"), false);
  assert.ok(value.equals(new SecretValue("topsecret-123")));
  assert.ok(!value.equals(new SecretValue("other")));
  assert.equal(value.reveal(), "topsecret-123");
  console.log("secret value redaction ok");
}

/* -------------------------------------------------------------------------- */
/* Nine-type record round-trip — mirrored from Andromeda "secret record        */
/* model" and "encrypted vault storage".                                       */
/* -------------------------------------------------------------------------- */
{
  const now = 1_700_000_000_000;
  const scope = { workspace: "*", agents: ["test"] };
  const materials = [
    { type: "api_key", apiKey: new SecretValue("sk-test-1"), header: "Authorization" },
    {
      type: "oauth_token",
      accessToken: new SecretValue("at-1"),
      refreshToken: new SecretValue("rt-1"),
      refreshTokenExpiresAt: null,
      scopes: ["openid", "repo"],
      subscriptionType: "Pro",
      tokenEndpoint: null,
    },
    {
      type: "password",
      username: "user@example.com",
      password: new SecretValue("pw-1"),
      origin: null,
      loginUrl: null,
    },
    {
      type: "totp_seed",
      parameters: createTotpParameters({
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        issuer: "GitHub",
        account: "user",
      }),
    },
    {
      type: "passkey",
      credentialId: "cred-id",
      relyingPartyId: "example.com",
      userHandle: "user-handle",
      userName: "user",
      coseAlgorithm: -7,
      privateKey: new SecretValue("pk-1"),
      signCount: 1,
      transports: ["usb"],
      userVerificationRequired: false,
    },
    {
      type: "cookie_jar",
      origin: "https://example.com",
      jar: new SecretValue("session=abc; sid=123"),
      sessionExpiresAt: null,
    },
    {
      type: "recovery_codes",
      codes: [new SecretValue("AAAA-1111"), new SecretValue("BBBB-2222")],
      consumed: 0,
    },
    {
      type: "ssh_key",
      privateKey: new SecretValue("PRIVATE-1"),
      publicKey: "ssh-ed25519 AAAA pub",
      passphrase: null,
      fingerprint: "SHA256:abc",
      comment: "user@host",
    },
    { type: "generic_note", note: new SecretValue("note-secret") },
  ];
  const memory = new MemoryVault();
  const encrypted = new EncryptedFileVault({
    directory: join(home, "roundtrip"),
    masterKey: new StaticMasterKey(randomBytes(32)),
  });
  assert.equal(SECRET_TYPES.length, 9);
  const plaintexts = new Set(materials.map((material) => firstSecret(material)));
  for (const material of materials) {
    const id = `rt-${material.type.replace(/_/g, "-")}`;
    const record = createSecretRecord({
      id,
      label: material.type,
      purpose: "demo",
      scope,
      material,
      now: () => now,
    });
    await memory.put(record);
    await encrypted.put(record);
    assert.ok(
      materialEquals(material, (await memory.get(id)).material),
      `memory round-trip failed for ${material.type}`,
    );
    assert.ok(
      materialEquals(material, (await encrypted.get(id)).material),
      `encrypted round-trip failed for ${material.type}`,
    );
    const descriptor = descriptorOf(await encrypted.get(id));
    assert.equal(descriptor.material, undefined);
    assert.ok(!JSON.stringify(descriptor).includes(firstSecret(material)));
  }
  // Encrypted at rest: none of the material may appear anywhere in the vault dir.
  const vaultDoc = readdirSync(join(home, "roundtrip"))
    .map((file) => readFileSync(join(home, "roundtrip", file), "utf8"))
    .join("\n");
  for (const plaintext of plaintexts) {
    if (plaintext === null) continue;
    assert.ok(!vaultDoc.includes(plaintext), `vault holds plaintext: ${plaintext}`);
  }
  // Rotation keeps the audit correlation and rejects a type change.
  const rotated = rotateSecretRecord(
    await encrypted.get("rt-api-key"),
    { type: "api_key", apiKey: new SecretValue("sk-test-2"), header: null },
    { now: () => now + 1000 },
  );
  assert.equal(rotated.auditRef, (await encrypted.get("rt-api-key")).auditRef);
  assert.ok(Date.parse(rotated.updatedAt) > Date.parse(rotated.createdAt));
  await assert.rejects(async () => {
    const record = await encrypted.get("rt-api-key");
    rotateSecretRecord(record, {
      type: "password",
      username: "u",
      password: new SecretValue("x"),
      origin: null,
      loginUrl: null,
    });
  });
  console.log("nine-type round-trip + rotation ok");
}

/* -------------------------------------------------------------------------- */
/* RFC 6238 test vectors — mirrored from Andromeda "RFC 6238 time-based one-   */
/* time passwords".                                                            */
/* -------------------------------------------------------------------------- */
{
  const encoder = new TextEncoder();
  const vectors = [
    {
      algorithm: "SHA1",
      seed: "12345678901234567890",
      cases: [
        [59, "94287082"],
        [1111111109, "07081804"],
        [1111111111, "14050471"],
        [1234567890, "89005924"],
      ],
    },
    {
      algorithm: "SHA256",
      seed: "12345678901234567890123456789012",
      cases: [
        [59, "46119246"],
        [1111111109, "68084774"],
        [1111111111, "67062674"],
        [1234567890, "91819424"],
      ],
    },
    {
      algorithm: "SHA512",
      seed: "1234567890123456789012345678901234567890123456789012345678901234",
      cases: [
        [59, "90693936"],
        [1111111109, "25091201"],
        [1111111111, "99943326"],
        [1234567890, "93441116"],
      ],
    },
  ];
  for (const { algorithm, seed, cases } of vectors) {
    const key = encoder.encode(seed);
    const parameters = createTotpParameters({
      secret: encodeBase32(key),
      algorithm,
      digits: 8,
      period: 30,
    });
    for (const [timeSec, expected] of cases) {
      const code = generateTotp(parameters, timeSec * 1000);
      assert.equal(code.counter, Math.floor(timeSec / 30), `rfc6238 ${algorithm} step ${timeSec}`);
      assert.equal(code.code, expected, `rfc6238 ${algorithm} step ${timeSec}`);
    }
  }
  assert.equal(
    hotpCode(encoder.encode(vectors[0].seed), 1, { digits: 8, algorithm: "SHA1" }),
    "94287082",
  );
  const parameters = createTotpParameters({ secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30 });
  const at = 1_700_000_000_000;
  const generated = generateTotp(parameters, at);
  assert.equal(generated.code.length, 6);
  assert.ok(verifyTotp(parameters, generated.code, at).valid);
  assert.ok(!verifyTotp(parameters, "000000", at).valid);
  const uri = formatOtpauthUri(parameters);
  const parsed = parseOtpauthUri(uri);
  assert.ok(parsed.secret.equals(parameters.secret));
  assert.throws(() =>
    parseOtpauthUri("otpauth://hotp/ACME:user?secret=JBSWY3DPEHPK3PXP&counter=1"),
  );
  assert.throws(() => parseOtpauthUri("https://example.com/totp?secret=JBSWY3DPEHPK3PXP"));
  const bytes = decodeBase32("jbs w y3dpehpk3pxp="); // lowercase, spaces, padding tolerated
  assert.equal(encodeBase32(bytes), "JBSWY3DPEHPK3PXP");
  console.log("rfc 6238 vectors + otpauth uri ok");
}

/* -------------------------------------------------------------------------- */
/* Master key sources — mirrored from Andromeda "master key sources".          */
/* -------------------------------------------------------------------------- */
{
  const dir = join(home, "mk");
  mkdirSync(dir, { recursive: true });
  const record = createSecretRecord({
    id: "mk-secret",
    label: "Key",
    purpose: "demo",
    scope: { workspace: "*", agents: [] },
    material: { type: "api_key", apiKey: new SecretValue("mk-secret-value"), header: null },
  });
  const keyFile = new KeyFileMasterKey({ directory: dir });
  await new EncryptedFileVault({ directory: dir, masterKey: keyFile }).put(record);
  const reopen = new EncryptedFileVault({
    directory: dir,
    masterKey: new KeyFileMasterKey({ directory: dir }),
  });
  assert.equal((await reopen.get("mk-secret")).material.apiKey.reveal(), "mk-secret-value");
  await assert.rejects(
    new EncryptedFileVault({ directory: dir, masterKey: new StaticMasterKey(randomBytes(32)) }).get(
      "mk-secret",
    ),
  );
  assert.throws(() => new StaticMasterKey(randomBytes(16)));
  assert.equal(keyFile.keyFile, join(dir, "master.key"));

  const ppDir = join(home, "mk-passphrase");
  mkdirSync(ppDir, { recursive: true });
  const params = { N: 1 << 14, r: 8, p: 1 };
  const ppRecord = createSecretRecord({
    id: "pp-secret",
    label: "Phrase",
    purpose: "demo",
    scope: { workspace: "*", agents: [] },
    material: { type: "generic_note", note: new SecretValue("pp-secret-value") },
  });
  await new EncryptedFileVault({
    directory: ppDir,
    masterKey: new PassphraseMasterKey({
      directory: ppDir,
      passphrase: new SecretValue("correct horse"),
      scrypt: params,
    }),
  }).put(ppRecord);
  const ppReopen = new EncryptedFileVault({
    directory: ppDir,
    masterKey: new PassphraseMasterKey({
      directory: ppDir,
      passphrase: new SecretValue("correct horse"),
      scrypt: params,
    }),
  });
  assert.equal((await ppReopen.get("pp-secret")).material.note.reveal(), "pp-secret-value");
  await assert.rejects(
    new EncryptedFileVault({
      directory: ppDir,
      masterKey: new PassphraseMasterKey({
        directory: ppDir,
        passphrase: new SecretValue("wrong horse"),
        scrypt: params,
      }),
    }).get("pp-secret"),
  );
  const derivedA = await deriveScryptKey(new SecretValue("p"), new Uint8Array([1, 2, 3]), params);
  const derivedB = await deriveScryptKey(new SecretValue("p"), new Uint8Array([1, 2, 3]), params);
  assert.ok(sameKey(derivedA, derivedB));
  assert.ok(!sameKey(derivedA, randomBytes(32)));
  console.log("master key sources ok");
}

/* -------------------------------------------------------------------------- */
/* Scope denial, audit trail, custody — mirrored from Andromeda "agent-facing  */
/* vault API" and vault-tools "authorization".                                 */
/* -------------------------------------------------------------------------- */
{
  const now = 1_700_000_000_000;
  const vault = new MemoryVault();
  await vault.put(
    createSecretRecord({
      id: "owner-secret",
      label: "Owner",
      purpose: "demo",
      scope: { workspace: "*", agents: [] },
      material: { type: "generic_note", note: new SecretValue("owner-material") },
      now: () => now,
    }),
  );
  await vault.put(
    createSecretRecord({
      id: "agent-secret",
      label: "Agent",
      purpose: "demo",
      scope: { workspace: "*", agents: ["helper"] },
      material: { type: "generic_note", note: new SecretValue("agent-material") },
      now: () => now,
    }),
  );
  await vault.put(
    createSecretRecord({
      id: "totp",
      label: "GitHub",
      purpose: "github",
      scope: { workspace: "*", agents: ["helper"] },
      material: {
        type: "totp_seed",
        parameters: createTotpParameters({ secret: "JBSWY3DPEHPK3PXP" }),
      },
      now: () => now,
    }),
  );
  const audit = new MemoryAuditLog();
  const custodian = new PrivilegedVaultCustodian({
    vault,
    identity: { workspace: "w", agent: "helper" },
    audit,
    now: () => now,
  });

  await assert.rejects(custodian.revealSecret("owner-secret"), VaultAccessError);
  const granted = await custodian.revealSecret("agent-secret");
  assert.equal(granted.material.note.reveal(), "agent-material");
  await assert.rejects(custodian.revealSecret("missing-id"), VaultAccessError);

  const sealed = custodian.seal();
  assert.equal(sealed.custody, "sealed");
  await assert.rejects(sealed.revealSecret("agent-secret"), VaultMaterialSealedError);
  const sealedCode = await sealed.totpCode("totp");
  assert.equal(sealedCode.code.length, 6);

  assert.deepEqual((await custodian.listAccessible()).map((descriptor) => descriptor.id).sort(), [
    "agent-secret",
    "totp",
  ]);
  await assert.rejects(custodian.totpCode("agent-secret"), /not a totp_seed/);

  const entries = audit.entries();
  const actions = new Set(entries.map((entry) => entry.action));
  for (const action of ["read", "read_denied", "read_missing", "read_sealed", "totp_generated"]) {
    assert.ok(actions.has(action), `audit missing ${action}`);
  }
  assert.ok(!JSON.stringify(entries).includes("owner-material"));
  assert.ok(!JSON.stringify(entries).includes("agent-material"));
  console.log("scope denial + audit + custody ok");
}

/* -------------------------------------------------------------------------- */
/* Auth failure classification, re-auth planning, supervisor — mirrored from    */
/* Andromeda's corresponding suites.                                           */
/* -------------------------------------------------------------------------- */
{
  assert.deepEqual(classifyAuthFailure({ transport: true }), {
    kind: "recoverable",
    reason: "transport_failure",
  });
  assert.deepEqual(classifyAuthFailure({ status: 401, error: "invalid_grant" }), {
    kind: "terminal",
    reason: "invalid_grant",
  });
  assert.deepEqual(classifyAuthFailure({ status: 401 }), { kind: "terminal", reason: "unknown" });
  assert.deepEqual(classifyAuthFailure({ status: 429 }), {
    kind: "recoverable",
    reason: "rate_limited",
  });
  assert.deepEqual(classifyAuthFailure({ status: 503 }), {
    kind: "recoverable",
    reason: "http_503",
  });
  assert.deepEqual(classifyAuthFailure({ message: "a captcha was shown" }), {
    kind: "terminal",
    reason: "captcha_required",
  });

  const now = 1_700_000_000_000;
  const dead = createSecretRecord({
    id: "dead-oauth",
    label: "API",
    purpose: "demo",
    scope: { workspace: "*", agents: [] },
    material: {
      type: "oauth_token",
      accessToken: new SecretValue("at"),
      refreshToken: new SecretValue("rt"),
      refreshTokenExpiresAt: null,
      scopes: [],
      subscriptionType: null,
      tokenEndpoint: null,
    },
    now: () => now,
  });
  const password = createSecretRecord({
    id: "pw-peer",
    label: "Password",
    purpose: "demo",
    scope: { workspace: "*", agents: [] },
    material: {
      type: "password",
      username: "u",
      password: new SecretValue("pw"),
      origin: null,
      loginUrl: null,
    },
    now: () => now,
  });
  const totpSeed = createSecretRecord({
    id: "totp-peer",
    label: "Totp",
    purpose: "demo",
    scope: { workspace: "*", agents: [] },
    material: {
      type: "totp_seed",
      parameters: createTotpParameters({ secret: "JBSWY3DPEHPK3PXP" }),
    },
    now: () => now,
  });
  const plan = planReauth(dead, "invalid_grant", [password, totpSeed]);
  assert.equal(plan.strategy, "password_totp_login");
  assert.equal(plan.automatedToday, false);
  assert.deepEqual(plan.materials.sort(), ["pw-peer", "totp-peer"]);
  assert.equal(
    planReauth(dead, "captcha_required", [password, totpSeed]).strategy,
    "human_presence_required",
  );
  assert.equal(planReauth(dead, "invalid_grant", []).strategy, "human_presence_required");

  const vault = new MemoryVault();
  const oauth = createSecretRecord({
    id: "svc-oauth",
    label: "SVC",
    purpose: "demo",
    scope: { workspace: "*", agents: ["srv"] },
    material: {
      type: "oauth_token",
      accessToken: new SecretValue("old-access"),
      refreshToken: new SecretValue("old-refresh"),
      refreshTokenExpiresAt: null,
      scopes: ["openid"],
      subscriptionType: null,
      tokenEndpoint: null,
    },
    expiresAt: new Date(now - 1000).toISOString(),
    now: () => now,
  });
  await vault.put(oauth);
  const calls = [];
  /**
   * Initiates an OAuth authentication request and returns an access token.
   *
   * Guarantees a successful response with status 200 and a valid OAuth token.
   *
   * @returns An object containing OAuth token details including access_token, refresh_token, expires_in, and token_type.
   */
  const transport = async (request) => {
    calls.push(request.url);
    return {
      status: 200,
      body: {
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      },
    };
  };
  /**
   * @returns An object containing OAuth configuration details including method, authorizeUrl, tokenUrl, clientId, scopes, and redirect.
   * If the request fails, it returns an object with the same configuration details.
   */
  const authFor = async () => ({
    method: "oauth_pkce",
    authorizeUrl: "https://auth.example/authorize",
    tokenUrl: "https://token.example/token",
    clientId: "client-1",
    scopes: ["openid"],
    redirect: "loopback",
  });
  const supervisor = new ReauthSupervisor({
    vault,
    now: () => now,
    transport,
    random: () => 0.5,
    sleep: async () => {},
    authFor,
  });
  const fresh = await supervisor.ensureFresh("svc-oauth");
  assert.equal(fresh.kind, "refreshed");
  const rotated = await vault.get("svc-oauth");
  assert.equal(rotated.material.accessToken.reveal(), "fresh-access");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("token.example"));
  const swept = await supervisor.sweep();
  assert.deepEqual(swept.healthy, ["svc-oauth"]);

  const failure = await supervisor.reportFailure("svc-oauth", {
    status: 401,
    error: "invalid_grant",
  });
  assert.equal(failure.kind, "terminal");
  assert.equal(failure.reason, "invalid_grant");
  assert.equal(supervisor.events().length, 1);
  assert.equal(supervisor.events()[0].event, "reauth_required");
  const health = await supervisor.health();
  const svcHealth = health.find((entry) => entry.id === "svc-oauth");
  assert.equal(svcHealth.state, "needs_reauth");
  assert.equal(svcHealth.strategy, "human_presence_required");
  assert.equal(svcHealth.selfHealing, false);
  assert.equal(
    await supervisor.ensureFresh("svc-oauth").then((outcome) => outcome.kind),
    "reauth_required",
  );
  console.log("auth failure classification + re-auth planning + supervisor ok");
}

/* -------------------------------------------------------------------------- */
/* Owner CLI io-seam: no secret on argv, no reveal without --reveal,           */
/* fingerprints only everywhere else.                                          */
/* -------------------------------------------------------------------------- */
{
  const dir = join(home, "cli");
  mkdirSync(dir, { recursive: true });
  const captured = [];
  const io = {
    out: (text) => captured.push(text),
    err: (text) => captured.push(text),
    readStdin: async () => "cli-secret-value",
    isTty: false,
    env: { ANDROMEDA_VAULT_DIR: dir },
    home,
    now: () => 1_700_000_000_000,
  };
  assert.equal(await vaultCommand(["init"], io), 0);
  assert.equal(
    await vaultCommand(
      [
        "add",
        "--id",
        "cli-token",
        "--type",
        "api_key",
        "--label",
        "CLI token",
        "--purpose",
        "demo",
        "--stdin",
      ],
      io,
    ),
    0,
  );
  assert.equal(await vaultCommand(["list"], io), 0);
  assert.ok(captured.some((line) => line.includes("cli-token")));
  assert.ok(!captured.join("").includes("cli-secret-value"));
  captured.length = 0;
  assert.equal(await vaultCommand(["get", "--id", "cli-token"], io), 2);
  assert.ok(captured.some((line) => line.includes("refusing to reveal")));
  assert.ok(
    captured.some((line) => line.includes("apiKey=cli-…(16)")),
    "get must show a fingerprint, not the value",
  );
  assert.ok(!captured.join("").includes("cli-secret-value"));
  captured.length = 0;
  assert.equal(await vaultCommand(["get", "--id", "cli-token", "--reveal"], io), 0);
  assert.ok(
    captured.some((line) => line.includes("cli-secret-value")),
    "--reveal is the only door",
  );
  captured.length = 0;
  const revealFile = join(home, "cli-reveal.txt");
  assert.equal(
    await vaultCommand(["get", "--id", "cli-token", "--reveal", "--out", revealFile], io),
    0,
  );
  assert.ok(!captured.join("").includes("cli-secret-value"));
  assert.equal(readFileSync(revealFile, "utf8"), "cli-secret-value");
  captured.length = 0;
  // A secret smuggled onto argv is refused, and never echoed anywhere.
  assert.equal(
    await vaultCommand(
      [
        "add",
        "--id",
        "argv-token",
        "--type",
        "api_key",
        "--label",
        "A",
        "--purpose",
        "demo",
        "--value",
        "argv-secret-xyz",
      ],
      io,
    ),
    1,
  );
  assert.ok(captured.some((line) => line.includes("never from a command-line argument")));
  assert.ok(!captured.join("").includes("argv-secret-xyz"));
  assert.deepEqual(fingerprint("apiKey", "sk-abcdef1234"), {
    field: "apiKey",
    prefix: "sk-a",
    length: 13,
  });
  assert.ok(!formatFingerprint(fingerprint("apiKey", "sk-abcdef1234")).includes("sk-abcdef1234"));
  console.log("owner cli io-seam ok");
}

/* -------------------------------------------------------------------------- */
/* Vault presented as a provider credential store.                             */
/* -------------------------------------------------------------------------- */
{
  const vault = new MemoryVault();
  const store = new VaultCredentialStore({ vault });
  const now = new Date(1_700_000_000_000).toISOString();
  await store.put("gh-oauth", {
    kind: "oauth",
    accessToken: new SecretValue("at-value"),
    refreshToken: new SecretValue("rt-value"),
    expiresAt: null,
    refreshTokenExpiresAt: null,
    scopes: ["repo"],
    subscriptionType: null,
    obtainedAt: now,
  });
  const credential = await store.get("gh-oauth");
  assert.equal(credential.kind, "oauth");
  assert.equal(credential.accessToken.reveal(), "at-value");
  await vault.put(
    createSecretRecord({
      id: "plain-password",
      label: "Password",
      purpose: "demo",
      scope: { workspace: "*", agents: [] },
      material: {
        type: "password",
        username: "u",
        password: new SecretValue("pw"),
        origin: null,
        loginUrl: null,
      },
    }),
  );
  assert.deepEqual(await store.list(), ["gh-oauth"]);
  // A record the store auto-created carries a scope that denies every agent.
  const custodian = new PrivilegedVaultCustodian({
    vault,
    identity: { workspace: "w", agent: "x" },
  });
  await assert.rejects(custodian.revealSecret("gh-oauth"), VaultAccessError);
  assert.equal(await store.delete("gh-oauth"), true);
  assert.equal(await store.delete("gh-oauth"), false);
  console.log("vault as provider credential store ok");
}

/* -------------------------------------------------------------------------- */
/* Vault web surface: the `/vault` page + JSON API over ctx.accounts.         */
/* Material discipline — list rows never carry secret values; the page never   */
/* embeds stored material.                                                     */
/* -------------------------------------------------------------------------- */
{
  const { makeVaultHandler, KNOWN_REF_NAMES } = plugin;
  assert.ok(Array.isArray(KNOWN_REF_NAMES));
  for (const ref of [
    "CLAUDE_SUB_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "GITHUB_OAUTH_TOKEN",
    "DEEPSEEK_API_KEY",
  ]) {
    assert.ok(KNOWN_REF_NAMES.includes(ref), `known ref missing: ${ref}`);
  }
  assert.ok(!makeVaultHandler.toString().includes("topsecret"));
  const server = createServer(makeVaultHandler(ctx.accounts));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const page = await fetch(`${base}/vault`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes("<title>Keychain"), "keychain page not served");
    assert.ok(html.includes("/vault/api/accounts"), "vault page missing API wiring");

    const secret = "web-secret-value-42";
    const put = await fetch(`${base}/vault/api/accounts/WEB_TEST_TOKEN`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: secret }),
    });
    assert.equal(put.status, 200);

    const list = await fetch(`${base}/vault/api/accounts`);
    assert.equal(list.status, 200);
    const listBody = await list.json();
    const row = listBody.rows.find((entry) => entry.ref === "WEB_TEST_TOKEN");
    assert.ok(row, "list missing stored ref");
    assert.equal(row.inVault, true);
    assert.ok(!JSON.stringify(listBody).includes(secret), "list leaks material");

    const reveal = await fetch(`${base}/vault/api/accounts/WEB_TEST_TOKEN`);
    assert.equal(reveal.status, 200);
    assert.deepEqual(await reveal.json(), { ref: "WEB_TEST_TOKEN", account: null, value: secret });

    const del = await fetch(`${base}/vault/api/accounts/WEB_TEST_TOKEN`, { method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal(await ctx.accounts.resolve("WEB_TEST_TOKEN"), undefined);

    const badRef = await fetch(`${base}/vault/api/accounts/${encodeURIComponent("../etc/passwd")}`);
    assert.equal(badRef.status, 400);
    const missing = await fetch(`${base}/vault/api/nope`);
    assert.equal(missing.status, 404);
    const badMethod = await fetch(`${base}/vault/api/accounts`, { method: "POST" });
    assert.equal(badMethod.status, 405);
  } finally {
    server.close();
  }
  console.log("vault web surface ok — page + list/reveal/set/unset over HTTP");
}

/* -------------------------------------------------------------------------- */
/* Real-boot witness: the exact slot references providers resolves through   */
/* `ctx.accounts.resolve(ref)` read the same vault the `dsh accounts` owner    */
/* CLI drives.                                                                 */
/* -------------------------------------------------------------------------- */
{
  let routes = null;
  try {
    const lib =
      process.env.DSH_PROVIDERS_PROVIDERS_LIB ??
      "/Users/user/agents/plugins/providers/lib/providers.js";
    routes = (await import(pathToFileURL(lib).href)).PROVIDER_ROUTES;
  } catch (error) {
    console.warn("boot witness skipped: providers lib unavailable");
  }
  if (routes) {
    const refs = new Set();
    for (const route of routes) {
      for (const slot of route.authSlots) refs.add(slot.ref);
    }
    for (const ref of refs) {
      await ctx.accounts.set(ref, `boot-${ref}`);
      const got = await ctx.accounts.resolve(ref);
      assert.equal(got.origin, "vault", `provider ref not vault-backed: ${ref}`);
      assert.equal(got.value, `boot-${ref}`);
    }
    const bin = join(dirname(fileURLToPath(import.meta.url)), "bin", "accounts.mjs");
    const env = { ...process.env, DSH_HOME: home };
    const init = spawnSync(process.execPath, [bin, "init"], { env, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const list = spawnSync(process.execPath, [bin, "list"], { env, encoding: "utf8" });
    assert.equal(list.status, 0, list.stderr);
    for (const ref of refs)
      assert.ok(
        list.stdout.includes(slugRecordId(ref)),
        `dsh accounts list missing ${slugRecordId(ref)}`,
      );
    const reveal = spawnSync(
      process.execPath,
      [bin, "get", "--id", slugRecordId("CLAUDE_SUB_OAUTH_TOKEN"), "--reveal"],
      { env, encoding: "utf8" },
    );
    assert.equal(reveal.status, 0, reveal.stderr);
    assert.ok(
      reveal.stdout.includes("boot-CLAUDE_SUB_OAUTH_TOKEN"),
      "owner CLI did not see the service-written token",
    );
    console.log(
      "boot witness ok — providers resolve() and `dsh accounts` share one vault:",
      [...refs].join(", "),
    );
  }
}

rmSync(home, { recursive: true, force: true });
console.log("plugin check passed");

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** firstSecret implementation. */
function firstSecret(material) {
  switch (material.type) {
    case "api_key":
      return material.apiKey.reveal();
    case "oauth_token":
      return material.accessToken.reveal();
    case "password":
      return material.password.reveal();
    case "totp_seed":
      return material.parameters.secret.reveal();
    case "passkey":
      return material.privateKey.reveal();
    case "cookie_jar":
      return material.jar.reveal();
    case "recovery_codes":
      return material.codes[0]?.reveal() ?? null;
    case "ssh_key":
      return material.privateKey.reveal();
    case "generic_note":
      return material.note.reveal();
  }
}

/**
 * Compares two material objects to determine if they are equal by revealing and comparing their sensitive data.
 *
 * @param a - The first material object to compare.
 * @param b - The second material object to compare.
 * @returns `true` if both objects are of the same type and their sensitive data reveals to equal values; `false` otherwise.
 * @returns `false` if the types do not match or if the sensitive data does not reveal to equal values.
 */
function materialEquals(a, b) {
  if (a.type !== b.type) return false;
  const /** reveal implementation. */ reveal = (value) => value?.reveal?.();
  switch (a.type) {
    case "api_key":
      return reveal(a.apiKey) === reveal(b.apiKey) && a.header === b.header;
    case "oauth_token":
      return (
        reveal(a.accessToken) === reveal(b.accessToken) &&
        (a.refreshToken ? reveal(a.refreshToken) : null) ===
          (b.refreshToken ? reveal(b.refreshToken) : null) &&
        a.refreshTokenExpiresAt === b.refreshTokenExpiresAt &&
        JSON.stringify(a.scopes) === JSON.stringify(b.scopes) &&
        a.subscriptionType === b.subscriptionType &&
        a.tokenEndpoint === b.tokenEndpoint
      );
    case "password":
      return (
        a.username === b.username &&
        reveal(a.password) === reveal(b.password) &&
        a.origin === b.origin &&
        a.loginUrl === b.loginUrl
      );
    case "totp_seed":
      return (
        a.parameters.secret.equals(b.parameters.secret) &&
        a.parameters.algorithm === b.parameters.algorithm &&
        a.parameters.digits === b.parameters.digits &&
        a.parameters.period === b.parameters.period &&
        a.parameters.issuer === b.parameters.issuer &&
        a.parameters.account === b.parameters.account
      );
    case "passkey":
      return (
        a.credentialId === b.credentialId &&
        a.relyingPartyId === b.relyingPartyId &&
        a.userHandle === b.userHandle &&
        a.userName === b.userName &&
        a.coseAlgorithm === b.coseAlgorithm &&
        reveal(a.privateKey) === reveal(b.privateKey) &&
        a.signCount === b.signCount &&
        JSON.stringify(a.transports) === JSON.stringify(b.transports) &&
        a.userVerificationRequired === b.userVerificationRequired
      );
    case "cookie_jar":
      return (
        a.origin === b.origin &&
        reveal(a.jar) === reveal(b.jar) &&
        a.sessionExpiresAt === b.sessionExpiresAt
      );
    case "recovery_codes":
      return (
        a.consumed === b.consumed &&
        a.codes.length === b.codes.length &&
        a.codes.every((code, index) => reveal(code) === reveal(b.codes[index]))
      );
    case "ssh_key":
      return (
        reveal(a.privateKey) === reveal(b.privateKey) &&
        a.publicKey === b.publicKey &&
        (a.passphrase ? reveal(a.passphrase) : null) ===
          (b.passphrase ? reveal(b.passphrase) : null) &&
        a.fingerprint === b.fingerprint &&
        a.comment === b.comment
      );
    case "generic_note":
      return reveal(a.note) === reveal(b.note);
  }
  return false;
}

const clientPath = join(dirname(fileURLToPath(import.meta.url)), "lib", "client.js");
assert.ok(existsSync(clientPath), "lib/client.js missing — run `npm run build`");
const cryptoPolyfill = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "scripts",
    "client-runtime",
    "crypto-polyfill.js",
  ),
  "utf8",
);
const glyphFactory = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "scripts",
    "client-runtime",
    "glyph-factory.js",
  ),
  "utf8",
);
assert.equal(
  readFileSync(clientPath, "utf8"),
  cryptoPolyfill +
    glyphFactory +
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client.js"), "utf8"),
  "lib/client.js must be the shared crypto polyfill + glyph factory + client.js",
);
const registered = {};
globalThis.window = {
  __ModuleLoader__: {
    load: (spec) => {
      registered.spec = spec;
    },
  },
};
await import(clientPath);
assert.equal(registered.spec.id, "credentials");
const clientExports = registered.spec.factory((spec) => {
  if (spec === "react" || spec === "@deepseek-ai/dsh-client-ui-primitives") return {};
  throw new Error("unexpected require: " + spec);
}, {});
assert.deepEqual(clientExports.inject, ["slots", "locale"]);
const registrants = new Map();
const registrations = [];
const clientCtx = {
  /**
   * Loads the client module and registers its factory function.
   *
   * Guarantees that the `registered.spec.factory` function is called with the provided spec.
   * Returns the result of the factory function.
   * Fails if the module does not export a factory function or if the spec is not correctly registered.
   */
  effect(fn) {
    fn();
  },
  locale: {
    /**
     * Registers a module factory with a specified ID and exports.
     *
     * Guarantees that the registered factory will be available under the specified ID.
     *
     * @param spec - The specification for the module being registered.
     * @throws Will throw an error if an unexpected require is detected.
     */
    /**
     * Registers a module factory for a specific client specification.
     *
     * Guarantees the factory function to be called with the given specification,
     * returning an object with `inject` properties. Throws an error for unexpected
     * specifications.
     *
     * @param {string} spec - The specification for which the factory is registered.
     * @returns {Object} An object containing the `inject` properties.
     */
    register() {},
  },
  slots: {
    /**
     * Registers the client module's factory function and injects specified slots and locale.
     *
     * @param {string} spec - The module specification to load, which must be either "react" or "@deepseek-ai/dsh-client-ui-primitives".
     * @returns {Object} - An object containing the injected slots and locale.
     * @throws {Error} - Throws an error if the spec is not "react" or "@deepseek-ai/dsh-client-ui-primitives".
     */
    inject(name, fn) {
      registrants.set(name, fn);
    },
    /** register implementation. */
    register(spec) {
      registrations.push(spec);
      return spec;
    },
  },
};
clientExports.apply(clientCtx);
const section = registrants.get("settings.section")();
assert.equal(section.name, "settings.section");
assert.equal(section.id, "keychain");
assert.equal(section.order, 35);
const glyph = registrants.get("settings.section.icon")();
assert.equal(glyph.name, "settings.section.icon");
assert.equal(glyph.id, "keychain");
// ---- CLI login: launcher resolution + keychain shapes ----
{
  const login = await import("./lib/login.js");
  const assert = (await import("node:assert")).default;

  // A native binary must be spawned as itself. Handing it to node is what
  // produced ERR_UNKNOWN_FILE_EXTENSION ".exe" once Claude Code shipped one.
  const native = login.resolveCliInvocation("/Users/user/.npm-global/bin/claude", [
    "auth",
    "login",
  ]);
  assert.equal(native.command, "/Users/user/.npm-global/bin/claude");
  assert.deepEqual(native.args, ["auth", "login"]);

  // A JS entry point still needs a node host.
  const js = login.resolveCliInvocation("/definitely/missing/cli.js", ["x"]);
  assert.equal(js.command, process.execPath);
  assert.deepEqual(js.args, ["/definitely/missing/cli.js", "x"]);

  // Both keychain payload shapes parse; anything else is null.
  const goKeyring =
    "go-keyring-base64:" +
    Buffer.from(
      JSON.stringify({
        token: {
          access_token: "gem-access",
          refresh_token: "gem-refresh",
          expiry: "2026-01-01T00:00:00Z",
        },
      }),
    ).toString("base64");
  assert.deepEqual(login.parseKeychainCredentials(goKeyring), {
    accessToken: "gem-access",
    refreshToken: "gem-refresh",
    expiresAt: "2026-01-01T00:00:00Z",
  });
  assert.deepEqual(
    login.parseKeychainCredentials(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "cc-access",
          refreshToken: "cc-refresh",
          expiresAt: 1787077129647,
        },
      }),
    ),
    { accessToken: "cc-access", refreshToken: "cc-refresh", expiresAt: "1787077129647" },
  );
  assert.equal(login.parseKeychainCredentials(""), null);
  assert.equal(login.parseKeychainCredentials("not json"), null);
  assert.equal(login.parseKeychainCredentials('{"other":{}}'), null);

  // Only gemini wipes its stored credential before spawning.
  const byId = Object.fromEntries(login.PROVIDER_LOGINS.map((p) => [p.id, p]));
  assert.equal(byId["gemini-sub"].clearBeforeLogin, true);
  assert.equal(byId["claude-sub"].clearBeforeLogin, undefined);
  assert.equal(byId["claude-sub"].tokenSource.service, "Claude Code-credentials");

  console.log("cli login resolution + keychain shapes ok");
}

console.log("keychain client ok");

// jscpd:ignore-end
