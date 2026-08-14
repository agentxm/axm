import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import { LockfileSchema, SubagentLockEntrySchema } from "./schema.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");

describe("Subagent accepted resolutions", () => {
  it("requires immutable identity for local and Git sources", () => {
    expect(
      Schema.decodeUnknownSync(SubagentLockEntrySchema)({
        type: "local",
        path: "../subagents/planner",
        contentIdentity,
      }),
    ).toEqual({ type: "local", path: "../subagents/planner", contentIdentity });
    expect(
      Schema.decodeUnknownSync(SubagentLockEntrySchema)({
        type: "github",
        owner: "acme",
        repo: "subagents",
        path: "planner",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
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
        lockfileVersion: 4,
        skills: {},
        subagents: {
          planner: { type: "local", path: "../subagents/planner", contentIdentity },
        },
      }).subagents?.["planner"],
    ).toEqual({ type: "local", path: "../subagents/planner", contentIdentity });
  });
});
