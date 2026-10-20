/**
 * Executes the `configure-nx-remote-cache` composite action's shell against
 * each trust and configuration scenario, so the action's contract travels with
 * the action rather than with any one caller.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const readAction = (): {
  readonly inputs: unknown;
  readonly run: string;
  readonly env: unknown;
} => {
  const action: unknown = YAML.parse(
    fs.readFileSync(
      path.join(repoRoot, ".github/actions/configure-nx-remote-cache/action.yml"),
      "utf8",
    ),
  );
  if (typeof action !== "object" || action === null || !("runs" in action) || !("inputs" in action))
    throw new Error("Missing remote-cache action");
  const runs = action.runs;
  if (typeof runs !== "object" || runs === null || !("steps" in runs) || !Array.isArray(runs.steps))
    throw new Error("Missing action steps");
  const step: unknown = runs.steps.find(
    (candidate: unknown) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "name" in candidate &&
      candidate.name === "Configure native Nx remote caching",
  );
  if (
    typeof step !== "object" ||
    step === null ||
    !("run" in step) ||
    typeof step.run !== "string" ||
    !("env" in step)
  )
    throw new Error("Missing native cache setup");
  return { inputs: action.inputs, run: step.run, env: step.env };
};

describe("configure-nx-remote-cache action", () => {
  it("reads every trust fact from an explicit input", () => {
    const action = readAction();
    expect(action.env).toEqual({
      REMOTE_CACHE_URL: "${{ inputs.url }}",
      REMOTE_CACHE_TOKEN: "${{ inputs.token }}",
      CACHE_BYPASS: "${{ inputs.bypass }}",
      CACHE_ACTOR: "${{ inputs.actor }}",
      CACHE_FORK: "${{ inputs.fork }}",
    });
    expect(action.inputs).toHaveProperty("actor.required", true);
    expect(action.inputs).toHaveProperty("fork.required", true);
  });

  const scenarios = [
    { name: "unconfigured", url: "", token: "", code: 0, enabled: false },
    {
      name: "reader",
      repositoryBypass: "false",
      url: "https://cache.example.test/",
      token: "fixture-reader",
      code: 0,
      enabled: true,
    },
    {
      name: "URL without credential",
      repositoryBypass: "false",
      url: "https://cache.example.test",
      token: "",
      code: 1,
      enabled: false,
    },
    { name: "credential without URL", url: "", token: "fixture-reader", code: 1, enabled: false },
    {
      name: "invalid origin",
      url: "https://cache.example.test/path",
      token: "fixture-reader",
      code: 1,
      enabled: false,
    },
    {
      name: "newline credential",
      url: "https://cache.example.test",
      token: "fixture\nreader",
      code: 1,
      enabled: false,
    },
    {
      name: "fork",
      url: "https://cache.example.test",
      token: "",
      fork: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "missing fork fact",
      url: "https://cache.example.test",
      token: "fixture-reader",
      fork: "",
      code: 1,
      enabled: false,
    },
    {
      name: "missing actor",
      url: "https://cache.example.test",
      token: "fixture-reader",
      actor: "",
      code: 1,
      enabled: false,
    },
    {
      name: "Dependabot",
      url: "https://cache.example.test",
      token: "",
      actor: "dependabot[bot]",
      code: 0,
      enabled: false,
    },
    {
      name: "repository bypass without credential",
      url: "https://cache.example.test",
      token: "",
      repositoryBypass: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "repository bypass with credential",
      url: "https://cache.example.test",
      token: "fixture-reader",
      repositoryBypass: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "invalid repository bypass",
      url: "https://cache.example.test",
      token: "fixture-reader",
      repositoryBypass: "tru",
      code: 1,
      enabled: false,
    },
    {
      name: "explicit bypass",
      url: "https://cache.example.test",
      token: "",
      bypass: "true",
      code: 0,
      enabled: false,
    },
  ];
  for (const scenario of scenarios) {
    it(`handles ${scenario.name}`, () => {
      const { run } = readAction();
      const directory = fs.mkdtempSync(path.join(tmpdir(), "nx-setup-"));
      const environmentFile = path.join(directory, "environment");
      fs.writeFileSync(environmentFile, "");
      try {
        const result = spawnSync("bash", ["-e", "-c", run], {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ENV: environmentFile,
            REMOTE_CACHE_URL: scenario.url,
            REMOTE_CACHE_TOKEN: scenario.token,
            CACHE_BYPASS: "repositoryBypass" in scenario ? scenario.repositoryBypass : "",
            CACHE_ACTOR: "actor" in scenario ? scenario.actor : "fixture-user",
            CACHE_FORK: "fork" in scenario ? scenario.fork : "false",
            NX_SKIP_REMOTE_CACHE: "bypass" in scenario ? scenario.bypass : "false",
          },
        });
        expect(result.status).toBe(scenario.code);
        const values = fs.readFileSync(environmentFile, "utf8");
        expect(values).toContain("NX_CACHE_FAILURES=false");
        expect(values.includes("NX_SKIP_REMOTE_CACHE=false")).toBe(scenario.enabled);
        expect(values.includes("NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=")).toBe(scenario.enabled);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
