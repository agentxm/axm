import { downloadHttpArtifact } from "@agentxm/workspace-kernel/sources";
import { CanonicalNativePath } from "@agentxm/workspace-kernel/locations";
import { CanonicalNativePathLive } from "@agentxm/workspace-kernel/locations/live";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { afterEach, beforeEach, onTestFinished, vi } from "vitest";
import {
  getBuiltInSources,
  PlatformLayer,
  makeArtifactHttpClientLayer,
  resolveExecutionDirectory,
  makeCliLoggerLayer,
  makeRegistryHttpClientLayer,
  withAxmFetchPolicy,
  withAxmUserAgent,
  withWorkspace,
} from "./runtime.js";
import { makeWorkspaceHandlerTestContext } from "./test-support/test-helpers.js";
import { ExecutionDirectory } from "./execution-directory.js";
import { makeTestScreen } from "./test-support/test-screen.js";
import { localTracingCollector } from "./test-support/local-tracing-collector.js";
import { withLocalTracing } from "./cli-runtime/index.js";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { RegistryHttpClient, RegistryRequestAttempt } from "@agentxm/registry-client";

describe("Local subprocess traces", () => {
  it.live("records one real spawn without exposing command arguments or output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        const secret = "PRIVATE-subprocess-argument";
        const program = Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          return yield* spawner.string(
            ChildProcess.make(process.execPath, ["-e", `process.stdout.write('${secret}')`]),
          );
        }).pipe(Effect.provide(PlatformLayer));
        expect(
          yield* withLocalTracing(program, {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
          }),
        ).toBe(secret);
        const spans = receiver.spans();
        const root = spans.find((span) => span.name === "axm.cli.invocation");
        const work = spans.filter((span) => span.name === "axm.process.spawn");
        expect(work).toHaveLength(1);
        const lifetime = spans.find((span) => span.name === "axm.process.run");
        expect(lifetime?.parentSpanId).toBe(root?.spanId);
        expect(work[0]?.parentSpanId).toBe(lifetime?.spanId);
        expect(receiver.bodies.join("")).not.toContain(secret);
        expect(receiver.bodies.join("")).not.toContain(process.execPath);
      }),
    ),
  );
});

describe("Transport trace ownership", () => {
  it.live("counts one actual exchange through composed client wrappers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        let exchanges = 0;
        const fetch = Object.assign(
          async () => {
            exchanges += 1;
            return new Response("payload", { status: 200 });
          },
          { preconnect: globalThis.fetch.preconnect },
        );
        const program = Effect.gen(function* () {
          const base = yield* RegistryHttpClient;
          const composed = withAxmUserAgent(withAxmUserAgent(base, "1.0.0"), "1.0.1");
          return yield* composed
            .get("https://private.invalid/package?token=secret")
            .pipe(Effect.flatMap((response) => response.text));
        }).pipe(Effect.provide(makeRegistryHttpClientLayer(fetch)));
        expect(
          yield* withLocalTracing(program, {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
          }),
        ).toBe("payload");
        expect(exchanges).toBe(1);
        expect(receiver.spans().filter((span) => span.name === "axm.http.request")).toHaveLength(
          exchanges,
        );
        expect(receiver.bodies.join("")).not.toContain("private.invalid");
        expect(receiver.bodies.join("")).not.toContain("secret");
      }),
    ),
  );
});

describe("getBuiltInSources", () => {
  it("defines only the built-in registry because Git locators are self-describing", () => {
    expect(getBuiltInSources()).toEqual([
      {
        name: "agentxm",
        type: "registry",
        location: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
      },
    ]);
  });
});

describe("withAxmUserAgent", () => {
  it.effect("adds the CLI name and version to every request", () =>
    Effect.gen(function* () {
      let observedUserAgent: string | undefined;
      const client = withAxmUserAgent(
        HttpClient.make((request) =>
          Effect.sync(() => {
            observedUserAgent = request.headers["user-agent"];
            return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }));
          }),
        ),
        "1.2.3",
      );

      yield* client.execute(HttpClientRequest.get("https://registry.example.test"));

      expect(observedUserAgent).toBe("axm-cli/1.2.3");
    }),
  );
});

