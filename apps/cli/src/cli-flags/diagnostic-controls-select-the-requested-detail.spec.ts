import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { probeFlag } from "../test-support/parser-probe.js";
import { isEnabledEnvRequest, resolveVerbosityLevel } from "./resolve-verbosity.js";

export const specification = defineSpecification({
  requirement: "cli/diagnostic-controls-select-the-requested-detail",
  title: "Quiet takes precedence over debug and verbose diagnostics",
  statement:
    "For human error diagnostics produced after command flags have been parsed and the command runtime initialized, AXM shall select quiet before debug before verbose before ordinary detail, with --quiet or -q requesting quiet, --debug or AXM_DEBUG requesting debug, --verbose, -v, or AXM_VERBOSE requesting verbose, and only the environment values 1 and true enabling those requests.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The registered parser decides which flag spellings a command admits, and the production verbosity resolver decides which detail a parsed request selects; both are reachable in process, and the built-CLI rendering of that detail is bound evidence at apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/help/topics/environment.md",
    "apps/cli/src/cli-flags/index.ts",
    "apps/cli/src/runtime.ts",
    "apps/cli/src/cli-runtime/runtime-envelope.ts",
    "apps/cli/src/app-error/render.test.ts",
    "apps/cli-e2e/src/diagnostic-controls-select-the-requested-detail.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The earlier public quiet description covered narration, tables, progress, and required actions as well as error detail; complete human-output suppression across commands needs separate allocation and evidence.",
    "What diagnostic selection is promised for failures before parsed command runtime initialization, including raw arguments after -- and parser failures?",
  ],
  limitations: [
    {
      limitation:
        "These examples distinguish detail levels through the resolver and one production settings-error path. They do not prescribe exact cause text, stack frames, log messages, logger severity names, or every flag and environment combination.",
      retirementCondition:
        "Add distinct producer or combination evidence when a reviewed source reveals behavior not distinguished by these examples.",
    },
  ],
});

interface DetailCase {
  readonly label: string;
  readonly flags: ReadonlyArray<string>;
  readonly env: NodeJS.ProcessEnv;
  readonly detail: "ordinary" | "quiet" | "verbose" | "debug";
}

const cases = [
  { label: "ordinary default", flags: [], env: {}, detail: "ordinary" },
  { label: "verbose long flag", flags: ["--verbose"], env: {}, detail: "verbose" },
  { label: "verbose short flag", flags: ["-v"], env: {}, detail: "verbose" },
  { label: "debug flag", flags: ["--debug"], env: {}, detail: "debug" },
  { label: "quiet long flag", flags: ["--quiet"], env: {}, detail: "quiet" },
  { label: "quiet short flag", flags: ["-q"], env: {}, detail: "quiet" },
  { label: "verbose numeric environment", flags: [], env: { AXM_VERBOSE: "1" }, detail: "verbose" },
  { label: "verbose true environment", flags: [], env: { AXM_VERBOSE: "true" }, detail: "verbose" },
  { label: "debug numeric environment", flags: [], env: { AXM_DEBUG: "1" }, detail: "debug" },
  { label: "debug true environment", flags: [], env: { AXM_DEBUG: "true" }, detail: "debug" },
  { label: "debug before verbose flag", flags: ["--debug", "--verbose"], env: {}, detail: "debug" },
  { label: "debug after verbose flag", flags: ["--verbose", "--debug"], env: {}, detail: "debug" },
  {
    label: "debug environment over verbose flag",
    flags: ["-v"],
    env: { AXM_DEBUG: "1" },
    detail: "debug",
  },
  {
    label: "debug flag over verbose environment",
    flags: ["--debug"],
    env: { AXM_VERBOSE: "true" },
    detail: "debug",
  },
  {
    label: "debug environment over verbose environment",
    flags: [],
    env: { AXM_VERBOSE: "1", AXM_DEBUG: "true" },
    detail: "debug",
  },
  {
    label: "quiet before every diagnostic request",
    flags: ["--quiet", "--verbose", "--debug"],
    env: { AXM_VERBOSE: "true", AXM_DEBUG: "1" },
    detail: "quiet",
  },
  {
    label: "quiet after every diagnostic request",
    flags: ["--debug", "--verbose", "-q"],
    env: { AXM_VERBOSE: "1", AXM_DEBUG: "true" },
    detail: "quiet",
  },
  {
    label: "quiet overrides environment-only requests",
    flags: ["--quiet"],
    env: { AXM_VERBOSE: "true", AXM_DEBUG: "true" },
    detail: "quiet",
  },
  ...["", "0", "false", "TRUE", "yes", " true"].map((value) => ({
    label: `disabled environment ${JSON.stringify(value)}`,
    flags: [],
    env: { AXM_VERBOSE: value, AXM_DEBUG: value },
    detail: "ordinary" as const,
  })),
] satisfies ReadonlyArray<DetailCase>;

/** The parsed request one row's flags and environment amount to. */
const requestOf = (row: DetailCase) => ({
  flagQuiet: row.flags.includes("--quiet") || row.flags.includes("-q"),
  flagDebug: row.flags.includes("--debug"),
  flagVerbose: row.flags.includes("--verbose") || row.flags.includes("-v"),
  envDebug: isEnabledEnvRequest(row.env["AXM_DEBUG"]),
  envVerbose: isEnabledEnvRequest(row.env["AXM_VERBOSE"]),
});

const expectedLevel = {
  ordinary: "normal",
  quiet: "quiet",
  verbose: "verbose",
  debug: "debug",
} as const;

describe("Diagnostic control grammar", () => {
  it.effect.each(["--quiet", "-q", "--verbose", "-v", "--debug"])(
    "the registered parser admits %s on a command invocation",
    (flag) =>
      Effect.gen(function* () {
        expect(yield* probeFlag(["list"], flag)).toBe("accepted");
      }),
  );
});

describe("Diagnostic request precedence", () => {
  it.each(cases)("$label selects the corresponding error detail", (row) => {
    expect(resolveVerbosityLevel(requestOf(row))).toBe(expectedLevel[row.detail]);
  });
});
