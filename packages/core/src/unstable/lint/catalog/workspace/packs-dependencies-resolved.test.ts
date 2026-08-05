import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { LockfileSchema } from "../../../lockfile/schema.js";
import { buildInstalledFqnIndex } from "./packs-dependencies-resolved.js";

const timestamp = "2026-07-10T00:00:00.000Z";

describe("buildInstalledFqnIndex", () => {
  it("indexes workspace-sourced pack members as installed dependencies", () => {
    const lockfile = Schema.decodeUnknownSync(LockfileSchema)({
      lockfileVersion: 3,
      skills: {
        review: {
          type: "workspace",
          owner: "@acme",
          extensionType: "skill",
          name: "review",
          version: "1.0.0",
          sourceHash: "hash",
          agents: [],
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
      subagents: {
        maintainer: {
          type: "workspace",
          owner: "@acme",
          extensionType: "subagent",
          name: "maintainer",
          version: "1.0.0",
          sourceHash: "hash",
          agents: [],
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
    });

    expect([...buildInstalledFqnIndex(lockfile)].sort()).toEqual([
      "@acme/skills/review",
      "@acme/subagents/maintainer",
    ]);
  });

  it("indexes the families the walk used to skip", () => {
    const lockfile = Schema.decodeUnknownSync(LockfileSchema)({
      lockfileVersion: 3,
      skills: {},
      files: {
        "house-style": {
          type: "workspace",
          owner: "@acme",
          extensionType: "files",
          name: "house-style",
          version: "1.0.0",
          sourceHash: "hash",
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
      rules: {
        conventions: {
          type: "workspace",
          owner: "@acme",
          extensionType: "rule",
          name: "conventions",
          version: "1.0.0",
          sourceHash: "hash",
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
      hooks: {
        "pre-commit": {
          type: "workspace",
          owner: "@acme",
          extensionType: "hook",
          name: "pre-commit",
          version: "1.0.0",
          sourceHash: "hash",
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
      knowledge: {
        domain: {
          type: "workspace",
          owner: "@acme",
          extensionType: "knowledge",
          name: "domain",
          version: "1.0.0",
          sourceHash: "hash",
          installedAt: timestamp,
          updatedAt: timestamp,
        },
      },
    });

    expect([...buildInstalledFqnIndex(lockfile)].sort()).toEqual([
      "@acme/files/house-style",
      "@acme/hooks/pre-commit",
      "@acme/knowledge/domain",
      "@acme/rules/conventions",
    ]);
  });
});
