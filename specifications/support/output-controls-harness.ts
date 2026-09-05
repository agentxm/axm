import * as fs from "node:fs";
import * as path from "node:path";
import { createCliRunner, createTempDir } from "@agentxm/client-e2e-utils";

const runBuiltCli = createCliRunner(
  new URL("../../packages/cli/dist/src/main.js", import.meta.url),
);

/** The actual CLI in a disposable project and home, with controlled output inputs. */
export const makeOutputControlsFixture = () => {
  const temporary = createTempDir("axm-output-controls-spec-");
  const root = fs.realpathSync(temporary.path);
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  const run = (args: ReadonlyArray<string>, env?: NodeJS.ProcessEnv) =>
    runBuiltCli(args, {
      cwd: project,
      env: {
        HOME: home,
        AXM_USER_HOME: home,
        AXM_REGISTRY_LOCATION: "https://registry.invalid",
        AXM_REGISTRY_URL: "https://registry.invalid",
        AXM_TOKEN: "",
        AXM_TOKEN_FILE: "",
        AXM_NO_UPDATE_CHECK: "1",
        AXM_VERBOSE: "",
        AXM_DEBUG: "",
        AXM_ASCII: "",
        TERM: "",
        LC_ALL: "",
        LC_CTYPE: "",
        LANG: "",
        ...env,
      },
    });
  return { project, home, run, cleanup: temporary.cleanup };
};
