/**
 * Reconciliation of an agent's actual MCP entry against the expected
 * projection: which managed entries drifted, and in which fields.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { isAxmManagedMcpEntry, type ExpectedAgentEntry } from "@agentxm/agent-integration";

export type DriftReport =
  | { readonly _tag: "absent" }
  | { readonly _tag: "match" }
  | { readonly _tag: "drift"; readonly fields: ReadonlyArray<string> }
  | { readonly _tag: "unmanaged" };

const normalizeForCompare = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (typeof value !== "object" || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    sorted[key] = normalizeForCompare(item);
  }
  return sorted;
};

const normalize = (value: unknown): string => JSON.stringify(normalizeForCompare(value));

export const diffAgentEntry = (
  expected: ExpectedAgentEntry,
  actual: Readonly<Record<string, unknown>> | undefined,
): DriftReport => {
  if (actual === undefined) return { _tag: "absent" };
  if (!isAxmManagedMcpEntry(actual)) return { _tag: "unmanaged" };
  if (expected._tag !== "projected") {
    return { _tag: "drift", fields: ["transport"] };
  }
  const fields = new Set<string>();
  const expectedKeys = new Set(Object.keys(expected.entry));
  const actualKeys = new Set(Object.keys(actual));
  for (const key of expectedKeys) {
    if (normalize(expected.entry[key]) !== normalize(actual[key])) {
      fields.add(key);
    }
  }
  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) {
      fields.add(key);
    }
  }
  return fields.size === 0 ? { _tag: "match" } : { _tag: "drift", fields: [...fields].sort() };
};
