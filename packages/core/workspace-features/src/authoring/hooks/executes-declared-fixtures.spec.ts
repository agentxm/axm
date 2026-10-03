import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as ConfigProvider from "effect/ConfigProvider";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  readHookEvidence,
  WorkspaceLocation,
  computePackageContentHash,
} from "@agentxm/workspace-kernel/workspace-state";
import { TestHook } from "../index.js";
import { HookManager } from "@agentxm/workspace-kernel/materialization";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/test/executes-declared-fixtures",
  title: "Explicit fixture execution produces bounded, attributable evidence",
  statement:
    "When a person explicitly tests a Hook package, AXM shall execute only selected declared fixtures with bounded input, output, and duration; compare declared exit codes and output; omit raw process output from receipts; and record fixture evidence separately from native host invocation. Unknown fixture selection and invalid native JSON shall be refused before executing that fixture.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "safe-repetition"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Real child processes demonstrate exit status, output, deadlines, and persisted receipts.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit Hook fixture execution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const arrange = (
    script: string,
    options: {
      readonly exitCode?: number;
      readonly timeoutMs?: number;
      readonly input?: string;
    } = {},
  ) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(workspace.cleanup);
    workspace.write(
      "hooks/audit/hook.json",
      JSON.stringify({
        owner: "@acme",
        type: "hook",
        name: "audit",
        version: "1.0.0",
        implementations: [
          {
            id: "claude",
            protocol: "claude-code",
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                handler: {
                  type: "command",
                  runtime: "node",
                  entrypoint: "src/hook.cjs",
                  ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
                },
              },
            ],
          },
        ],
        fixtures: [
          {
            id: "selected",
            implementation: "claude",
            binding: "audit",
            input: "fixtures/input.json",
            expect: {
              exitCode: options.exitCode ?? 0,
              stdout: "fixtures/stdout.txt",
              stderr: "fixtures/stderr.txt",
            },
          },
        ],
      }),
    );
    workspace.write("hooks/audit/src/hook.cjs", script);
    workspace.write(
      "hooks/audit/fixtures/input.json",
      options.input ?? '{"hook_event_name":"PreToolUse"}',
    );
    workspace.write("hooks/audit/fixtures/stdout.txt", "expected\n");
    workspace.write("hooks/audit/fixtures/stderr.txt", "");
    return workspace;
  };

  for (const row of [
    {
      name: "declared nonzero exit",
      script: 'console.log("expected"); process.exitCode = 2;',
      exitCode: 2,
      passed: true,
      detail: "Expected exit",
    },
    {
      name: "unexpected exit",
      script: 'console.log("expected"); process.exitCode = 3;',
      exitCode: 0,
      passed: false,
      detail: "Exit or declared output differed",
    },
    {
      name: "output mismatch",
      script: 'console.log("private-output-marker");',
      exitCode: 0,
      passed: false,
      detail: "Exit or declared output differed",
    },
    {
      name: "output cap",
      script: 'process.stdout.write("x".repeat(1024 * 1024 + 1));',
      exitCode: 0,
      passed: false,
      detail: "1 MiB limit",
    },
    {
      name: "deadline",
      script: "setInterval(() => {}, 1000);",
      exitCode: 0,
      passed: false,
      detail: "timed out",
      timeoutMs: 100,
    },
  ]) {
    it.live(`records ${row.name} without overstating native evidence`, () => {
      const workspace = arrange(row.script, row);
      return Effect.gen(function* () {
        const before = workspace.snapshot("hooks/audit");
        const result = yield* TestHook.run({ directory: "hooks/audit", fixtures: ["selected"] });
        expect(result.passed).toBe(row.passed);
        expect(result.fixtures).toHaveLength(1);
        expect(result.fixtures[0]?.detail).toContain(row.detail);
        expect(result).toMatchObject({
          nativeInvocation: "not-observed",
          environmentFreshness: "historical-only",
          sandboxed: false,
          package: "@acme/hooks/audit",
          version: "1.0.0",
        });
        expect(result.contentHash).not.toBe("");
        const fs = yield* FileSystem.FileSystem;
        const receipt = yield* fs.readFileString(result.receiptPath);
        expect(JSON.parse(receipt)).toEqual(result);
        expect(receipt).not.toContain("private-output-marker");
        expect(workspace.snapshot("hooks/audit")).toEqual(before);
      }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
    });
  }

  for (const invalid of ["unknown-selection", "invalid-json", "omitted-fixture"] as const) {
    it.live(`refuses ${invalid} without execution or receipt`, () => {
      const workspace = arrange('require("node:fs").writeFileSync("../executed", "yes");', {
        input: invalid === "invalid-json" ? "invalid" : "{}",
      });
      return Effect.gen(function* () {
        if (invalid === "omitted-fixture") {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.remove(`${workspace.root}/hooks/audit/fixtures/input.json`);
        }
        const before = workspace.snapshot();
        const error = yield* TestHook.run({
          directory: "hooks/audit",
          fixtures: [invalid === "unknown-selection" ? "missing" : "selected"],
        }).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: "AuthoringFailed" });
        if (invalid === "omitted-fixture")
          expect(error).toMatchObject({ detail: expect.stringContaining("fixtures/input.json") });
        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.exists("hooks/executed")).toBe(false);
      }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
    });
  }

  it.live("interrupts the process group and stops a signal-resistant descendant", () => {
    const workspace = arrange(
      `
require("node:child_process").spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => require("node:fs").appendFileSync("../heartbeat", "x"), 20);'], { stdio: "ignore" });
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
      { timeoutMs: 10_000 },
    );
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const fiber = yield* TestHook.run({ directory: "hooks/audit" }).pipe(Effect.forkChild);
      yield* Effect.gen(function* () {
        while (!(yield* fs.exists(`${workspace.root}/hooks/heartbeat`)))
          yield* Effect.sleep("20 millis");
      }).pipe(Effect.timeout("10 seconds"));
      yield* Fiber.interrupt(fiber);
      const stopped = yield* fs.readFileString(`${workspace.root}/hooks/heartbeat`);
      yield* Effect.sleep("100 millis");
      expect(yield* fs.readFileString(`${workspace.root}/hooks/heartbeat`)).toBe(stopped);
      const location = yield* WorkspaceLocation;
      expect(yield* fs.exists(`${location.runtimeDir}/hook-tests`)).toBe(false);
    }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
  });

  it.live("reports a missing interpreter without pretending the hook ran", () => {
    const workspace = arrange('require("node:fs").writeFileSync("../executed", "yes");');
    return Effect.gen(function* () {
      const result = yield* TestHook.run({ directory: "hooks/audit" }).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PATH: "" } }))),
      );
      expect(result.passed).toBe(false);
      expect(result.fixtures[0]).toMatchObject({
        outcome: "failed",
        observedExitCode: null,
        detail: expect.stringContaining("interpreter"),
      });
      expect(workspace.exists("hooks/executed")).toBe(false);
    }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
  });

  it.live("distinguishes matching historical receipts, stale inputs, and invalid evidence", () => {
    const workspace = arrange('console.log("expected");');
    return Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const packageRoot = `${workspace.root}/hooks/audit`;
      const result = yield* TestHook.run({ directory: "hooks/audit" });
      const input = {
        runtimeDir: location.runtimeDir,
        packageRoot,
        contentHash: result.contentHash,
        configurationHash: result.configurationHash,
        scope: location.scope,
      };
      expect(yield* readHookEvidence(input)).toMatchObject({
        state: "historical",
        receipt: { nativeInvocation: "not-observed" },
      });
      expect(
        yield* readHookEvidence({ ...input, configurationHash: "changed-configuration" }),
      ).toMatchObject({ state: "stale" });
      expect(yield* readHookEvidence({ ...input, scope: "user" })).toMatchObject({
        state: "stale",
      });
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        result.receiptPath,
        JSON.stringify({ ...result, platform: { ...result.platform, os: "other-platform" } }),
      );
      expect(yield* readHookEvidence(input)).toMatchObject({ state: "stale" });
      yield* fs.writeFileString(result.receiptPath, JSON.stringify(result));
      workspace.write("hooks/audit/src/hook.cjs", 'console.log("changed");');
      const changedHash = yield* computePackageContentHash(packageRoot);
      expect(yield* readHookEvidence({ ...input, contentHash: changedHash })).toMatchObject({
        state: "stale",
      });
      yield* fs.writeFileString(result.receiptPath, "invalid");
      expect(yield* readHookEvidence(input)).toMatchObject({ state: "invalid" });
      yield* fs.remove(result.receiptPath);
      expect(yield* readHookEvidence(input)).toMatchObject({ state: "absent" });
    }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
  });

  it.live(
    "includes historical and stale fixture evidence in shared configured-agent outcomes",
    () => {
      const workspace = arrange('console.log("expected");');
      workspace.writeSettings({
        owner: "@acme",
        agents: ["claude-code"],
        hooks: { audit: { source: "workspace", enabled: true } },
      });
      return Effect.gen(function* () {
        yield* TestHook.run({ directory: "hooks/audit" });
        const manager = yield* HookManager;
        const outcomes = manager.configuredAgentOutcomes;
        if (outcomes === undefined)
          throw new Error("Hook manager must expose configured-agent outcomes");
        const historical = yield* outcomes("current");
        expect(historical).toMatchObject([
          {
            hook: {
              fixtureEvidence: {
                state: "historical",
                receipt: { passed: true, nativeInvocation: "not-observed" },
              },
            },
          },
        ]);
        workspace.write("hooks/audit/src/hook.cjs", 'console.log("changed");');
        const stale = yield* outcomes("current");
        expect(stale).toMatchObject([{ hook: { fixtureEvidence: { state: "stale" } } }]);
      }).pipe(Effect.provide(authoringWorkspaceLayer(workspace)));
    },
  );
});
