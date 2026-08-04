import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyFixture,
  createCliRunner,
  createTempDir,
  type RunCliOptions,
} from "@agentxm/client-e2e-utils";

const runBuiltCli = createCliRunner(new URL("../../cli/dist/src/main.js", import.meta.url));
const isolatedUserHome = createTempDir();

process.once("exit", () => {
  isolatedUserHome.cleanup();
});

export const runCli = (args: ReadonlyArray<string>, options: RunCliOptions = {}) =>
  runBuiltCli(args, {
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
