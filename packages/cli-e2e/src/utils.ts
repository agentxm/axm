import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyFixture,
  createBinaryRunner,
  createCliRunner,
  createTempDir,
  type RunCliOptions,
} from "@agentxm/client-e2e-utils";
import { resolveHostBinaryPath } from "./distribution-targets.js";

const cliSource = process.env["AXM_E2E_CLI_SOURCE"] ?? "compiled";
if (cliSource !== "built" && cliSource !== "compiled")
  throw new Error(`Unsupported AXM_E2E_CLI_SOURCE: ${cliSource}.`);
const runCliArtifact =
  cliSource === "compiled"
    ? createBinaryRunner(resolveHostBinaryPath())
    : createCliRunner(new URL("../../cli/dist/src/main.js", import.meta.url));
const isolatedUserHome = createTempDir();

process.once("exit", () => {
  isolatedUserHome.cleanup();
});

export const runCli = (args: ReadonlyArray<string>, options: RunCliOptions = {}) =>
  runCliArtifact(args, {
    ...options,
    env: {
      HOME: isolatedUserHome.path,
      AXM_USER_HOME: isolatedUserHome.path,
      ...options.env,
    },
  });

export { createTempDir };

export const FIXTURES_PATH = fileURLToPath(new URL("./fixtures/", import.meta.url));
const skillsRepoFixtureSource = path.join(FIXTURES_PATH, "skills-repo");

// Give each Vitest worker its own mutable copy so parallel E2E files cannot interfere.
const sharedSkillsRepoFixture = copyFixture(skillsRepoFixtureSource, "axm-skills-repo-");

process.once("exit", () => {
  sharedSkillsRepoFixture.cleanup();
});

export const SKILLS_REPO_FIXTURE = sharedSkillsRepoFixture.path;

export const copySkillsRepoFixture = () => copyFixture(skillsRepoFixtureSource);
