import * as fs from "node:fs";
import * as path from "node:path";
import { createCliRunner, createTempDir } from "@agentxm/client-e2e-utils";

const runBuiltCli = createCliRunner(new URL("../../apps/cli/dist/src/main.js", import.meta.url));

export const makeDirectoryFixture = () => {
  const temporary = createTempDir("axm-directory-spec-");
  const root = fs.realpathSync(temporary.path);
  const invoking = path.join(root, "invoking");
  const selected = path.join(root, "selected");
  const home = path.join(root, "home");
  for (const directory of [invoking, selected, home]) fs.mkdirSync(directory);
  const run = (args: ReadonlyArray<string>) =>
    runBuiltCli(args, {
      cwd: invoking,
      env: {
        HOME: home,
        AXM_USER_HOME: home,
        // The runtime executing the CLI writes its own transpiler cache under
        // HOME. That is apparatus, not workspace state, and would otherwise
        // appear as a change to any directory this fixture observes.
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        // The startup update check refreshes a non-authoritative cache from a
        // background fiber that races process exit. Its own specification owns
        // that behavior; here it would only make observed state nondeterministic.
        AXM_NO_UPDATE_CHECK: "1",
        AXM_REGISTRY_LOCATION: "https://registry.invalid",
        AXM_REGISTRY_URL: "https://registry.invalid",
      },
    });
  return { root, invoking, selected, home, run, cleanup: temporary.cleanup };
};

export const unattendedProjectSetup = [
  "setup",
  "--yes",
  "--scope",
  "project",
  "--agent",
  "claude-code",
  "--non-interactive",
  "--json",
];
