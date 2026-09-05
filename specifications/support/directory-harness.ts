import * as fs from "node:fs";
import * as path from "node:path";
import { createCliRunner, createTempDir } from "@agentxm/client-e2e-utils";

const runBuiltCli = createCliRunner(
  new URL("../../packages/cli/dist/src/main.js", import.meta.url),
);

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
