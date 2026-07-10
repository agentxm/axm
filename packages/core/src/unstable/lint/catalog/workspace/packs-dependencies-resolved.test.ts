import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { LockfileSchema } from "../../../lockfile/schema.js";
import { buildInstalledFqnIndex } from "./packs-dependencies-resolved.js";

const timestamp = "2026-07-10T00:00:00.000Z";

describe("buildInstalledFqnIndex", () => {
  it("indexes workspace-sourced pack members as installed dependencies", () => {
    const lockfile = Schema.decodeUnknownSync(LockfileSchema)({
      lockfileVersion: 2,
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
});
