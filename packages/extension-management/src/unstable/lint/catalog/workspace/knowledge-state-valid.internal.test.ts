import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { knowledgeStateValidRule } from "./knowledge-state-valid.js";

const makeContext = (accepted: boolean) =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      workspace,
      subject: { root: "/workspace", scope: "project" },
      axmDirExists: Effect.succeed(true),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/workspace",
        userHome: "/user",
        project: {
          axmExtensions: {
            "agentxm/@acme/knowledge/handbook/knowledge.json": JSON.stringify({
              owner: "@acme",
              type: "knowledge",
              name: "handbook",
              version: "1.0.0",
              format: { name: "okf", version: "0.2" },
              bundleRoot: "src",
            }),
            "agentxm/@acme/knowledge/handbook/src/index.md": "# Handbook\n",
          },
          ...(accepted
            ? {
                lockfile: {
                  _tag: "valid",
                  contents: {
                    lockfileVersion: 6,
                    skills: {},
                    knowledge: {
                      handbook: {
                        type: "local",
                        sourceType: "local",
                        sourceName: "local",
                        extensionType: "knowledge",
                        workspaceName: "handbook",
                        packageFormat: "agentxm",
                        packageOwner: "@acme",
                        packageName: "handbook",
                        path: "knowledge-source",
                        contentIdentity: "accepted-content",
                        treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
                      },
                    },
                  },
                } as const,
              }
            : {}),
        },
      }),
    ),
    Effect.orDie,
  );

describe("workspace/knowledge-state-valid", () => {
  it.effect("reports canonical Knowledge without accepted AXM ownership", () =>
    Effect.gen(function* () {
      const context = yield* makeContext(false);
      const findings = yield* knowledgeStateValidRule.check(context);

      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/knowledge-state-valid",
          severity: "error",
          message:
            "Knowledge bundle 'handbook' has canonical content without an accepted AXM ownership fact.",
          location: { file: "agent_extensions" },
        },
      ]);
    }),
  );

  it.effect("does not report canonical Knowledge with an accepted lock fact", () =>
    Effect.gen(function* () {
      const context = yield* makeContext(true);
      const findings = yield* knowledgeStateValidRule.check(context);

      expect(findings).toEqual([]);
    }),
  );
});
