import { HookFixtureResultSchema, type HookTestResult } from "@agentxm/workspace-kernel/operations";
/** Explicit execution of native hook fixtures. Static lifecycle operations never call this. */
import * as Clock from "effect/Clock";
import { arch, platform } from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { ChildProcess } from "effect/unstable/process";
import { writeFileAtomic, envOption } from "@agentxm/host-primitives";
import { readExtensionManifest } from "@agentxm/extension-content";
import {
  resolveHookConfiguration,
  type HookConfigurationValues,
  type HookValue,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  computePackageContentHash,
  WorkspaceLocation,
  hookConfigurationHash,
  hookReceiptFilename,
} from "@agentxm/workspace-kernel/workspace-state";
import { AuthoringFailed } from "../errors.js";

/** Limits apply independently to stdin, expected files, and each output stream. */
export const HOOK_TEST_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const failed = (detail: string) => new AuthoringFailed({ category: "validation", detail });

export const collectBounded = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Effect.gen(function* () {
    const decoder = new TextDecoder();
    const output = yield* Stream.runFoldEffect(
      stream,
      () => ({ text: "", bytes: 0 }),
      (state, chunk) => {
        const bytes = state.bytes + chunk.byteLength;
        return bytes > HOOK_TEST_MAX_BYTES
          ? Effect.fail(failed("Hook output exceeded the 1 MiB limit"))
          : Effect.succeed({ bytes, text: state.text + decoder.decode(chunk, { stream: true }) });
      },
    );
    return output.text + decoder.decode();
  });

