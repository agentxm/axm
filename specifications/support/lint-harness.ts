/**
 * Lint-specification workspace harness.
 *
 * Extends the shared install workspace with the skill-compatibility policy
 * service the lint runner consumes, so lint specifications can drive the real
 * lint entry against the same temporary workspace the install entries mutate.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import {
  allCatalogRuleIds,
  handleInstall,
  handleLint,
  handleSkillsInstall,
  LintResultDocumentSchema,
  loadVersion,
  makeEffectProvide,
  makeAxmSkillCompatibilityPolicyLayer,
} from "axm.sh/specification-harness";

import {
  makeSpecWorkspace,
  type SpecWorkspaceOptions,
  writeLocalSkillPackage,
} from "./install-harness.js";

/** Installs the bundled official AXM skill for scenarios that declare it. */
export const installBundledAxmSkill = handleSkillsInstall(
  { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
  { yes: true, force: false, preview: false },
);

export const makeLintSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const workspace = makeSpecWorkspace(options);
  const layer = Layer.merge(workspace.layer, makeAxmSkillCompatibilityPolicyLayer(loadVersion()));
  return {
    ...workspace,
    layer,
    provide: makeEffectProvide(layer),
  };
};

export type ConfiguredLintSeverity = "off" | "info" | "warn" | "error";

/** Configure only one catalog rule so unrelated findings cannot decide the scenario. */
export const makeIsolatedLintRules = (
  ruleId: string,
  severity: ConfiguredLintSeverity | undefined,
): Record<string, ConfiguredLintSeverity> => {
  if (!allCatalogRuleIds.includes(ruleId)) {
    throw new Error(`Unknown lint rule '${ruleId}'`);
  }
  const rules: Record<string, ConfiguredLintSeverity> = {};
  for (const id of allCatalogRuleIds) {
    if (id !== ruleId) rules[id] = "off";
  }
  if (severity !== undefined) rules[ruleId] = severity;
  return rules;
};

type LintSpecWorkspace = ReturnType<typeof makeLintSpecWorkspace>;

/** Create one deterministic missing-agent-projection violation. */
export const installSkillWithMissingProjection = (
  workspace: LintSpecWorkspace,
  name = "code-review",
) =>
  Effect.gen(function* () {
    yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
    const skillPackage = writeLocalSkillPackage(workspace.root, { name });
    yield* handleInstall({
      source: Option.some(skillPackage),
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    fs.rmSync(path.join(workspace.root, ".claude", "skills", name), { recursive: true });
  });

const decodeLintResult = Schema.decodeUnknownEffect(LintResultDocumentSchema);

/** Run the real project-scope lint handler and decode its captured machine result. */
export const runProjectLint = (workspace: LintSpecWorkspace, strict: boolean) =>
  Effect.gen(function* () {
    const exit = yield* handleLint({
      pathArg: Option.some(workspace.root),
      scope: "project",
      strict,
      details: false,
      fix: false,
      input: { view: "workspace" },
    }).pipe(Effect.provide(workspace.layer), Effect.exit);
    const entry = workspace.rendererState.results.at(-1);
    const document = yield* decodeLintResult(entry?.data);
    return { exit, ok: entry?.ok, result: document.result };
  });
