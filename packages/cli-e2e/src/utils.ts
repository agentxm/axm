import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { copyFixture, createCliRunner, createTempDir } from "@axm.sh/e2e-utils";

export const runCli = createCliRunner(new URL("../../cli/dist/src/main.js", import.meta.url));

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
