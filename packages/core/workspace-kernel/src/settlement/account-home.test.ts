import { withDetailedWork } from "../locations/testing.js";
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import { accountHome } from "./account-home.js";

const execute = promisify(execFile);
class AccountHomeWitnessError extends Data.TaggedError("AccountHomeWitnessError")<{
  readonly reason: "query-failed";
}> {}
const program = String.raw`
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Tracer from "effect/Tracer";
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
const spans = [];
const tracer = Tracer.make({ span(options) {
  const span = new Tracer.NativeSpan(options);
  spans.push(span);
  return span;
} });
const home = await Effect.runPromise(accountHome.pipe(Effect.provide(NodeServices.layer), Effect.withTracer(tracer)));
const subprocess = spans.filter(span => span.name === "axm.process.account-home");
console.log(JSON.stringify({
  matchesAccount: home === process.env.AXM_TEST_ACCOUNT_HOME,
  parentEnvironmentUnchanged: before === JSON.stringify(names.map(name => process.env[name])),
  milliseconds: performance.now() - started,
  subprocessSpans: subprocess.length,
  subprocessEnded: subprocess.every(span => span.status._tag === "Ended" && span.status.exit._tag === "Success"),
  subprocessExecutions: subprocess.map(span => span.attributes.get("axm.work.executed")),
  privateHomeAbsent: !JSON.stringify(subprocess.map(span => [...span.attributes])).includes(home),
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
      expect(output).toMatchObject({
        matchesAccount: true,
        parentEnvironmentUnchanged: true,
        subprocessSpans: 1,
        subprocessEnded: true,
        subprocessExecutions: [1],
        privateHomeAbsent: true,
      });
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

it.effect("observes Node's account lookup without exposing the account address", () =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const home = yield* accountHome.pipe(withDetailedWork(tracer));
    expect(home).toBe(userInfo().homedir);
    const lookup = spans.filter((span) => span.name === "axm.native.account-home");
    expect(lookup).toHaveLength(1);
    expect(lookup[0]?.attributes.get("axm.work.executed")).toBe(1);
    expect(lookup[0]?.status._tag === "Ended" && lookup[0].status.exit._tag).toBe("Success");
    expect(JSON.stringify(lookup.map((span) => [...span.attributes]))).not.toContain(home);
    expect(spans.filter((span) => span.name === "axm.process.account-home")).toEqual([]);
  }).pipe(Effect.provide(NodeServices.layer)),
);
