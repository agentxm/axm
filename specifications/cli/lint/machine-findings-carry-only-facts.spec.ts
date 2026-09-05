import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  installSkillWithMissingProjection,
  makeLintSpecWorkspace,
  runProjectLint,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/machine-findings-carry-only-facts",
  title: "Machine lint output carries facts and no advice",
  statement:
    "When lint runs in machine output mode, each reported finding shall carry only fact fields, and the run shall emit no advisory or suggestion content on any channel.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["contract"],
  derivedFrom: ["cli/lint/findings-name-the-violated-invariant"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

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

describe("Machine lint output", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("carries only fact fields on each finding and no suggestion output", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installSkillWithMissingProjection(workspace);

      const suggestionsBefore = workspace.rendererState.suggestions.length;
      yield* runProjectLint(workspace, false);

      const findings = rawFindings(workspace.rendererState.results.at(-1)?.data);
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
