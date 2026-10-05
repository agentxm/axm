import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  buildSkillRuleContexts,
  evaluateContexts,
  makeVftSkillFileAccessor,
  skillRules,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "skills/lint/acquired-content-has-management-checks",
  title: "Skill conformance is explicit regardless of authorship",
  statement:
    "When checking a Skill, AXM shall validate its management obligations regardless of authorship without emitting content-conformance findings unless explicitly configured; neither check shall modify the content.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const check = (content: string | undefined, conformance = false, isNative = false) => {
  const bytes = content === undefined ? undefined : new TextEncoder().encode(content);
  const skillJson = isNative
    ? { type: "skill", owner: "@example", name: "upstream-path", version: "1.0.0" }
    : undefined;
  const files = makeVftSkillFileAccessor({
    hasFile: (path) =>
      (path === "SKILL.md" && bytes !== undefined) || (path === "skill.json" && isNative),
    getFile: (path) => (path === "SKILL.md" ? bytes : undefined),
  });
  const contexts = buildSkillRuleContexts({
    installedSkills: [
      {
        isNative,
        skillJson,
        expectedName: "upstream-path",
        displayRoot: "external/upstream-path",
        files,
        packageFiles: files,
      },
    ],
  });
  return evaluateContexts(
    skillRules,
    contexts,
    conformance
      ? {
          rules: {
            "skill/frontmatter-parseable": "error",
            "skill/frontmatter-standard-valid": "error",
          },
        }
      : {},
  ).pipe(Effect.map((results) => results.flatMap((result) => result.findings)));
};

describe("Acquired skill checks", () => {
  it.effect.each([
    "---\nname: Display Name\ndescription: Guidance\ndisable-model-invocation: true\n---\n",
    "---\nname: vendor-skill\nmetadata: { revision: 3 }\n---\n",
    "# Plain upstream instructions\n",
    "---\nname: [upstream malformed metadata\n---\n",
  ])("keeps external content quiet: %s", (content) =>
    Effect.gen(function* () {
      expect(yield* check(content)).toEqual([]);
      expect(yield* check(content, false, true)).toEqual([]);
      expect((yield* check(content, true)).length).toBeGreaterThan(0);
      expect((yield* check(content, true, true)).length).toBeGreaterThan(0);
    }),
  );

  it.effect("still reports a missing managed skill entry point", () =>
    Effect.gen(function* () {
      expect(yield* check(undefined)).toMatchObject([
        { ruleId: "skill/skill-md-present", severity: "error" },
      ]);
    }),
  );
});
