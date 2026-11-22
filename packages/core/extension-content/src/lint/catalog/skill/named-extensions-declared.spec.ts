import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { lintCatalogRuleMetadata } from "../../catalog-metadata.js";
import type { ExtensionFileAccessor, SkillRuleContext } from "../../context.js";
import { namedExtensionsDeclaredRule } from "./named-extensions-declared.js";

export const specification = defineSpecification({
  requirement: "skills/lint/named-extensions-declared",
  title: "A skill names another extension only through a declared relationship",
  statement:
    "When explicitly configured, AXM lint shall warn when a Skill's SKILL.md names a qualified extension identity other than its own that its manifest does not declare: a pack the manifest does not recommend, or any other extension when the manifest recommends no pack.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["knowledge/axe/src/patterns/neighboring-intent.md"],
  supersedes: [],
  assumptions: [
    "Membership of a recommended pack is not checked, because the lint run may not include that pack's manifest.",
  ],
  openQuestions: [],
});

const base = { type: "skill", owner: "@acme", name: "docs", version: "1.0.0" };

const check = (body: string, manifest: Readonly<Record<string, unknown>> = base) => {
  const bytes = new TextEncoder().encode(`---\nname: docs\ndescription: Docs.\n---\n${body}\n`);
  const files: ExtensionFileAccessor = {
    exists: () => Effect.succeed(true),
    readBytes: () => Effect.succeed(bytes),
  };
  const context: SkillRuleContext = {
    subject: { isNative: true, skillJson: manifest },
    files,
    packageFiles: files,
    displayRoot: "",
  };
  return namedExtensionsDeclaredRule.check(context);
};

describe("Naming another extension from a skill", () => {
  it.effect("warns on an undeclared neighbor and names both remedies", () =>
    Effect.gen(function* () {
      const findings = yield* check("Defer runbooks to `@acme/skills/devops-docs`.");
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        ruleId: "skill/named-extensions-declared",
        severity: "warning",
        location: { file: "SKILL.md" },
      });
      expect(findings[0]?.message).toContain("@acme/skills/devops-docs");
      expect(findings[0]?.message).toContain("by the work that differs");
    }),
  );

  it.effect("accepts its own identity and members once a recommended pack is declared", () =>
    Effect.gen(function* () {
      const findings = yield* check(
        "This is `@acme/skills/docs`. Load `@acme/knowledge/docs#guides/runbook` from `@acme/packs/docs`.",
        { ...base, recommendedPacks: ["@acme/packs/docs"], standalone: false },
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("warns on a pack the manifest does not recommend", () =>
    Effect.gen(function* () {
      const findings = yield* check("Install `@acme/packs/devops` for operations records.", {
        ...base,
        recommendedPacks: ["@acme/packs/docs"],
      });
      expect(findings.map((finding) => finding.message)).toEqual([
        expect.stringContaining("@acme/packs/devops"),
      ]);
    }),
  );

  it.effect("ignores bare names and strings that are not extension identities", () =>
    Effect.gen(function* () {
      const findings = yield* check("Unlike devops-docs, see @types/node and @acme/widgets/thing.");
      expect(findings).toEqual([]);
    }),
  );

  it("runs only when configured", () => {
    expect(namedExtensionsDeclaredRule.enabledByDefault).toBe(false);
    expect(
      lintCatalogRuleMetadata.find((rule) => rule.id === namedExtensionsDeclaredRule.id),
    ).toMatchObject({ enabledByDefault: false, defaultSeverity: "warning" });
  });
});
