import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { storedLockfileFixture } from "../../observed/__fixtures__/decoders.js";
import { TreeIntegritySchema } from "../../workspace/materialized-tree.js";
import { LockfileSchema, SubagentLockEntrySchema } from "./schema.js";

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);

const localEntry = {
  source: { type: "path", path: "/sources/subagents/planner" },
  identity: { owner: "@acme", name: "planner" },
  resolved: { tree: treeIntegrity },
  treeIntegrity,
} as const;

describe("Subagent accepted resolutions", () => {
  it("requires immutable identity for local and Git sources", () => {
    expect(Schema.decodeUnknownSync(SubagentLockEntrySchema)(localEntry)).toEqual(localEntry);
    expect(
      Schema.decodeUnknownSync(SubagentLockEntrySchema)({
        source: {
          type: "git",
          url: "https://github.com/acme/subagents.git",
          path: "planner",
        },
        identity: { owner: "@acme", name: "planner" },
        resolved: {
          commit: "705f74ba5bd5309ca9e6a3de50df9ea722fb280c",
          tree: "ed6943172cbca1a76031511bef0b5d3c6ba9bdca",
        },
        treeIntegrity,
      }),
    ).toMatchObject({
      resolved: {
        commit: "705f74ba5bd5309ca9e6a3de50df9ea722fb280c",
        tree: "ed6943172cbca1a76031511bef0b5d3c6ba9bdca",
      },
    });
  });

  it("rejects agent projections and receipt history", () => {
    expect(() =>
      Schema.decodeUnknownSync(SubagentLockEntrySchema)(
        {
          ...localEntry,
          agents: ["claude-code"],
          installedAt: "2026-08-14T00:00:00Z",
        },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("decodes a current lockfile with Subagent external resolution state", () => {
    expect(
      Schema.decodeUnknownSync(LockfileSchema)(
        storedLockfileFixture({
          lockfileVersion: 1,
          skills: {},
          subagents: {
            planner: localEntry,
          },
        }),
      ).subagents?.["planner"],
    ).toEqual(localEntry);
  });
});