describe("withAxmFetchPolicy", () => {
  it("prevents release discovery from following redirects to another origin", async () => {
    const fetchImplementation = Object.assign(
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
      { preconnect: vi.fn() },
    );
    const fetchWithPolicy = withAxmFetchPolicy(fetchImplementation);

    await fetchWithPolicy("https://releases.axm.sh/latest.txt", { cache: "no-store" });
    await fetchWithPolicy("https://registry.agentxm.ai/v1/extensions", { cache: "reload" });

    await fetchWithPolicy("https://api.github.com/repos/agentxm/axm", {
      redirect: "follow",
      credentials: "include",
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(3, expect.anything(), {
      redirect: "error",
      credentials: "omit",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(1, expect.anything(), {
      cache: "no-store",
      redirect: "manual",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(2, expect.anything(), {
      cache: "reload",
    });
  });
});

describe("makeCliLoggerLayer", () => {
  it.effect("routes debug diagnostics through Screen", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();

      yield* Effect.logDebug("machine-safe debug message").pipe(
        Effect.provide(Layer.provide(makeCliLoggerLayer("debug"), screen.layer)),
      );

      expect(screen.state.logs).toEqual([
        { level: "debug", message: "machine-safe debug message" },
      ]);
    }),
  );

  it.effect("emits warnings but suppresses debug diagnostics at normal verbosity", () =>
    Effect.gen(function* () {
      const screen = makeTestScreen();

      yield* Effect.gen(function* () {
        yield* Effect.logDebug("hidden debug message");
        yield* Effect.logWarning("visible warning message");
      }).pipe(Effect.provide(Layer.provide(makeCliLoggerLayer("normal"), screen.layer)));

      expect(screen.state.logs).toEqual([{ level: "warn", message: "visible warning message" }]);
    }),
  );
});

describe("resolveExecutionDirectory", () => {
  let tempDir: string;
  let referent: string;
  let link: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "runtime-execution-dir-")));
    referent = path.join(tempDir, "referent");
    link = path.join(tempDir, "link");
    fs.mkdirSync(referent);
    fs.symlinkSync(referent, link, "dir");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  type Port = (target: string) => Effect.Effect<string | undefined>;

  /** Resolve once over a recording filesystem, counting realPath and canonical-spelling port calls. */
  const resolveCounting = (selected: string, port: Port | undefined) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      let portCalls = 0;
      const counted =
        port === undefined
          ? undefined
          : (target: string) =>
              Effect.suspend(() => {
                portCalls += 1;
                return port(target);
              });
      recording.reset();
      const result = yield* resolveExecutionDirectory(selected).pipe(
        Effect.provideService(CanonicalNativePath, counted),
        Effect.result,
      );
      return {
        result,
        realPaths: recording.calls({ method: "realPath" }).length,
        portCalls,
      };
    }).pipe(
      Effect.provide(Layer.merge(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
    );

  it.effect("follows one strict realPath when the canonical port spells the directory", () =>
    Effect.gen(function* () {
      const observed = yield* resolveCounting(link, (target) => Effect.succeed(target));
      expect(observed.result).toMatchObject({ _tag: "Success", success: { path: referent } });
      expect(observed.realPaths).toBe(1);
      expect(observed.portCalls).toBe(1);

      process.chdir(tempDir);
      const relative = yield* resolveCounting("link", (target) => Effect.succeed(target));
      expect(relative.result).toMatchObject({ _tag: "Success", success: { path: referent } });
      expect(relative.realPaths).toBe(1);
      expect(relative.portCalls).toBe(1);
    }),
  );

  it.effect("re-resolves through the listing walk when the port cannot spell the directory", () =>
    Effect.gen(function* () {
      const observed = yield* resolveCounting(link, () => Effect.succeed(undefined));
      expect(observed.result).toMatchObject({ _tag: "Success", success: { path: referent } });
      expect(observed.realPaths).toBe(2);
      expect(observed.portCalls).toBe(1);
    }),
  );

  it.effect("re-resolves through the listing walk on hosts without a canonical port", () =>
    Effect.gen(function* () {
      const observed = yield* resolveCounting(link, undefined);
      expect(observed.result).toMatchObject({ _tag: "Success", success: { path: referent } });
      expect(observed.realPaths).toBe(2);
      expect(observed.portCalls).toBe(0);
    }),
  );

  it.effect("refuses a missing selection before asking the port", () =>
    Effect.gen(function* () {
      const observed = yield* resolveCounting(path.join(tempDir, "missing"), (target) =>
        Effect.succeed(target),
      );
      expect(observed.result).toMatchObject({ _tag: "Failure", failure: { code: "usage" } });
      expect(observed.realPaths).toBe(1);
      expect(observed.portCalls).toBe(0);
    }),
  );

  const resolveLive = (selected: string) =>
    resolveExecutionDirectory(selected).pipe(
      Effect.flip,
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, CanonicalNativePathLive)),
    );

  const expectUsage = (error: unknown, selected: string, causeTag: string) => {
    expect(error).toMatchObject({
      _tag: "AppError",
      code: "usage",
      detail: `Could not run from the selected directory '${selected}'.`,
    });
    expect(error).toHaveProperty("cause");
    if (causeTag === "Error") {
      expect(error).toMatchObject({
        cause: new Error("The selected path is not a directory."),
      });
    } else {
      expect(error).toMatchObject({ cause: { _tag: causeTag } });
    }
  };

  it.effect("refuses missing and dangling selections with the strict realPath failure", () =>
    Effect.gen(function* () {
      const missing = path.join(tempDir, "missing");
      expectUsage(yield* resolveLive(missing), missing, "PlatformError");

      const dangling = path.join(tempDir, "dangling");
      fs.symlinkSync(path.join(tempDir, "gone"), dangling, "dir");
      expectUsage(yield* resolveLive(dangling), dangling, "PlatformError");
    }),
  );

  it.effect("refuses a file selection as not a directory", () =>
    Effect.gen(function* () {
      const file = path.join(tempDir, "file");
      fs.writeFileSync(file, "");
      expectUsage(yield* resolveLive(file), file, "Error");
    }),
  );

  it.effect.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "refuses selections whose path or contents cannot be traversed",
    () =>
      Effect.gen(function* () {
        const locked = path.join(tempDir, "locked");
        const beneath = path.join(locked, "beneath");
        fs.mkdirSync(beneath, { recursive: true });
        fs.chmodSync(locked, 0o000);
        try {
          expectUsage(yield* resolveLive(beneath), beneath, "PlatformError");
          expectUsage(yield* resolveLive(locked), locked, "PlatformError");
        } finally {
          fs.chmodSync(locked, 0o700);
        }
      }),
  );

  it.effect("leaves the workspace location to resolve its own root freshly", () =>
    Effect.gen(function* () {
      const project = path.join(referent, "project");
      fs.mkdirSync(path.join(project, ".axm"), { recursive: true });
      fs.writeFileSync(path.join(project, "axm.json"), JSON.stringify({ agents: [] }));
      fs.writeFileSync(path.join(project, "axm.lock"), "version = 1\n");
      const userHome = path.join(tempDir, "home");
      fs.mkdirSync(path.join(userHome, ".axm"), { recursive: true });
      const originalHome = process.env["HOME"];
      process.env["HOME"] = userHome;
      process.chdir(project);
      onTestFinished(() => {
        if (originalHome === undefined) delete process.env["HOME"];
        else process.env["HOME"] = originalHome;
      });
      const recorded: Array<string> = [];
      let portCalls = 0;
      const recordingLayer = Layer.effect(
        FileSystem.FileSystem,
        Effect.map(FileSystem.FileSystem, (base) =>
          FileSystem.make({
            ...base,
            realPath: (target) =>
              Effect.suspend(() => {
                recorded.push(target);
                return base.realPath(target);
              }),
          }),
        ),
      );
      const testContext = makeWorkspaceHandlerTestContext({ fileSystemLayer: recordingLayer });
      const live = yield* CanonicalNativePath.pipe(Effect.provide(CanonicalNativePathLive));
      const port = (target: string) =>
        Effect.suspend(() => {
          portCalls += 1;
          return live === undefined ? Effect.succeed(undefined) : live(target);
        });
      yield* Effect.gen(function* () {
        const executionDirectory = yield* resolveExecutionDirectory(path.join(link, "project"));
        expect(executionDirectory.path).toBe(project);
        recorded.length = 0;
        portCalls = 0;
        yield* withWorkspace("project")(Effect.void).pipe(
          Effect.provideService(ExecutionDirectory, executionDirectory),
        );
      }).pipe(
        Effect.provideService(CanonicalNativePath, port),
        Effect.provide(testContext.baseLayer),
      );
      expect(recorded).toContain(project);
      expect(portCalls).toBeGreaterThanOrEqual(1);
    }),
  );
});

