import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { WorkspaceRuleContext } from "../../context.js";
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
            "@acme/knowledge/handbook/src/index.md": "# Handbook\n",
          },
          ...(accepted
            ? {
                lockfile: {
                  _tag: "valid",
                  contents: {
                    lockfileVersion: 4,
                    skills: {},
                    knowledge: {
                      handbook: {
                        type: "local",
                        path: "knowledge-source",
                        contentIdentity: "accepted-content",
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
          location: { file: ".axm/extensions" },
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
