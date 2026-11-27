import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBinaryRunner,
  createCliRunner,
  createTempDir,
  type RunCliOptions,
} from "@agentxm/client-e2e-utils";
import { cliArtifact } from "./cli-artifact.js";
import { withWireContracts } from "./test-support/wire-contracts.js";

const runCliArtifact = withWireContracts(
  cliArtifact.runtime === "binary"
    ? createBinaryRunner(cliArtifact.path)
    : createCliRunner(cliArtifact.path),
  cliArtifact.path,
);
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

const FIXTURES_PATH = fileURLToPath(new URL("./fixtures/", import.meta.url));
const skillsRepoFixtureSource = path.join(FIXTURES_PATH, "skills-repo");

// Give each Vitest worker its own mutable copy so parallel E2E files cannot interfere.
const sharedSkillsRepoFixture = createTempDir("axm-skills-repo-");
fs.cpSync(skillsRepoFixtureSource, sharedSkillsRepoFixture.path, { recursive: true });

process.once("exit", () => {
  sharedSkillsRepoFixture.cleanup();
});

export const SKILLS_REPO_FIXTURE = sharedSkillsRepoFixture.path;

/** Compare workspace-relative meaning while retaining every reported field. */
export const normalizeWorkspacePaths = (value: unknown, workspacePath: string): unknown => {
  if (typeof value === "string") {
    return value === workspacePath
      ? "."
      : value.startsWith(`${workspacePath}/`) || value.startsWith(`${workspacePath}\\`)
        ? value.slice(workspacePath.length + 1)
        : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => normalizeWorkspacePaths(entry, workspacePath));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeWorkspacePaths(entry, workspacePath),
      ]),
    );
  }
  return value;
};