describe("withWorkspace settings gate", () => {
  /**
   * Internal evidence for the executable specification
   * `cli/invalid-workspace-state-gates-operations`, including its
   * workspace-construction-gate claims.
   */
  let tempDir: string;
  let projectDir: string;
  let userHome: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-settings-gate-"));
    projectDir = path.join(tempDir, "project");
    userHome = path.join(tempDir, "home");
    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.mkdirSync(path.join(userHome, ".axm"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "axm.json"), JSON.stringify({ agents: [] }));
    fs.writeFileSync(path.join(projectDir, "axm.lock"), "version = 1\n");
    process.chdir(projectDir);
    process.env["HOME"] = userHome;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const invalidSources = [
    { owner: "project", path: () => path.join(projectDir, "axm.json") },
    { owner: "user", path: () => path.join(userHome, ".axm", "workspace", "axm.json") },
  ] as const;

  for (const source of invalidSources) {
    it.effect(`does not evaluate the command when ${source.owner} settings are invalid`, () =>
      Effect.gen(function* () {
        fs.mkdirSync(path.dirname(source.path()), { recursive: true });
        fs.writeFileSync(source.path(), "{ not-json");
        let commandEvaluated = false;
        const testContext = makeWorkspaceHandlerTestContext();

        const error = yield* withWorkspace("project")(
          Effect.sync(() => {
            commandEvaluated = true;
          }),
        ).pipe(Effect.provide(testContext.baseLayer), Effect.flip);

        // The settings gate fails with the typed parse error, which the
        // workspace boundary reports as its envelope for the workspace's scope.
        expect(error).toMatchObject({ _tag: "AppError", code: "validation" });
        expect(error).toMatchObject({ detail: expect.stringContaining("not valid JSON") });
        expect(commandEvaluated).toBe(false);
      }),
    );
  }
});

