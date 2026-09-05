import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeOutputControlsFixture } from "../support/output-controls-harness.js";

export const specification = defineSpecification({
  requirement: "cli/diagnostic-controls-select-the-requested-detail",
  title: "Quiet takes precedence over debug and verbose diagnostics",
  statement:
    "For human error diagnostics produced after command flags have been parsed and the command runtime initialized, AXM shall select quiet before debug before verbose before ordinary detail, with --quiet or -q requesting quiet, --debug or AXM_DEBUG requesting debug, --verbose, -v, or AXM_VERBOSE requesting verbose, and only the environment values 1 and true enabling those requests.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI parses the actual global flags, reads the controlled process environment, produces a settings parse failure, and renders its available cause and stack through the production error screen.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/cli/src/cli-flags/index.ts",
    "packages/cli/src/runtime.ts",
    "packages/cli/src/cli-runtime/runtime-envelope.ts",
    "packages/cli/src/app-error/render.internal.test.ts",
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
        "These process examples distinguish detail levels using one production settings-error path. They do not prescribe exact cause text, stack frames, log messages, logger severity names, or every flag and environment combination.",
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

describe("Diagnostic request precedence", () => {
  it.each(cases)(
    "$label selects the corresponding error detail",
    async ({ flags, env, detail }) => {
      const fixture = makeOutputControlsFixture();
      const settingsPath = path.join(fixture.project, "axm.json");
      try {
        fs.writeFileSync(settingsPath, "{\n");
        const result = await fixture.run(["list", "--scope", "project", ...flags], env);
        expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(settingsPath);
        expect(result.stderr).toContain("validation");
        expect(result.stderr).toContain("JSON");
        // These markers distinguish available diagnostic detail, not a fixed
        // cause sentence or a required stack location.
        expect(result.stderr.includes("Cause:")).toBe(detail === "verbose" || detail === "debug");
        expect(result.stderr.includes("Stack:")).toBe(detail === "debug");
        if (detail === "verbose" || detail === "debug") {
          expect(result.stderr).toContain("SettingsParseError");
        }
        expect(fs.readFileSync(settingsPath, "utf8")).toBe("{\n");
      } finally {
        fixture.cleanup();
      }
    },
  );
});
