import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import { TreeIntegritySchema } from "../extensions/materialized-tree.js";
import { LockfileSchema, SubagentLockEntrySchema } from "./schema.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

const localEntry = {
  type: "local",
  packageOwner: "@acme",
  packageName: "planner",
  path: "../subagents/planner",
  contentIdentity,
  treeIntegrity,
} as const;

describe("Subagent accepted resolutions", () => {
  it("requires immutable identity for local and Git sources", () => {
    expect(Schema.decodeUnknownSync(SubagentLockEntrySchema)(localEntry)).toEqual(localEntry);
    expect(
      Schema.decodeUnknownSync(SubagentLockEntrySchema)({
        type: "github",
        packageOwner: "@acme",
        packageName: "planner",
        owner: "acme",
        repo: "subagents",
        path: "planner",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
        treeIntegrity,
      }),
    ).toMatchObject({ resolvedCommit: "commit-1", resolvedTree: "tree-1" });
  });

  it("rejects agent projections and receipt history", () => {
    expect(() =>
      Schema.decodeUnknownSync(SubagentLockEntrySchema)(
        {
          type: "local",
          path: "../subagents/planner",
          contentIdentity,
          agents: ["claude-code"],
          installedAt: "2026-08-14T00:00:00Z",
        },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("decodes a current lockfile with Subagent external resolution state", () => {
    expect(
      Schema.decodeUnknownSync(LockfileSchema)({
        lockfileVersion: 5,
        skills: {},
        subagents: {
          planner: localEntry,
        },
      }).subagents?.["planner"],
    ).toEqual(localEntry);
  });
});
