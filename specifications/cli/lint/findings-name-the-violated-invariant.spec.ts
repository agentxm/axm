import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { LintResultDocumentSchema, handleInstall, handleLint } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/findings-name-the-violated-invariant",
  title: "Lint findings identify the violated invariant and affected subject as facts",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["contract"],
});

const decodeDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

/** The complete fact vocabulary a machine finding may carry. */
const FACT_FIELDS = new Set([
  "group",
  "kind",
  "ruleId",
  "severity",
  "message",
  "displayRoot",
  "path",
  "subject",
  "authority",
  "observed",
  "expected",
  "location",
]);

const rawFindings = (payload: unknown): ReadonlyArray<Record<string, unknown>> => {
  if (typeof payload !== "object" || payload === null) return [];
  const result: unknown = Reflect.get(payload, "result");
  if (typeof result !== "object" || result === null) return [];
  const findings: unknown = Reflect.get(result, "findings");
  if (!Array.isArray(findings)) return [];
  return findings.flatMap((finding: unknown) =>
    typeof finding === "object" && finding !== null && !Array.isArray(finding)
      ? [Object.fromEntries(Object.entries(finding))]
      : [],
  );
};

describe("Lint finding identity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("every machine finding carries only invariant, subject, and evidence facts", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      fs.rmSync(path.join(workspace.root, ".claude", "skills", "code-review"), {
        recursive: true,
      });

      const suggestionsBefore = workspace.rendererState.suggestions.length;
      yield* handleLint({
        pathArg: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        input: { view: "workspace" },
      }).pipe(Effect.provide(workspace.layer), Effect.exit);

      const entry = workspace.rendererState.results.at(-1);
      const document = yield* decodeDocument(entry?.data);
      expect(document.result.findings.length).toBeGreaterThanOrEqual(1);
      const findings = rawFindings(entry?.data);

      for (const finding of document.result.findings) {
        expect(finding.ruleId, "stable rule identity").toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/);
        expect(finding.subject.length, `subject of ${finding.ruleId}`).toBeGreaterThan(0);
        expect(finding.authority.length, `authority of ${finding.ruleId}`).toBeGreaterThan(0);
        expect(finding.observed.length, `observed state of ${finding.ruleId}`).toBeGreaterThan(0);
        expect(finding.expected.length, `expected invariant of ${finding.ruleId}`).toBeGreaterThan(
          0,
        );
        expect(finding.path.length, `location of ${finding.ruleId}`).toBeGreaterThan(0);
      }
      expect(findings.length).toBeGreaterThanOrEqual(1);
      for (const finding of findings) {
        for (const key of Object.keys(finding)) {
          expect(FACT_FIELDS.has(key), `finding field '${key}' is a fact field`).toBe(true);
        }
      }
      expect(workspace.rendererState.suggestions.length).toBe(suggestionsBefore);
    }),
  );
});
