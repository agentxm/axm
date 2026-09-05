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
import YAML from "yaml";

import {
  allCatalogRuleIds,
  computeMaterializedTreeIntegritySync,
  handleInstall,
  handleLint,
  handleSkillsInstall,
  LintResultDocumentSchema,
  LOCKFILE_VERSION,
  loadVersion,
  makeEffectProvide,
  makeAxmSkillCompatibilityPolicyLayer,
} from "axm.sh/specification-harness";

import {
  makeSpecWorkspace,
  type SpecWorkspaceOptions,
  writeLocalSkillPackage,
} from "./install-harness.js";
import { writeAuthoredSkill } from "./publish-harness.js";

/** Installs the bundled official AXM skill for scenarios that declare it. */
export const installBundledAxmSkill = handleSkillsInstall(
  { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
  { force: false, preview: false },
);

export const makeLintSpecWorkspace = (
  options: SpecWorkspaceOptions = {},
  cliVersion = loadVersion(),
) => {
  const workspace = makeSpecWorkspace(options);
  const layer = Layer.merge(workspace.layer, makeAxmSkillCompatibilityPolicyLayer(cliVersion));
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
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    fs.rmSync(path.join(workspace.root, ".claude", "skills", name), { recursive: true });
  });

/**
 * The official AXM skill states lint distinguishes: not declared at all,
 * declared by another owner under the official name, or declared as the
 * official skill and then missing, registry-sourced at an incompatible
 * release, version-skewed, workspace-authored, compatible, or unreadable.
 */
export type OfficialSkillWorkspaceState =
  | "undeclared"
  | "non-official"
  | "official-missing"
  | "official-registry"
  | "official-skewed"
  | "official-authored"
  | "official-compatible"
  | "official-compatible-prerelease"
  | "official-unreadable";

const officialSkillRuleIds = new Set([
  "workspace/axm-skill-declared",
  "workspace/axm-skill-compatible",
]);

/** Configure every rule except the two official-skill rules off. */
const isolateOfficialSkillRules = (): Record<string, "off"> =>
  Object.fromEntries(
    allCatalogRuleIds.flatMap((ruleId) =>
      officialSkillRuleIds.has(ruleId) ? [] : [[ruleId, "off" as const]],
    ),
  );

const officialSkillSettings = (state: OfficialSkillWorkspaceState) => {
  switch (state) {
    case "official-missing":
    case "official-registry":
      return { skills: { axm: "agentxm:@agentxm/skills/axm" } };
    case "official-authored":
      return { skills: { axm: "workspace" } };
    case "undeclared":
    case "non-official":
    case "official-skewed":
    case "official-compatible":
    case "official-compatible-prerelease":
    case "official-unreadable":
      return {};
  }
};

const writeRegistryOfficialSkill = (workspaceRoot: string): void => {
  const packageRoot = path.join(
    workspaceRoot,
    "agent_extensions",
    "agentxm",
    "@agentxm",
    "skills",
    "axm",
  );
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "0.0.1" })}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: axm\ndescription: Registry official skill.\nmetadata:\n  axm.sh/cli-version: "0.0.1"\n  axm.sh/cli-version-range: "0.0.1"\n---\n\n# AXM\n`,
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: LOCKFILE_VERSION,
      skills: {
        axm: {
          type: "registry",
          sourceType: "registry",
          endpoint: "https://registry.agentxm.ai/",
          extensionType: "skill",
          workspaceName: "axm",
          packageFormat: "agentxm",
          owner: "@agentxm",
          name: "axm",
          resolvedVersion: "0.0.1",
          integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
          sourceName: "agentxm",
          publisherBindingId: "hbnd_agentxm",
          treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
        },
      },
    }),
  );
};

const skewBundledOfficialSkill = (officialSkillRoot: string) =>
  Effect.gen(function* () {
    const manifestPath = path.join(officialSkillRoot, "skill.json");
    const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
      return yield* Effect.die("Expected the bundled AXM skill manifest to be an object");
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: "0.0.1" })}\n`);
  });

const rewriteBundledOfficialSkillRelease = (officialSkillRoot: string, version: string): void => {
  const manifestPath = path.join(officialSkillRoot, "skill.json");
  const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error("Expected the bundled AXM skill manifest to be an object");
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version })}\n`);

  const skillPath = path.join(officialSkillRoot, "src", "SKILL.md");
  const skill = fs.readFileSync(skillPath, "utf8");
  fs.writeFileSync(
    skillPath,
    skill.replace(/axm\.sh\/cli-version: "[^"]+"/u, `axm.sh/cli-version: "${version}"`),
  );
};

/**
 * Create a machine-mode lint workspace with only the official-skill rules
 * enabled and its official AXM skill arranged in the named state.
 */
export const makeOfficialSkillWorkspace = (state: OfficialSkillWorkspaceState) =>
  Effect.gen(function* () {
    const cliVersion =
      state === "official-compatible-prerelease" ? "0.28.7-preview.1" : loadVersion();
    const workspace = makeLintSpecWorkspace(
      {
        machine: true,
        flags: { json: true },
        settings: { lint: { rules: isolateOfficialSkillRules() }, ...officialSkillSettings(state) },
      },
      cliVersion,
    );
    const officialSkillRoot = path.join(
      workspace.root,
      "agent_extensions",
      "agentxm",
      "@agentxm",
      "skills",
      "axm",
    );

    switch (state) {
      case "non-official": {
        const skillPackage = writeLocalSkillPackage(workspace.root, {
          name: "axm",
          owner: "@acme",
        });
        yield* handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        break;
      }
      case "official-compatible":
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        break;
      case "official-compatible-prerelease":
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        rewriteBundledOfficialSkillRelease(officialSkillRoot, cliVersion);
        break;
      case "official-skewed":
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        yield* skewBundledOfficialSkill(officialSkillRoot);
        break;
      case "official-unreadable":
        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
        fs.rmSync(path.join(officialSkillRoot, "src", "SKILL.md"));
        break;
      case "official-authored":
        writeAuthoredSkill(workspace.root, { name: "axm", version: "0.0.1" });
        break;
      case "official-registry":
        writeRegistryOfficialSkill(workspace.root);
        break;
      case "undeclared":
      case "official-missing":
        break;
    }

    return workspace;
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
