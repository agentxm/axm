/**
 * Totality of the autofix operation vocabulary.
 *
 * The expected name set is derived from `EXTENSION_TYPE_TABLE`, not listed by
 * hand, so a new extension type fails this test until its install/uninstall
 * and activation verbs are decided. The two deliberate carve-outs are encoded
 * as data with their reasons.
 */

import { describe, expect, it } from "@effect/vitest";
import { REGISTRY_EXTENSION_TYPES, type ExtensionType } from "../../../../extensions/common.js";
import { PER_EXTENSION_OPERATION_NAMES } from "./install-ops.js";

/**
 * Types with no `enable`/`disable` operation, and why.
 *
 * These are exceptions to "every settings entry that supports `enabled` gets
 * activation verbs", so they are stated rather than inferred.
 */
const NO_ACTIVATION_OPS: Partial<Record<ExtensionType, string>> = {
  pack: "pack settings entries do not support `enabled`",
  "mcp-server":
    "activation is expressed per agent config through sync-mcp-server-agent / remove-mcp-server-agent",
};

/** Operations that are not per-extension verbs at all. */
const WORKSPACE_LEVEL_OPS: ReadonlyArray<string> = [
  "sync-instruction-target",
  "sync-instructions-gitignore",
  "sync-mcp-server-agent",
  "remove-mcp-server-agent",
];

const expectedNames = (): ReadonlySet<string> => {
  const names = new Set<string>(WORKSPACE_LEVEL_OPS);
  // Packs are installable but are not a `RegistryType` (placement
  // `container`), so they are added alongside the registry types.
  for (const type of [...REGISTRY_EXTENSION_TYPES, "pack" as const]) {
    names.add(`install-${type}`);
    names.add(`uninstall-${type}`);
    if (NO_ACTIVATION_OPS[type] === undefined) {
      names.add(`enable-${type}`);
      names.add(`disable-${type}`);
    }
  }
  return names;
};

describe("PER_EXTENSION_OPERATION_NAMES", () => {
  it("covers every install/uninstall and activation verb the type table implies", () => {
    const actual = new Set<string>(PER_EXTENSION_OPERATION_NAMES);
    const expected = expectedNames();

    expect([...expected].filter((name) => !actual.has(name)).sort()).toEqual([]);
    expect([...actual].filter((name) => !expected.has(name)).sort()).toEqual([]);
  });

  it("declares no duplicates", () => {
    expect(new Set(PER_EXTENSION_OPERATION_NAMES).size).toBe(PER_EXTENSION_OPERATION_NAMES.length);
  });
});
