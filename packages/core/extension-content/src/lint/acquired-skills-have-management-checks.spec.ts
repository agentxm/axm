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
  title: "Acquired skills stay quiet about authoring conventions",
  statement:
    "When checking an acquired Skill, AXM shall check its management state without emitting authoring conformance findings for its upstream content; an explicit authoring check shall retain conformance diagnostics and neither check shall modify the content.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const check = (
  content: string | undefined,
  validationPurpose: "authoring" | "management",
  isNative = false,
) => {
  const bytes = content === undefined ? undefined : new TextEncoder().encode(content);
  const files = makeVftSkillFileAccessor({
    hasFile: (path) => path === "SKILL.md" && bytes !== undefined,
    getFile: (path) => (path === "SKILL.md" ? bytes : undefined),
  });
  const contexts = buildSkillRuleContexts({
    installedSkills: [
      {
        validationPurpose,
        isNative,
        skillJson: undefined,
        expectedName: "upstream-path",
        displayRoot: "external/upstream-path",
        files,
        packageFiles: files,
      },
    ],
  });
  return evaluateContexts(skillRules, contexts, {}).pipe(
    Effect.map((results) => results.flatMap((result) => result.findings)),
  );
};

describe("Acquired skill checks", () => {
  it.effect.each([
    "---\nname: Display Name\ndescription: Guidance\ndisable-model-invocation: true\n---\n",
    "---\nname: vendor-skill\nmetadata: { revision: 3 }\n---\n",
    "# Plain upstream instructions\n",
    "---\nname: [upstream malformed metadata\n---\n",
  ])("keeps external content quiet: %s", (content) =>
    Effect.gen(function* () {
      expect(yield* check(content, "management")).toEqual([]);
      expect(yield* check(content, "management", true)).toEqual([]);
      expect((yield* check(content, "authoring")).length).toBeGreaterThan(0);
    }),
  );

  it.effect("still reports a missing managed skill entry point", () =>
    Effect.gen(function* () {
      expect(yield* check(undefined, "management")).toMatchObject([
        { ruleId: "skill/skill-md-present", severity: "error" },
      ]);
    }),
  );
});
