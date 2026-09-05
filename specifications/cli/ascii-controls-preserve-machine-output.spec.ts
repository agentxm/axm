import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { HelpTopicResultSchema, JsonErrorEnvelopeSchema } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeOutputControlsFixture } from "../support/output-controls-harness.js";

export const specification = defineSpecification({
  requirement: "cli/ascii-controls-preserve-machine-output",
  title: "ASCII display controls leave machine documents unchanged",
  statement:
    "When JSON output is selected, AXM shall leave result and diagnostic documents unchanged by AXM_ASCII, TERM, LC_ALL, LC_CTYPE, and LANG display-symbol inputs.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  boundary: "process",
  boundaryRationale:
    "The built CLI receives the actual environment inputs while producing a successful help-topic result and a Unicode-bearing help refusal on its real machine channels.",
  methods: ["decision-table", "example"],
  derivedFrom: ["packages/cli/help/topics/environment.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These examples compare one successful result and one expected failure; they do not claim every command, lifecycle-progress event, or runtime formatter is covered.",
      retirementCondition:
        "Add a distinct command or event example when source review identifies a display-symbol input reaching an uncovered machine producer.",
    },
  ],
});

const environments = [
  { label: "ASCII request", env: { AXM_ASCII: "1" } },
  { label: "other nonempty ASCII request", env: { AXM_ASCII: "0" } },
  { label: "dumb terminal", env: { TERM: "dumb" } },
  { label: "non-UTF-8 LC_ALL", env: { LC_ALL: "C" } },
  { label: "non-UTF-8 LC_CTYPE", env: { LC_CTYPE: "POSIX" } },
  { label: "non-UTF-8 LANG", env: { LANG: "C" } },
] satisfies ReadonlyArray<{ readonly label: string; readonly env: NodeJS.ProcessEnv }>;

describe("Machine output ignores human symbol selection", () => {
  it.each(environments)("$label preserves successful and failed documents", async ({ env }) => {
    const fixture = makeOutputControlsFixture();
    try {
      const successArgs = ["help", "environment", "--json"];
      const failureArgs = ["help", "部署-café-unknown", "--json"];
      const ordinarySuccess = await fixture.run(successArgs);
      const ordinaryFailure = await fixture.run(failureArgs);
      const success = await fixture.run(successArgs, env);
      const failure = await fixture.run(failureArgs, env);

      expect(ordinarySuccess.exitCode, ordinarySuccess.stdout + ordinarySuccess.stderr).toBe(0);
      const result = Schema.decodeUnknownSync(
        Schema.Struct({ ok: Schema.Literal(true), result: HelpTopicResultSchema }),
      )(JSON.parse(ordinarySuccess.stdout));
      expect(result.result.topic).toBe("environment");
      expect(result.result.content).toContain("AXM_ASCII");
      expect(ordinaryFailure.exitCode).not.toBe(0);
      const refusal = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(
        JSON.parse(ordinaryFailure.stdout),
      );
      expect(refusal.detail).toContain("部署-café-unknown");
      expect(ordinaryFailure.stderr.length).toBeGreaterThan(0);
      expect(success).toEqual(ordinarySuccess);
      expect(failure).toEqual(ordinaryFailure);
    } finally {
      fixture.cleanup();
    }
  });
});
