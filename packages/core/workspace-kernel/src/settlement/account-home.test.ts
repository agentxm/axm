import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const execute = promisify(execFile);
class AccountHomeWitnessError extends Data.TaggedError("AccountHomeWitnessError")<{
  readonly reason: "query-failed";
}> {}
const program = String.raw`
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { accountHome } from "./src/settlement/account-home.ts";
process.env.BUN_OPTIONS = process.env.AXM_TEST_RUNTIME_OPTIONS;
process.env.NODE_OPTIONS = process.env.AXM_TEST_RUNTIME_OPTIONS;
process.env.PATH = process.env.AXM_TEST_NO_TOOLS;
process.env.TMPDIR = process.env.AXM_TEST_QUERY_SCRATCH;
process.env.TEMP = process.env.AXM_TEST_QUERY_SCRATCH;
process.env.TMP = process.env.AXM_TEST_QUERY_SCRATCH;
const names = ["HOME", "USERPROFILE", "AXM_USER_HOME", "XDG_CONFIG_HOME", "BUN_OPTIONS", "NODE_OPTIONS", "PATH", "TMPDIR", "TEMP", "TMP"];
const before = JSON.stringify(names.map(name => process.env[name]));
const started = performance.now();
const home = await Effect.runPromise(accountHome.pipe(Effect.provide(NodeServices.layer)));
console.log(JSON.stringify({
  matchesAccount: home === process.env.AXM_TEST_ACCOUNT_HOME,
  parentEnvironmentUnchanged: before === JSON.stringify(names.map(name => process.env[name])),
  milliseconds: performance.now() - started,
}));
`;

it.live(
  "uses the OS account under Bun despite home overrides, runtime options, and workspace config",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "axm-account-home-witness-" });
      const bootstrapConfig = path.join(temporary, "empty.toml");
      yield* fs.writeFileString(bootstrapConfig, "");
      const overridden = path.join(temporary, "日本語 workspace home");
      yield* fs.makeDirectory(overridden);
      const poison = path.join(temporary, "poison.js");
      const sentinel = path.join(temporary, "poisoned");
      yield* fs.writeFileString(
        poison,
        `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'unexpected preload'); throw new Error('Unexpected account lookup preload');`,
      );
      const config = `preload = [${JSON.stringify(poison)}]\n`;
      yield* fs.writeFileString(path.join(temporary, "bunfig.toml"), config);
      yield* fs.writeFileString(path.join(overridden, ".bunfig.toml"), config);
      yield* fs.writeFileString(
        path.join(temporary, ".env"),
        "HOME=dotenv-spoof\nUSERPROFILE=dotenv-spoof\n",
      );
      const noTools = path.join(temporary, "no tools");
      yield* fs.makeDirectory(noTools);
      const queryScratch = path.join(temporary, "query scratch");
      yield* fs.makeDirectory(queryScratch);
      // Load source imports before moving into the hostile workspace.
      const witness = program.replace(
        "const names =",
        `process.chdir(${JSON.stringify(temporary)});\nconst names =`,
      );
      const result = yield* Effect.tryPromise({
        try: (signal) =>
          execute("bun", ["--no-env-file", `--config=${bootstrapConfig}`, "--eval", witness], {
            cwd: new URL("../../", import.meta.url),
            env: {
              ...process.env,
              HOME: overridden,
              USERPROFILE: overridden,
              AXM_USER_HOME: overridden,
              XDG_CONFIG_HOME: overridden,
              AXM_TEST_ACCOUNT_HOME: userInfo().homedir,
              AXM_TEST_RUNTIME_OPTIONS: `--preload=${poison}`,
              AXM_TEST_NO_TOOLS: noTools,
              AXM_TEST_QUERY_SCRATCH: queryScratch,
            },
            encoding: "utf8",
            timeout: 15_000,
            maxBuffer: 16_384,
            windowsHide: true,
            signal,
          }),
        catch: () => new AccountHomeWitnessError({ reason: "query-failed" }),
      });
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({ matchesAccount: true, parentEnvironmentUnchanged: true });
      expect(yield* fs.exists(sentinel)).toBe(false);
      expect(yield* fs.readDirectory(queryScratch)).toEqual([]);
      if (
        typeof output === "object" &&
        output !== null &&
        "milliseconds" in output &&
        typeof output.milliseconds === "number"
      )
        console.log(
          JSON.stringify({ query: "bundled-runtime", milliseconds: output.milliseconds }),
        );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