/** A saved receipt describes this invocation only; native loading and future environment are unknown. */
export const TestHook = {
  run: Effect.fn("Hook.testFixtures")(function* (request: {
    readonly directory: string;
    readonly configuration?: HookConfigurationValues;
    readonly fixtures?: ReadonlyArray<string>;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const root = yield* fs.realPath(path.resolve(location.baseDir, request.directory));
    const { manifest } = yield* readExtensionManifest(root, "hook");
    if (manifest.type !== "hook") return yield* failed("The selected package is not a Hook");
    const resolved = resolveHookConfiguration(manifest, request.configuration ?? {});
    if (Result.isFailure(resolved))
      return yield* failed(
        resolved.failure.map((issue) => `${issue.key}: ${issue.message}`).join("; "),
      );
    const values = resolved.success;
    const fixtures = (manifest.fixtures ?? []).filter(
      (fixture) => request.fixtures === undefined || request.fixtures.includes(fixture.id),
    );
    if (fixtures.length === 0)
      return yield* failed(
        "No matching fixtures; declare fixtures in hook.json before running hooks test",
      );
    for (const id of request.fixtures ?? []) {
      if (!fixtures.some((fixture) => fixture.id === id))
        return yield* failed(`Unknown hook fixture: ${id}`);
    }
    const packageFile = (relative: string) =>
      Effect.gen(function* () {
        const absolute = yield* fs
          .realPath(path.resolve(root, relative))
          .pipe(
            Effect.mapError(() =>
              failed(
                `Hook test resource is unavailable: ${relative}. Distributed packages may omit fixtures; test the authoring source containing those files.`,
              ),
            ),
          );
        const contained = path.relative(root, absolute);
        if (
          contained.startsWith(`..${path.sep}`) ||
          contained === ".." ||
          path.isAbsolute(contained)
        ) {
          return yield* failed(`Hook resource escapes its package: ${relative}`);
        }
        const stat = yield* fs.stat(absolute);
        if (stat.type !== "File" || stat.size > BigInt(HOOK_TEST_MAX_BYTES)) {
          return yield* failed(
            `Hook fixture resource must be a file no larger than 1 MiB: ${relative}`,
          );
        }
        return absolute;
      });
    const read = (relative: string) =>
      packageFile(relative).pipe(Effect.flatMap(fs.readFileString));
    const environmentNames = new Set<string>(["PATH", "HOME", "TMPDIR", "SystemRoot", "PATHEXT"]);
    const value = (input: HookValue): Effect.Effect<string, AuthoringFailed> =>
      Effect.gen(function* () {
        if (typeof input === "string") return input;
        const configured = "config" in input ? values[input.config] : input;
        if (configured === undefined)
          return yield* failed(
            `Missing configuration value: ${"config" in input ? input.config : ""}`,
          );
        if (typeof configured !== "object") return String(configured);
        environmentNames.add(configured.env);
        const env = yield* envOption(configured.env).pipe(
          Effect.mapError(() => failed(`Cannot read environment reference ${configured.env}`)),
        );
        if (Option.isNone(env))
          return yield* failed(`Environment reference ${configured.env} is not set`);
        return env.value;
      });
    const startedAt = yield* Clock.currentTimeMillis;
    const contentHash = yield* computePackageContentHash(root);
    const configurationHash = hookConfigurationHash(values);
    const results: Array<typeof HookFixtureResultSchema.Type> = [];
    for (const fixture of fixtures) {
      const implementation = manifest.implementations.find(
        (candidate) => candidate.id === fixture.implementation,
      );
      const binding = implementation?.bindings.find(
        (candidate) => candidate.id === fixture.binding,
      );
      if (implementation === undefined || binding === undefined)
        return yield* failed(`Fixture ${fixture.id} references a missing binding`);
      const input = yield* read(fixture.input);
      // Fixtures describe native JSON requests; reject invalid JSON before launching executable code.
      yield* Effect.try({
        try: () => JSON.parse(input),
        catch: () => failed(`Fixture ${fixture.id} is not valid native JSON`),
      });
      const expectedOut =
        fixture.expect.stdout === undefined ? undefined : yield* read(fixture.expect.stdout);
      const expectedErr =
        fixture.expect.stderr === undefined ? undefined : yield* read(fixture.expect.stderr);
      const entrypoint = yield* packageFile(binding.handler.entrypoint);
      const argv = yield* Effect.forEach(binding.handler.args ?? [], value);
      const env: Record<string, string> = {};
      for (const name of ["PATH", "HOME", "TMPDIR", "SystemRoot", "PATHEXT"]) {
        const current = yield* envOption(name).pipe(
          Effect.mapError(() => failed(`Cannot read ${name} for hook execution`)),
        );
        if (Option.isSome(current)) env[name] = current.value;
      }
      for (const [name, inputValue] of Object.entries(binding.handler.env ?? {}))
        env[name] = yield* value(inputValue);
      const runtime = binding.handler.runtime === "python" ? "python3" : binding.handler.runtime;
      const timeout = Math.min(binding.handler.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
      const invocation = yield* Effect.scoped(
        Effect.gen(function* () {
          const child = yield* ChildProcess.make(runtime, [entrypoint, ...argv], {
            cwd: root,
            env,
            extendEnv: false,
            forceKillAfter: "1 second",
            stdin: Stream.make(new TextEncoder().encode(input)),
          });
          return yield* Effect.all(
            {
              exitCode: child.exitCode,
              stdout: collectBounded(child.stdout),
              stderr: collectBounded(child.stderr),
            },
            // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed child stdout/stderr/exit join prevents pipe deadlock
            { concurrency: "unbounded" },
          );
        }),
      ).pipe(
        Effect.timeout(timeout),
        Effect.mapError((error) =>
          failed(
            error._tag === "TimeoutError"
              ? `Hook fixture timed out after ${timeout} ms`
              : error instanceof AuthoringFailed
                ? error.detail
                : "Hook process could not run; verify the declared interpreter is available",
          ),
        ),
        Effect.result,
      );
      const observation = Result.isSuccess(invocation) ? invocation.success : undefined;
      const stdoutMatches =
        observation === undefined || expectedOut === undefined
          ? null
          : observation.stdout === expectedOut;
      const stderrMatches =
        observation === undefined || expectedErr === undefined
          ? null
          : observation.stderr === expectedErr;
      const passed =
        observation?.exitCode === fixture.expect.exitCode &&
        stdoutMatches !== false &&
        stderrMatches !== false;
      results.push({
        fixture: fixture.id,
        implementation: implementation.id,
        binding: binding.id,
        protocol: implementation.protocol,
        runtime,
        runtimeVersion: null,
        outcome: passed ? "passed" : "failed",
        expectedExitCode: fixture.expect.exitCode,
        observedExitCode: observation?.exitCode ?? null,
        stdoutMatches,
        stderrMatches,
        detail: Result.isFailure(invocation)
          ? invocation.failure.detail
          : passed
            ? "Expected exit and declared output matched"
            : "Exit or declared output differed; raw output is omitted to protect consumer secrets",
      });
    }
    const afterHash = yield* computePackageContentHash(root);
    if (afterHash !== contentHash)
      return yield* failed(
        "Hook execution changed package content; no current-content receipt was written",
      );
    const completedAt = yield* Clock.currentTimeMillis;
    const directory = path.join(location.runtimeDir, "hook-tests");
    const receiptPath = path.join(directory, hookReceiptFilename(root));
    const result: HookTestResult = {
      kind: "fixture-execution",
      package: `${manifest.owner}/hooks/${manifest.name}`,
      version: manifest.version,
      contentHash,
      configurationHash,
      startedAt,
      completedAt,
      cwd: "package-root",
      scope: location.scope,
      platform: { os: platform(), architecture: arch() },
      environment: [...environmentNames].sort(),
      environmentFreshness: "historical-only",
      nativeInvocation: "not-observed",
      sandboxed: false,
      fixtures: results,
      passed: results.every((fixture) => fixture.outcome === "passed"),
      receiptPath,
    };
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* writeFileAtomic(fs, {
      targetPath: receiptPath,
      content: `${JSON.stringify(result, null, 2)}\n`,
      mode: 0o600,
      mapError: () => failed("Could not write local hook execution receipt"),
    });
    return result;
  }),
};
