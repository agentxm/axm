import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  buildPackRuleContexts,
  buildSkillRuleContexts,
  evaluateContexts,
} from "@agentxm/extension-content/lint";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  buildLintWorkspace,
  type BuildLintWorkspaceArgs,
} from "../catalog/workspace-read-model/lint-workspace.js";
import { evaluateAllCatalogs, summarizeEvaluations, toLintJsonFinding } from "../runner.js";
import type { WorkspaceRuleContext } from "../workspace-context.js";
import { lintConfigFromSettings } from "./settings.js";
import { mcpServerNoSecretLiteralRule } from "../catalog/workspace/mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "../catalog/workspace/mcps-transport-exclusivity.js";
import { packsSharedMembersDistributableRule } from "../catalog/workspace/packs-shared-members-distributable.js";

/**
 * Package and inline configuration rules for a resolved contributor closure.
 * This result does not claim that unrelated workspace subjects were linted or
 * that missing content was inspected.
 */
export const lintSelectedSubjects = Effect.fn("LintSelectedSubjects")(function* (
  args: BuildLintWorkspaceArgs & {
    readonly subjects: ReadonlyArray<{ readonly type: ExtensionType; readonly name: string }>;
  },
) {
  const selected = new Set(args.subjects.map(({ type, name }) => `${type}:${name}`));
  const selectsSubject = (type: ExtensionType, name: string) => selected.has(`${type}:${name}`);
  const { rule, view, observedPackages } = yield* buildLintWorkspace({
    ...args,
    selectsPackage: selectsSubject,
  });
  const config = lintConfigFromSettings(yield* rule.workspace.state.settings);
  const evaluations = yield* evaluateAllCatalogs({
    view: "filesystem",
    config,
    contexts: {
      skill: buildSkillRuleContexts(view),
      pack: buildPackRuleContexts(view),
      subagent: view.subagentContexts,
      "mcp-server": view.mcpServerContexts,
      hook: view.hookContexts,
      rule: view.ruleContexts,
      knowledge: view.knowledgeContexts,
      workspace: [],
    },
  });
  const selectedMcps = args.subjects.some(({ type }) => type === "mcp-server");
  const selectedContext: WorkspaceRuleContext = {
    ...rule,
    selectsSubject,
    ...(args.desiredState === undefined
      ? {}
      : { health: { desiredState: Effect.succeed(args.desiredState) } }),
  };
  const workspace = yield* evaluateContexts(
    [
      ...(selectedMcps ? [mcpServerTransportExclusivityRule, mcpServerNoSecretLiteralRule] : []),
      ...(args.subjects.some(({ type }) => type === "pack")
        ? [packsSharedMembersDistributableRule]
        : []),
    ],
    [selectedContext],
    config,
  );
  const rawSettings = selectedMcps
    ? yield* Effect.result(rule.workspace.state.raw("settings"))
    : undefined;
  const inlineSubjects =
    rawSettings !== undefined && Result.isSuccess(rawSettings) && Option.isSome(rawSettings.success)
      ? (args.desiredState?.nodes ?? [])
          .filter((node) => node.authority === "inline" && selectsSubject(node.type, node.name))
          .map(({ type, name }) => ({ type, name }))
      : [];
  const summary = summarizeEvaluations({ ...evaluations, workspace }, config);
  return {
    findings: summary.findings.map(toLintJsonFinding),
    summary,
    observedPackages,
    inlineSubjects,
  };
});