describe("artifact transport policy", () => {
  it.effect("uses credential-free manual redirects through the runtime-owned Fetch client", () =>
    Effect.gen(function* () {
      const fetchImplementation = Object.assign(
        vi.fn(() => Promise.resolve(new Response("original bytes"))),
        { preconnect: vi.fn() },
      );
      const result = yield* downloadHttpArtifact(new URL("https://example.test/SKILL.md")).pipe(
        Effect.provide(makeArtifactHttpClientLayer(fetchImplementation)),
      );
      expect(new TextDecoder().decode(result.bytes)).toBe("original bytes");
      expect(fetchImplementation).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          redirect: "manual",
          credentials: "omit",
          headers: expect.not.objectContaining({
            authorization: expect.anything(),
            cookie: expect.anything(),
          }),
        }),
      );
    }),
  );
});

describe("Registry transport policy", () => {
  it.effect("leaves redirects unfollowed so every Registry client can refuse them", () =>
    Effect.gen(function* () {
      const fetchImplementation = Object.assign(
        vi.fn(() =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: "https://elsewhere.example.test/v1/extensions" },
            }),
          ),
        ),
        { preconnect: vi.fn() },
      );
      const client = yield* RegistryHttpClient.pipe(
        Effect.provide(makeRegistryHttpClientLayer(fetchImplementation)),
      );
      const response = yield* client.execute(
        HttpClientRequest.get("https://registry.example.test/v1/extensions"),
      );
      expect(response.status).toBe(302);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(fetchImplementation).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ redirect: "manual" }),
      );
    }),
  );
});

for (const replaySafe of [false, true]) {
  it.effect(
    `Registry fetch transport honors replay safety (${replaySafe}) and redirect refusal`,
    () =>
      Effect.gen(function* () {
        const fetchImplementation = Object.assign(
          vi.fn(() => Promise.resolve(new Response("{}"))),
          { preconnect: vi.fn() },
        );
        const client = yield* RegistryHttpClient.pipe(
          Effect.provide(makeRegistryHttpClientLayer(fetchImplementation)),
        );
        yield* client.post("https://registry.example.test/v1/action").pipe(
          Effect.provideService(RegistryRequestAttempt, {
            n: 1,
            of: 1,
            requestId: "fixture",
            replaySafe,
            observeResponse: () => Effect.void,
          }),
        );
        expect(fetchImplementation).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.objectContaining({ keepalive: replaySafe, redirect: "manual" }),
        );
      }),
  );
}
