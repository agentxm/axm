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
    expect(stored.package).toHaveLength(1);
    expect(stored.package?.[0]?.id).toBe("github.com/acme/plugins/plugins/review");
    expect(stored.skills?.["first"]?.package).toBe(stored.skills?.["second"]?.package);
    expect(stored.skills?.["first"]).toEqual({
      package: "github.com/acme/plugins/plugins/review",
      name: "first",
      spec: "main",
      component: {
        format: "claude",
        root: "plugins/review",
        path: "skills/first",
        manifest: ".claude-plugin/plugin.json",
      },
    });
    expect(decode(stored, { onExcessProperty: "error" })).toEqual(view);
  });

  it("keeps package ids stable across updates but refuses conflicting shared snapshots", () => {
    const original = encode({
      lockfileVersion: LOCKFILE_VERSION,
      skills: { first: skill("first") },
    });
    const updated = encode({
      lockfileVersion: LOCKFILE_VERSION,
      skills: { first: skill("first", "next-commit") },
    });
    expect(updated.package?.map((record) => record.id)).toEqual(
      original.package?.map((record) => record.id),
    );
    expect(() =>
      encode({
        lockfileVersion: LOCKFILE_VERSION,
        skills: { first: skill("first"), second: skill("second", "next-commit") },
      }),
    ).toThrow("conflicting accepted snapshots");
  });

  it("rejects missing packages, forged ids, and mismatched component boundaries", () => {
    const stored = encode({ lockfileVersion: LOCKFILE_VERSION, skills: { first: skill("first") } });
    const first = stored.skills?.["first"];
    const record = stored.package?.[0];
    expect(first).toBeDefined();
    expect(record).toBeDefined();
    if (first === undefined || record === undefined) return;
    expect(() => decode({ ...stored, package: [] })).toThrow("absent retained package");
    expect(() =>
      decode({
        ...stored,
        package: [{ ...record, id: "github.com/acme/forged" }],
        skills: { first: { ...first, package: "github.com/acme/forged" } },
      }),
    ).toThrow("does not match its source address");
    expect(() =>
      decode({
        ...stored,
        skills: {
          first: { ...first, component: { ...first.component, root: "another-package" } },
        },
      }),
    ).toThrow("package root does not match");
    expect(() =>
      decode({ ...stored, skills: { first: { ...first, name: "@acme/rules/first" } } }),
    ).toThrow("does not name one of the skills");
  });

  it("refuses unbound packages and other lockfile versions instead of inventing acceptance", () => {
    const stored = encode({ lockfileVersion: LOCKFILE_VERSION, skills: { first: skill("first") } });
    expect(() => decode({ ...stored, skills: {} })).toThrow("unbound retained package");
    expect(() => decode({ version: 12, skills: {} })).toThrow();
    expect(decode({ version: LOCKFILE_VERSION })).toEqual({
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
    });
  });
});
