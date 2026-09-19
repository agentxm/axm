import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  copyFixture,
  createBinaryRunner,
  createCliRunner,
  createTempDir,
  type RunCliOptions,
} from "@agentxm/client-e2e-utils";
import { cliArtifact } from "./cli-artifact.js";

const runCliArtifact =
  cliArtifact.runtime === "binary"
    ? createBinaryRunner(cliArtifact.path)
    : createCliRunner(cliArtifact.path);
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

/** Select a controlled Registry through the same durable settings contract as production. */
export const writeDefaultRegistrySettings = (settingsPath: string, location: string): void => {
  const existing: unknown = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
    : {};
  const settings =
    typeof existing === "object" && existing !== null && !Array.isArray(existing) ? existing : {};
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    `${JSON.stringify({
      ...settings,
      defaultRegistry: "test",
      sources: [{ name: "test", type: "registry", location }],
    })}\n`,
  );
};

export const writeUserDefaultRegistry = (home: string, location: string): void =>
  writeDefaultRegistrySettings(path.join(home, ".axm", "workspace", "axm.json"), location);

export const FIXTURES_PATH = fileURLToPath(new URL("./fixtures/", import.meta.url));
const skillsRepoFixtureSource = path.join(FIXTURES_PATH, "skills-repo");

// Give each Vitest worker its own mutable copy so parallel E2E files cannot interfere.
const sharedSkillsRepoFixture = copyFixture(skillsRepoFixtureSource, "axm-skills-repo-");

process.once("exit", () => {
  sharedSkillsRepoFixture.cleanup();
});

export const SKILLS_REPO_FIXTURE = sharedSkillsRepoFixture.path;

export const copySkillsRepoFixture = () => copyFixture(skillsRepoFixtureSource);
