import { createSecretRecord, type SecretScope } from "../record.js";
import type { VaultStore } from "../store.js";
import { canonicalRefsForPurpose } from "../../refs.js";
import { redactFinding, type Finding, type RedactedFinding } from "./scan-finding.js";

export interface ImportOptions {
  scope: SecretScope;
  now(): number;
  /** Skip a finding whose id already exists rather than replacing it. */
  skipExisting?: boolean;
}

export type ImportOutcome =
  | { kind: "imported"; id: string; finding: RedactedFinding }
  | { kind: "skipped"; id: string; reason: string; finding: RedactedFinding };

/**
 * Provenance, as tags. Tags are the record's only free-form metadata channel and
 * they are already carried through `descriptorOf`, so an imported credential
 * answers "where did this come from and when" without a schema change and
 * without any risk of the answer travelling next to material.
 */
export function provenanceTags(finding: Finding, importedAt: string): string[] {
  return [
    `provenance:machine=${finding.origin.machine}`,
    `provenance:source=${finding.origin.kind}:${finding.origin.location}`,
    `provenance:detector=${finding.detector}`,
    `provenance:imported-at=${importedAt}`,
    `provider:${finding.provider}`,
    `plan:${finding.plan}`,
    ...(finding.account ? [`account:${finding.account}`] : []),
    ...canonicalRefsForPurpose(finding.purpose, finding.type).map((ref) => `ref:${ref}`),
  ];
}

/**
 * Imports findings into the vault.
 *
 * Guarantees that findings are redacted and checked for material.
 * Returns an array of ImportOutcome indicating the result of each import attempt.
 * Skips findings without readable material or if they already exist in the vault.
 */
export async function importFindings(
  vault: VaultStore,
  findings: readonly Finding[],
  options: ImportOptions,
): Promise<ImportOutcome[]> {
  const nowMs = options.now();
  const importedAt = new Date(nowMs).toISOString();
  const outcomes: ImportOutcome[] = [];
  for (const finding of findings) {
    const redacted = redactFinding(finding, nowMs);
    if (!finding.material) {
      outcomes.push({
        kind: "skipped",
        id: finding.suggestedId,
        reason: "no readable material",
        finding: redacted,
      });
      continue;
    }
    if (options.skipExisting && (await vault.get(finding.suggestedId))) {
      outcomes.push({
        kind: "skipped",
        id: finding.suggestedId,
        reason: "a record with this id already exists",
        finding: redacted,
      });
      continue;
    }
    await vault.put(
      createSecretRecord({
        id: finding.suggestedId,
        label: finding.label,
        purpose: finding.purpose,
        scope: options.scope,
        material: finding.material,
        expiresAt: finding.expiresAt,
        tags: provenanceTags(finding, importedAt),
        now: options.now,
      }),
    );
    outcomes.push({ kind: "imported", id: finding.suggestedId, finding: redacted });
  }
  return outcomes;
}
