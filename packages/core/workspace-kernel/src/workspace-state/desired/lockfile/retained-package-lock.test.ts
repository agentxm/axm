import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { LOCKFILE_VERSION, type Lockfile, LockfileSchema, SkillLockEntrySchema } from "./schema.js";

const skill = (name: string, commit = "accepted-commit") =>
  Schema.decodeUnknownSync(SkillLockEntrySchema)({
    source: {
      type: "git",
      url: "https://github.com/acme/plugins.git",
      path: `plugins/review/skills/${name}`,
      revision: "main",
      distribution: {
        format: "claude",
        packageRoot: "plugins/review",
        componentPath: `skills/${name}`,
        manifestPath: ".claude-plugin/plugin.json",
      },
    },
    identity: { name },
    resolved: { commit, tree: "accepted-package-tree" },
    treeIntegrity: `sha256-tree-v2:${"a".repeat(64)}`,
  });

const encode = Schema.encodeSync(LockfileSchema);
const decode = Schema.decodeUnknownSync(LockfileSchema);

describe("retained package lock codec", () => {
  it("stores one accepted snapshot for two component bindings and round-trips their selections", () => {
    const view = {
      lockfileVersion: LOCKFILE_VERSION,
      skills: { first: skill("first"), second: skill("second") },
    } satisfies Lockfile;
    const stored = encode(view);
    expect(Object.keys(stored.packages)).toHaveLength(1);
    expect(stored.skills["first"]?.package).toBe(stored.skills["second"]?.package);
    expect(stored.skills["first"]).not.toHaveProperty("resolved");
    expect(stored.skills["first"]).not.toHaveProperty("source");
    expect(stored.skills["first"]).not.toHaveProperty("treeIntegrity");
    expect(decode(stored, { onExcessProperty: "error" })).toEqual(view);
  });

  it("keeps package keys stable across updates but refuses conflicting shared snapshots", () => {
    const original = encode({
      lockfileVersion: LOCKFILE_VERSION,
      skills: { first: skill("first") },
    });
    const updated = encode({
      lockfileVersion: LOCKFILE_VERSION,
      skills: { first: skill("first", "next-commit") },
    });
    expect(Object.keys(updated.packages)).toEqual(Object.keys(original.packages));
    expect(() =>
      encode({
        lockfileVersion: LOCKFILE_VERSION,
        skills: { first: skill("first"), second: skill("second", "next-commit") },
      }),
    ).toThrow("conflicting accepted snapshots");
  });

  it("rejects missing packages, forged keys, and mismatched component boundaries", () => {
    const stored = encode({ lockfileVersion: LOCKFILE_VERSION, skills: { first: skill("first") } });
    const first = stored.skills["first"];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(() => decode({ ...stored, packages: {} })).toThrow("absent retained package");
    expect(() =>
      decode({
        ...stored,
        packages: { forged: stored.packages[first.package] },
        skills: { first: { ...first, package: "forged" } },
      }),
    ).toThrow("key does not match");
    expect(() =>
      decode({
        ...stored,
        skills: {
          first: { ...first, component: { ...first.component, packageRoot: "another-package" } },
        },
      }),
    ).toThrow("package root does not match");
  });

  it("refuses older locks instead of inventing package acceptance", () => {
    expect(() => decode({ lockfileVersion: 10, skills: {} })).toThrow();
    expect(() => decode({ lockfileVersion: LOCKFILE_VERSION, skills: {} })).toThrow();
    expect(decode({ lockfileVersion: LOCKFILE_VERSION, packages: {}, skills: {} })).toEqual({
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
    });
  });
});
