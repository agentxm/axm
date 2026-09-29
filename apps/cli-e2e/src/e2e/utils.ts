export {
  copySkillsRepoFixture,
  createTempDir,
  FIXTURES_PATH,
  runCli,
  SKILLS_REPO_FIXTURE,
  writeDefaultRegistrySettings,
  writeUserDefaultRegistry,
} from "../utils.js";
export { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";

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
