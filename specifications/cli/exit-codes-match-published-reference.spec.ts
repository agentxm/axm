import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  ExitCodeDefinitions,
  HelpTopicResultSchema,
  OperationExitLive,
  TestRenderer,
  classifyError,
  getOperationExitCode,
  handleDemote,
  handleHelpPath,
  rootCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { parserRejection } from "../support/parser-probe.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/exit-codes-match-published-reference",
  title: "The published exit-code reference matches the runtime exit codes",
  statement:
    "The served exit-codes help topic shall list exactly the exit codes and meanings the command line returns at runtime, with no missing, extra, or differing rows, and an invocation the parser rejects or an apply stopped as approval required shall exit with the code whose published meaning names that outcome.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "knowledge-access"],
  methods: ["model", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeTopic = Schema.decodeUnknownEffect(HelpTopicResultSchema);

const parseExitCodeRows = (
  topic: string,
): ReadonlyArray<{
  readonly code: number;
  readonly meaning: string;
}> =>
  topic.split("\n").flatMap((line) => {
    const match = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|$/u.exec(line);
    if (match === null) return [];
    const code = Number(match[1]);
    const meaning = match[2];
    return Number.isInteger(code) && meaning !== undefined ? [{ code, meaning }] : [];
  });

/** The published row whose meaning covers bad invocations and blocked approvals. */
const usageRow = ExitCodeDefinitions.find((row) => row.meaning.startsWith("Invalid invocation"));

describe("Published exit-code reference", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a flag the route does not register exits with the published invalid-invocation code",
    () =>
      Effect.gen(function* () {
        expect(usageRow).toBeDefined();
        const rejection = yield* parserRejection(["skills", "enable", "code-review", "--yes"]);

        const classified = classifyError(rejection, "json");

        expect(classified.exitCode).toBe(usageRow?.code);
        expect(classified.exitCode).toBeGreaterThan(0);
      }),
  );

  it.effect(
    "an apply stopped as approval required exits with the published approval-required code",
    () =>
      Effect.gen(function* () {
        expect(usageRow?.meaning).toContain("approval required");
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { owner: "@acme", skills: { review: "workspace" } },
        });
        cleanups.push(workspace.cleanup);
        writeAuthoredSkill(workspace.root, { name: "review" });
        const replacement = writeLocalSkillPackage(workspace.root, {
          name: "review",
          body: "Replacement guidance.",
        });

        // The operation's exit is recorded on the transport the runtime honors
        // verbatim, so reading it back observes the code the process exits with.
        const exitCode = yield* Effect.gen(function* () {
          yield* handleDemote({
            fqn: "@acme/skills/review",
            source: replacement,
            yes: false,
            preview: false,
          });
          return yield* getOperationExitCode;
        }).pipe(Effect.provide(Layer.mergeAll(workspace.layer, OperationExitLive)));

        expect(workspace.rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "blocked", blocking: { class: "approval-required" } },
        });
        expect(Option.getOrUndefined(exitCode)).toBe(usageRow?.code);
      }),
  );

  it.effect("the served exit-codes help topic states exactly the runtime exit codes", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      yield* handleHelpPath(["exit-codes"], rootCommand).pipe(Effect.provide(renderer.layer));

      const topic = yield* decodeTopic(renderer.state.results[0]?.data);
      expect(topic.topic).toBe("exit-codes");
      expect(parseExitCodeRows(topic.content)).toEqual(ExitCodeDefinitions);
    }),
  );
});
