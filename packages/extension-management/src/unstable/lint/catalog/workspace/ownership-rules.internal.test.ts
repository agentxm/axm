import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { emptyWorkspaceState } from "../workspace-fixtures/interpret-ops.js";
import { scopeFilesFromWorkspaceState } from "../workspace-fixtures/fixture-state.js";
import { hookOwnershipAmbiguousRule } from "./hook-ownership-ambiguous.js";
import { managedFileUnownedRule } from "./managed-file-unowned.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../__fixtures__/workspace",
);

const contextFor = (
  root: string,
  issue: {
    readonly kind: "hook-ownership-ambiguous" | "managed-file-unowned";
    readonly path: string;
    readonly detail: string;
  },
): Effect.Effect<WorkspaceRuleContext> => {
  const project = scopeFilesFromWorkspaceState(emptyWorkspaceState());
  return Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root, scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      ownership: Effect.succeed([issue]),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: root,
        userHome: path.join(root, ".home"),
        project,
      }),
    ),
    Effect.orDie,
  );
};

describe("workspace ownership rules", () => {
  it.effect("reports an unmarked hook command that targets the extension store", () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, "hook-ownership-ambiguous");
      const config = path.join(root, ".claude", "settings.json");
      expect(fs.readFileSync(config, "utf8")).toContain("agent_extensions/");
      const context = yield* contextFor(root, {
        kind: "hook-ownership-ambiguous",
        path: config,
        detail: "Hook command targets agent_extensions/ without x-axm ownership metadata.",
      });
      const findings = yield* hookOwnershipAmbiguousRule.check(context);
      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/hook-ownership-ambiguous",
          severity: "warning",
          message: "Hook command targets agent_extensions/ without x-axm ownership metadata.",
          location: { file: ".claude/settings.json" },
        },
      ]);
    }),
  );

  it.effect("reports an agent-directory artifact without an ownership proof", () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, "managed-file-unowned");
      const artifact = path.join(root, ".claude", "agents", "manual.md");
      expect(fs.readFileSync(artifact, "utf8")).not.toContain("axm:file");
      const context = yield* contextFor(root, {
        kind: "managed-file-unowned",
        path: artifact,
        detail: "Agent subagent artifact has no structured file ownership proof.",
      });
      const findings = yield* managedFileUnownedRule.check(context);
      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/managed-file-unowned",
          severity: "warning",
          message: "Agent subagent artifact has no structured file ownership proof.",
          location: { file: ".claude/agents/manual.md" },
        },
      ]);
    }),
  );
});
