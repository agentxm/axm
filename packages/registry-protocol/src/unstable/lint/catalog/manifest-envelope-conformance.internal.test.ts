/**
 * Cross-catalog conformance for the shared manifest envelope.
 *
 * The shared rule factories own predicate logic, while this suite proves that
 * every catalog wires the factory to its real manifest field, filename, rule
 * identity, and default severity. Each case executes one satisfied context,
 * one violated context, and (where meaningful) an unmet-prerequisite context.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type {
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  RuleRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
} from "../context.js";
import type { LintRule } from "../rule.js";
import { hookRules } from "./hook.js";
import { knowledgeRules } from "./knowledge.js";
import { mcpServerRules } from "./mcp-server.js";
import { packRules } from "./pack.js";
import { ruleRules } from "./rule.js";
import { skillRules } from "./skill.js";
import { subagentRules } from "./subagent.js";

interface RuleConformanceCase<C> {
  readonly ruleId: string;
  readonly satisfied: C;
  readonly violated: C;
  readonly location: string;
  readonly inapplicable?: C;
}

const registeredConformanceRuleIds: string[] = [];

const findRule = <C>(rules: ReadonlyArray<LintRule<C>>, ruleId: string): LintRule<C> => {
  const rule = rules.find(({ id }) => id === ruleId);
  if (rule === undefined) throw new Error(`Missing conformance rule '${ruleId}'`);
  return rule;
};

const registerConformance = <C>(
  label: string,
  rules: ReadonlyArray<LintRule<C>>,
  cases: ReadonlyArray<RuleConformanceCase<C>>,
): void => {
  registeredConformanceRuleIds.push(...cases.map(({ ruleId }) => ruleId));
  describe(`${label} rule conformance`, () => {
    it("registers exactly one case per selected catalog rule", () => {
      const ruleIds = rules.map(({ id }) => id);
      const caseIds = cases.map(({ ruleId }) => ruleId);
      expect(caseIds).toEqual(ruleIds);
      expect(new Set(caseIds).size).toBe(caseIds.length);
    });

    for (const testCase of cases) {
      it.effect(`${testCase.ruleId} has satisfied and violated evidence`, () =>
        Effect.gen(function* () {
          const rule = findRule(rules, testCase.ruleId);
          expect(yield* rule.check(testCase.satisfied)).toEqual([]);

          const findings = yield* rule.check(testCase.violated);
          expect(findings.length).toBeGreaterThan(0);
          for (const finding of findings) {
            expect(finding.ruleId).toBe(rule.id);
            expect(finding.kind).toBe(rule.kind);
            expect(finding.severity).toBe(rule.severity);
            expect(finding.message.length).toBeGreaterThan(0);
            expect(finding.location?.file).toBe(testCase.location);
          }

          if (testCase.inapplicable !== undefined) {
            expect(yield* rule.check(testCase.inapplicable)).toEqual([]);
          }
        }),
      );
    }
  });
};

const makeFiles = (paths: ReadonlyArray<string>) => {
  const present = new Set(paths);
  return {
    exists: (path: string) => Effect.succeed(present.has(path)),
    readBytes: (path: string) =>
      present.has(path)
        ? Effect.succeed(new TextEncoder().encode(path))
        : Effect.fail({
            _tag: "FileAccessError" as const,
            path,
            reason: "read-error" as const,
            message: "Absent test file",
          }),
  };
};

const makeContentFiles = (entries: Readonly<Record<string, string>>) => ({
  exists: (path: string) => Effect.succeed(entries[path] !== undefined),
  readBytes: (path: string) => {
    const content = entries[path];
    return content === undefined
      ? Effect.fail({
          _tag: "FileAccessError" as const,
          path,
          reason: "read-error" as const,
          message: "Absent test file",
        })
      : Effect.succeed(new TextEncoder().encode(content));
  },
});

interface EnvelopeArgs<C> {
  readonly namespace: string;
  readonly manifestFile: string;
  readonly validManifest: Readonly<Record<string, unknown>>;
  readonly makeContext: (manifest: unknown, files: ReadonlyArray<string>) => C;
}

const envelopeCases = <C>(args: EnvelopeArgs<C>): ReadonlyArray<RuleConformanceCase<C>> => {
  const context = (manifest: unknown, files = [args.manifestFile]): C =>
    args.makeContext(manifest, files);
  const inapplicable = context(undefined, []);
  return [
    {
      ruleId: `${args.namespace}/manifest-present`,
      satisfied: context(args.validManifest),
      violated: inapplicable,
      location: args.manifestFile,
    },
    {
      ruleId: `${args.namespace}/manifest-schema-valid`,
      satisfied: context(args.validManifest),
      violated: context({}),
      inapplicable,
      location: args.manifestFile,
    },
    {
      ruleId: `${args.namespace}/manifest-keys-recognized`,
      satisfied: context(args.validManifest),
      violated: context({ ...args.validManifest, unexpected: true }),
      inapplicable,
      location: args.manifestFile,
    },
    {
      ruleId: `${args.namespace}/standalone-declaration-valid`,
      satisfied: context(args.validManifest),
      violated: context({ ...args.validManifest, standalone: false }),
      inapplicable,
      location: args.manifestFile,
    },
    {
      ruleId: `${args.namespace}/recommended-packs-valid`,
      satisfied: context(args.validManifest),
      violated: context({
        ...args.validManifest,
        recommendedPacks: ["@acme/packs/base@^1.0.0"],
      }),
      inapplicable,
      location: args.manifestFile,
    },
  ];
};

const orderedEnvelopeRules = <C>(rules: ReadonlyArray<LintRule<C>>) => {
  const suffixes = [
    "manifest-present",
    "manifest-schema-valid",
    "manifest-keys-recognized",
    "standalone-declaration-valid",
    "recommended-packs-valid",
  ];
  return suffixes.map((suffix) => findRule(rules, `${rules[0]?.id.split("/")[0]}/${suffix}`));
};

const validSkillManifest = {
  owner: "@acme",
  type: "skill",
  name: "example",
  version: "1.0.0",
  description: "Example skill",
};
const validSkillMarkdown = "---\nname: example\ndescription: Example skill\n---\n\n# Example\n";
const makeSkillContext = (args: {
  readonly skillJson?: unknown;
  readonly skillMarkdown?: string;
  readonly manifestPresent?: boolean;
}): SkillRuleContext => ({
  subject: {
    isNative: true,
    skillJson: Object.hasOwn(args, "skillJson") ? args.skillJson : validSkillManifest,
    expectedName: "example",
  },
  files: makeContentFiles(
    args.skillMarkdown === undefined ? {} : { "SKILL.md": args.skillMarkdown },
  ),
  packageFiles: makeFiles(args.manifestPresent === false ? [] : ["skill.json"]),
  displayRoot: "",
});

const validSkillContext = makeSkillContext({ skillMarkdown: validSkillMarkdown });
const missingSkillManifestContext = makeSkillContext({
  skillJson: undefined,
  skillMarkdown: validSkillMarkdown,
  manifestPresent: false,
});
registerConformance("skill", skillRules, [
  {
    ruleId: "skill/skill-md-present",
    satisfied: validSkillContext,
    violated: makeSkillContext({}),
    location: "SKILL.md",
  },
  {
    ruleId: "skill/manifest-present",
    satisfied: validSkillContext,
    violated: missingSkillManifestContext,
    location: "skill.json",
  },
  {
    ruleId: "skill/frontmatter-parseable",
    satisfied: validSkillContext,
    violated: makeSkillContext({ skillMarkdown: "# Missing frontmatter\n" }),
    inapplicable: makeSkillContext({}),
    location: "SKILL.md",
  },
  {
    ruleId: "skill/frontmatter-standard-valid",
    satisfied: validSkillContext,
    violated: makeSkillContext({
      skillMarkdown: "---\ndescription: Missing name\n---\n\n# Example\n",
    }),
    inapplicable: makeSkillContext({ skillMarkdown: "not frontmatter" }),
    location: "SKILL.md",
  },
  {
    ruleId: "skill/manifest-schema-valid",
    satisfied: validSkillContext,
    violated: makeSkillContext({ skillJson: {}, skillMarkdown: validSkillMarkdown }),
    inapplicable: missingSkillManifestContext,
    location: "skill.json",
  },
  {
    ruleId: "skill/manifest-keys-recognized",
    satisfied: validSkillContext,
    violated: makeSkillContext({
      skillJson: { ...validSkillManifest, unexpected: true },
      skillMarkdown: validSkillMarkdown,
    }),
    inapplicable: missingSkillManifestContext,
    location: "skill.json",
  },
  {
    ruleId: "skill/standalone-declaration-valid",
    satisfied: validSkillContext,
    violated: makeSkillContext({
      skillJson: { ...validSkillManifest, standalone: false },
      skillMarkdown: validSkillMarkdown,
    }),
    inapplicable: missingSkillManifestContext,
    location: "skill.json",
  },
  {
    ruleId: "skill/recommended-packs-valid",
    satisfied: validSkillContext,
    violated: makeSkillContext({
      skillJson: {
        ...validSkillManifest,
        recommendedPacks: ["@acme/packs/base@^1.0.0"],
      },
      skillMarkdown: validSkillMarkdown,
    }),
    inapplicable: missingSkillManifestContext,
    location: "skill.json",
  },
]);

const validPackManifest = {
  owner: "@acme",
  type: "pack",
  name: "base",
  version: "1.0.0",
  dependencies: {},
};
const makePackContext = (
  packJson: unknown,
  files: ReadonlyArray<string> = ["pack.json"],
): PackRuleContext => ({
  subject: { packJson },
  files: makeFiles(files),
  displayRoot: "",
});

registerConformance("pack", packRules, [
  {
    ruleId: "pack/manifest-present",
    satisfied: makePackContext(validPackManifest),
    violated: makePackContext(undefined, []),
    location: "pack.json",
  },
  {
    ruleId: "pack/manifest-schema-valid",
    satisfied: makePackContext(validPackManifest),
    violated: makePackContext({}),
    inapplicable: makePackContext(undefined, []),
    location: "pack.json",
  },
  {
    ruleId: "pack/manifest-keys-recognized",
    satisfied: makePackContext(validPackManifest),
    violated: makePackContext({ ...validPackManifest, unexpected: true }),
    inapplicable: makePackContext(undefined, []),
    location: "pack.json",
  },
]);

const subagentManifest = {
  owner: "@acme",
  type: "subagent",
  name: "reviewer",
  version: "1.0.0",
};

registerConformance(
  "subagent manifest envelope",
  subagentRules,
  envelopeCases<SubagentRuleContext>({
    namespace: "subagent",
    manifestFile: "subagent.json",
    validManifest: subagentManifest,
    makeContext: (subagentJson, files) => ({
      subject: { subagentJson },
      files: makeFiles(files),
      displayRoot: "",
    }),
  }),
);

const mcpServerManifest = {
  owner: "@acme",
  type: "mcp-server",
  name: "database",
  version: "1.0.0",
  server: {
    name: "io.github.acme/database",
    description: "Database access",
    version: "1.0.0",
  },
};

registerConformance(
  "mcp-server manifest envelope",
  mcpServerRules,
  envelopeCases<McpServerRuleContext>({
    namespace: "mcp-server",
    manifestFile: "mcp.json",
    validManifest: mcpServerManifest,
    makeContext: (mcpServerJson, files) => ({
      subject: { mcpServerJson },
      files: makeFiles(files),
      displayRoot: "",
    }),
  }),
);

const ruleManifest = {
  owner: "@acme",
  type: "rule",
  name: "review-checklist",
  version: "1.0.0",
};

registerConformance(
  "rule manifest envelope",
  ruleRules,
  envelopeCases<RuleRuleContext>({
    namespace: "rule",
    manifestFile: "rule.json",
    validManifest: ruleManifest,
    makeContext: (ruleJson, files) => ({
      subject: { ruleJson },
      files: makeFiles(files),
      displayRoot: "",
    }),
  }),
);

const hookManifest = {
  owner: "@acme",
  type: "hook",
  name: "tool-audit",
  version: "1.0.0",
  runtime: "bash",
  entrypoint: "src/hook.sh",
  bindings: [{ on: "tool.pre", requires: { decision: { kind: "observe" } } }],
};

const makeHookContext = (hookJson: unknown, files: ReadonlyArray<string>): HookRuleContext => ({
  subject: { hookJson },
  files: makeFiles(files),
  displayRoot: "",
});

const hookEnvelopeCases = envelopeCases<HookRuleContext>({
  namespace: "hook",
  manifestFile: "hook.json",
  validManifest: hookManifest,
  makeContext: makeHookContext,
});

registerConformance("hook manifest envelope", orderedEnvelopeRules(hookRules), hookEnvelopeCases);

registerConformance("hook-specific", hookRules.slice(3, 6), [
  {
    ruleId: "hook/decision-portability",
    satisfied: makeHookContext(hookManifest, ["hook.json", "src/hook.sh"]),
    violated: makeHookContext(
      {
        ...hookManifest,
        bindings: [{ on: "tool.pre", requires: { decision: { kind: "block" } } }],
      },
      ["hook.json", "src/hook.sh"],
    ),
    inapplicable: makeHookContext(undefined, []),
    location: "hook.json",
  },
  {
    ruleId: "hook/matcher-raw-portability",
    satisfied: makeHookContext(hookManifest, ["hook.json", "src/hook.sh"]),
    violated: makeHookContext(
      { ...hookManifest, bindings: [{ on: "tool.pre", matcherRaw: "Write|Edit" }] },
      ["hook.json", "src/hook.sh"],
    ),
    inapplicable: makeHookContext(undefined, []),
    location: "hook.json",
  },
  {
    ruleId: "hook/entrypoint-exists",
    satisfied: makeHookContext(hookManifest, ["hook.json", "src/hook.sh"]),
    violated: makeHookContext(hookManifest, ["hook.json"]),
    inapplicable: makeHookContext(undefined, []),
    location: "hook.json",
  },
]);

const knowledgeManifest = {
  owner: "@acme",
  type: "knowledge",
  name: "handbook",
  version: "1.0.0",
  format: { name: "okf", version: "0.2" },
  bundleRoot: "src",
};

const knowledgeEnvelopeRules = knowledgeRules.slice(0, 5);
registerConformance(
  "knowledge manifest envelope",
  knowledgeEnvelopeRules,
  envelopeCases<KnowledgeRuleContext>({
    namespace: "knowledge",
    manifestFile: "knowledge.json",
    validManifest: knowledgeManifest,
    makeContext: (knowledgeJson, files) => ({
      subject: { knowledgeJson },
      files: makeFiles(files),
      displayRoot: "",
    }),
  }),
);

const missingConformanceCases = (
  catalogRuleIds: ReadonlyArray<string>,
  caseRuleIds: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const registered = new Set(caseRuleIds);
  return catalogRuleIds.filter((ruleId) => !registered.has(ruleId));
};

describe("manifest catalog conformance completeness", () => {
  const catalogRuleIds = [
    ...skillRules,
    ...packRules,
    ...subagentRules,
    ...mcpServerRules,
    ...hookRules,
    ...ruleRules,
    ...knowledgeEnvelopeRules,
  ].map(({ id }) => id);

  it("covers every non-diagnostic package rule exactly once", () => {
    expect([...registeredConformanceRuleIds].sort()).toEqual([...catalogRuleIds].sort());
    expect(new Set(registeredConformanceRuleIds).size).toBe(registeredConformanceRuleIds.length);
  });

  it("fails completeness for a test-only unregistered rule", () => {
    expect(
      missingConformanceCases(
        [...catalogRuleIds, "skill/test-only-unregistered"],
        registeredConformanceRuleIds,
      ),
    ).toEqual(["skill/test-only-unregistered"]);
  });
});
