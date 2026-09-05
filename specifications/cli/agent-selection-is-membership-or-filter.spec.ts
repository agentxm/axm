import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  TEST_VERSION,
  collectHelpFiles,
  makeAxmSkillCompatibilityPolicyLayer,
  makeCliTestContext,
  rootCommand,
} from "axm.sh/specification-harness";
import {
  AuthLoginInteractionTest,
  DeviceLoginInteractionTest,
} from "@agentxm/registry-auth/testing";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/agent-selection-is-membership-or-filter",
  title: "Agent selection chooses workspace membership or filters a listing, never one extension",
  statement:
    "A command shall accept an agent selection only to choose the workspace's configured agents or to filter a listing, shall reject an unsupported agent identifier before any work begins, and no command shall accept an agent selection that narrows one extension.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: [
    "axm setup --agent",
    "axm skills list --agent",
    "axm subagents list --agent",
    "cli/sync/realizes-desired-state",
    "cli/agents/membership-changes-realize-affected-outputs",
  ],
  supersedes: [],
  assumptions: [
    "The agent catalog shipped with the CLI is the only source of supported agent identifiers, so an identifier outside it can be refused without consulting the workspace.",
  ],
  openQuestions: [],
});

/**
 * The only commands whose meaning includes choosing agents: workspace
 * membership at setup and row filtering when listing. Any other command
 * offering `--agent` would be selecting agents for one extension, which the
 * workspace model cannot represent durably.
 */
const AGENT_SELECTION_COMMANDS = ["axm setup", "axm skills list", "axm subagents list"] as const;

const failureTag = (failure: unknown): string | undefined =>
  typeof failure === "object" &&
  failure !== null &&
  "_tag" in failure &&
  typeof failure._tag === "string"
    ? failure._tag
    : undefined;

/** Parse failures either surface directly or ride inside a help request. */
const parseFailures = (failure: unknown): ReadonlyArray<unknown> =>
  typeof failure === "object" &&
  failure !== null &&
  failureTag(failure) === "ShowHelp" &&
  "errors" in failure &&
  Array.isArray(failure.errors)
    ? failure.errors
    : [failure];

const PARSE_FAILURE_TAGS = new Set(["InvalidValue", "UnrecognizedOption", "UserError"]);

const describeFailure = (failure: unknown): string =>
  `${String(failure)} ${JSON.stringify(failure)}`;

describe("Agent selection surface", () => {
  it.effect("only the membership and listing commands offer an agent selection", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const offering: string[] = [];
      for (const [commandPath, doc] of helpFiles) {
        if (doc.flags.some((flag) => flag.name === "agent")) {
          offering.push(commandPath);
        }
      }
      expect(offering.sort()).toEqual([...AGENT_SELECTION_COMMANDS].sort());
    }),
  );
});

describe("Unsupported agent identifiers", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const rejectionRows = [
    {
      command: "axm setup",
      args: ["setup", "--yes", "--scope", "project", "--non-interactive", "--agent", "bogus"],
    },
    { command: "axm skills list", args: ["skills", "list", "--agent", "bogus"] },
    { command: "axm subagents list", args: ["subagents", "list", "--agent", "bogus"] },
  ] as const;

  it.effect.each(rejectionRows)(
    "$command refuses an unsupported agent identifier before any work begins",
    (row) =>
      Effect.gen(function* () {
        // An empty directory with no workspace: any work at all would either
        // create files or report a result, and neither may happen.
        const directory = fs.realpathSync(
          fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-agent-selection-")),
        );
        cleanups.push(() => fs.rmSync(directory, { recursive: true, force: true }));
        const context = makeCliTestContext({ machine: true, flags: { json: true } });
        // The product registers help as its only built-in flag; the parser default
        // would add a version flag whose alias collides with the verbose flag.
        // The remaining services satisfy the command tree's static requirements;
        // a parse failure never reaches them.
        const parserLayer = Layer.mergeAll(
          context.baseLayer,
          CliConfig.layer({ builtIns: [GlobalFlag.Help] }),
          makeAxmSkillCompatibilityPolicyLayer(TEST_VERSION),
          AuthLoginInteractionTest().layer,
          DeviceLoginInteractionTest().layer,
        );

        const failure = yield* Command.runWith(rootCommand, {
          version: TEST_VERSION,
          renderErrors: false,
        })(["--directory", directory, ...row.args]).pipe(Effect.provide(parserLayer), Effect.flip);

        const failures = parseFailures(failure);
        expect(failures.length).toBeGreaterThan(0);
        for (const parseFailure of failures) {
          expect(PARSE_FAILURE_TAGS.has(failureTag(parseFailure) ?? "")).toBe(true);
          expect(describeFailure(parseFailure)).toContain("bogus");
        }
        expect(context.rendererState.results).toEqual([]);
        expect(fs.readdirSync(directory)).toEqual([]);
      }),
  );
});
