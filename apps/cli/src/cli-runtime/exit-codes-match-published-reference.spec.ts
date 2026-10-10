import { BlockingClassSchema } from "@agentxm/workspace-kernel/operations";
import { operationExitCode } from "../operation-exit-code.js";
import { HELP_TOPICS } from "../__generated__/help-topics.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { makeOperationResolution } from "@agentxm/workspace-kernel/operations";

import { ExitCodeDefinitions, appErrorCodeForExit } from "../app-error/index.js";
import { resolutionExitCode } from "../operation-exit-code.js";
import { HelpTopicResultSchema, handleHelpPath } from "../root/help/command.js";
import { OperationExitLive, classifyError, getOperationExitCode } from "./index.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { handleDemote } from "../root/demote/command.js";
import { rootCommand } from "../app.js";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../test-support/install-harness.js";
import { parserRejection } from "../test-support/parser-probe.js";
import { writeAuthoredSkill } from "../test-support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/exit-codes-match-published-reference",
  title: "The published exit-code reference matches the runtime exit codes",
  statement:
    "The served exit-codes help topic shall list exactly the exit codes, their shared JSON error codes (blank for success and signals), and meanings the command line returns at runtime, with no missing, extra, or differing rows, machine-output help shall list all eleven blocking classes in schema order with their fixed exit or carried-cause mapping and identify human-required and external-blocked as live-wait classes, and an invocation the parser rejects, an apply stopped as approval required, or an operation terminated by a signal shall exit with the code whose published meaning names that outcome.",
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
  readonly jsonCode: string;
  readonly meaning: string;
}> =>
  topic.split("\n").flatMap((line) => {
    const match = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/u.exec(line);
    if (match === null) return [];
    const code = Number(match[1]);
    const jsonCode = match[2];
    const meaning = match[3];
    return Number.isInteger(code) && jsonCode !== undefined && meaning !== undefined
      ? [{ code, jsonCode, meaning }]
      : [];
  });

/** The published row whose meaning covers bad invocations and blocked approvals. */
const usageRow = ExitCodeDefinitions.find((row) => row.meaning.startsWith("Invalid invocation"));

/** The published rows for the two termination signals an operation can settle on. */
const signalRow = (signal: "SIGINT" | "SIGTERM") =>
  ExitCodeDefinitions.find((row) => row.meaning.includes(signal));

describe("Published exit-code reference", () => {
  it("publishes every blocking class and its terminal exit mapping", () => {
    const section =
      HELP_TOPICS["machine-output"].split("## Blocking classes")[1]?.split("## Consumption")[0] ??
      "";
    const classes = section.split("\n").flatMap((line) => {
      const match = /^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|$/u.exec(line);
      return match?.[1] === undefined || match[2] === undefined
        ? []
        : [{ name: match[1], exit: match[2].trim() }];
    });
    expect(classes.map((row) => row.name)).toEqual(BlockingClassSchema.literals);
    for (const name of BlockingClassSchema.literals) {
      const row = classes.find((entry) => entry.name === name);
      if (name === "human-required" || name === "external-blocked") {
        expect(row?.exit).toBe("Waiting only; no terminal exit");
      } else if (row?.exit === "cause") {
        expect(operationExitCode({ blocking: { class: name, causeCode: "auth" } }, "blocked")).toBe(
          4,
        );
        expect(operationExitCode({ blocking: { class: name } }, "blocked")).toBe(1);
      } else {
        expect(row?.exit).toBe(String(operationExitCode({ blocking: { class: name } }, "blocked")));
      }
    }
  });

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
        expect(usageRow?.meaning).toContain("approval-required");
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

  it.each(["SIGINT", "SIGTERM"] as const)(
    "an operation terminated by %s exits with the published code for that signal",
    (signal) => {
      const interrupted = makeOperationResolution({
        name: "Install extensions",
        description: Option.none(),
        mode: "apply",
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [],
        interruption: { signal, disposition: "restored" },
      });
      expect(signalRow(signal)).toBeDefined();
      expect(resolutionExitCode(interrupted)).toBe(signalRow(signal)?.code);
    },
  );

  it.effect("the served exit-codes help topic states exactly the runtime exit codes", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      yield* handleHelpPath(["exit-codes"], rootCommand).pipe(Effect.provide(renderer.layer));

      const topic = yield* decodeTopic(renderer.state.results[0]?.data);
      expect(topic.topic).toBe("exit-codes");
      if (topic.kind !== "markdown")
        return yield* Effect.die("Exit-code reference must be Markdown");
      expect(topic.content).toMatch(/\| Code\s*\| JSON code\s*\| Meaning\s*\|/u);
      expect(parseExitCodeRows(topic.content)).toEqual(
        ExitCodeDefinitions.map((row) => ({
          ...row,
          jsonCode: appErrorCodeForExit(row.code) ?? "",
        })),
      );
    }),
  );
});
