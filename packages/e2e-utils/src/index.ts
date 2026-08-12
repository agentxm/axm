export {
  expectExitCode,
  expectNonInteractiveFailure,
  expectNonInteractiveSuccess,
  expectStderr,
  expectStdout,
  getOutput,
  parseJsonOutput,
  parseNdjsonOutput,
} from "./assertions.js";
export { copyFixture } from "./fixtures.js";
export { withoutLocalGitEnvironment } from "./git-environment.js";
export {
  isAgent,
  isCI,
  isHumanInteractive,
  isInteractive,
  type InteractionEnvOptions,
} from "@agentxm/client-utils/unstable/interaction";
export { createBinaryRunner, createCliRunner, runCommand } from "./runner.js";
export { createTempDir } from "./temp-dir.js";
export type { CliResult, RunCliOptions, TempDirContext } from "./types.js";
