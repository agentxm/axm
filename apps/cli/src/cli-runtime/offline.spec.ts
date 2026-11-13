import * as NodeServices from "@effect/platform-node/NodeServices";
import { TelemetryClient, TelemetryClientLive } from "../telemetry/client.js";
import {
  UpdateCheckCache,
  LatestReleaseCheck,
} from "@agentxm/cli-maintenance/self-update/application";
import { withUpdateCheck } from "../update-check-startup.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import { LocalTraceExporter, withLocalTracing } from "./local-tracing.js";
import { NetworkDisabled } from "@agentxm/host-primitives";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as FileSystem from "effect/FileSystem";
import { RegistryHttpClient } from "@agentxm/registry-client";
import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
import {
  PlatformLayer,
  makeRegistryHttpClientLayer,
  makeArtifactHttpClientLayer,
} from "../runtime.js";
import { offlineFromArgv, offlineHttpClient } from "./offline.js";

it.effect(
  "offline refuses every composed HTTP transport and subprocess while retaining filesystem access",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let dispatches = 0;
        const fetch: typeof globalThis.fetch = Object.assign(
          async () => {
            dispatches += 1;
            return new Response("unexpected");
          },
          { preconnect: globalThis.fetch.preconnect },
        );
        yield* Effect.gen(function* () {
          for (const client of [
            yield* HttpClient.HttpClient,
            yield* RegistryHttpClient,
            yield* ArtifactHttpClient,
          ]) {
            const result = yield* Effect.result(client.get("https://offline.example.test/content"));
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure.reason).toMatchObject({
                _tag: "TransportError",
                cause: { _tag: "RegistryRequestFailed", reason: "network-required" },
              });
          }
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const spawned = yield* Effect.result(
            spawner.spawn(ChildProcess.make(process.execPath, ["-e", "process.exit(0)"])),
          );
          expect(Result.isFailure(spawned)).toBe(true);
          if (Result.isFailure(spawned))
            expect(spawned.failure.reason).toMatchObject({ _tag: "PermissionDenied" });
          const fs = yield* FileSystem.FileSystem;
          const file = yield* fs.makeTempFileScoped();
          yield* fs.writeFileString(file, "local work");
          expect(yield* fs.readFileString(file)).toBe("local work");
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              PlatformLayer,
              makeRegistryHttpClientLayer(fetch),
              makeArtifactHttpClientLayer(fetch),
            ),
          ),
        );
        expect(dispatches).toBe(0);
      }),
    ).pipe(Effect.provideService(NetworkDisabled, true)),
);

it.effect("ordinary invocations retain HTTP dispatch", () =>
  Effect.gen(function* () {
    let requests = 0;
    const client = offlineHttpClient(
      HttpClient.make((request) =>
        Effect.sync(() => {
          requests += 1;
          return HttpClientResponse.fromWeb(request, new Response("online"));
        }),
      ),
    );
    expect(
      yield* client.get("https://example.test").pipe(Effect.flatMap((response) => response.text)),
    ).toBe("online");
    expect(requests).toBe(1);
  }),
);

it("reads offline before startup and respects the argument terminator", () => {
  expect(offlineFromArgv(["list", "--offline"])).toBe(true);
  expect(offlineFromArgv(["list", "--offline=false"])).toBe(false);
  expect(offlineFromArgv(["list", "--offline", "--no-offline"])).toBe(false);
  expect(offlineFromArgv(["list", "--", "--offline"])).toBe(false);
});

export const specification = defineSpecification({
  requirement: "cli/network/offline-prohibits-network",
  title: "Offline invocations prohibit network activity",
  statement:
    "When --offline is enabled, AXM shall prohibit invocation-initiated network requests, authentication listeners, background network work and arbitrary subprocess execution without enforced network isolation, while retaining local filesystem operations and refusing remote access requirements explicitly.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "machine-automation"],
  boundary: "platform",
  boundaryRationale:
    "The production transport and subprocess Layers run over native local files; controlled HTTP transports observe dispatch refusal.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These examples do not establish separate-process or compiled-binary network silence across every command family.",
      retirementCondition:
        "Process-level scenarios independently observe network and subprocess activity for local, remote-cache, authentication and background paths.",
    },
  ],
});

it.effect("offline suppresses explicitly requested trace export", () =>
  withLocalTracing(Effect.succeed("local result"), {
    AXM_TRACE: "1",
    AXM_TRACE_ENDPOINT: "http://127.0.0.1:4318",
  }).pipe(
    Effect.provideService(NetworkDisabled, true),
    Effect.provideService(LocalTraceExporter, () => {
      throw new Error("Offline must not construct an exporter");
    }),
    Effect.map((value) => expect(value).toBe("local result")),
  ),
);

it.effect("offline suppresses release checks before cache or transport work", () => {
  let attempts = 0;
  const unexpected = Effect.sync(() => {
    attempts += 1;
  }).pipe(Effect.andThen(Effect.die("Unexpected release work")));
  return withUpdateCheck(Effect.succeed("local result"), {
    localVersion: "1.0.0",
    inputs: {
      args: ["list", "--offline"],
      isNonInteractive: false,
      isJsonOutput: false,
      isStderrTTY: true,
      isAgentSession: false,
      noUpdateCheckEnv: false,
    },
  }).pipe(
    Effect.provideService(UpdateCheckCache, { read: () => unexpected, write: () => unexpected }),
    Effect.provideService(LatestReleaseCheck, { check: () => unexpected }),
    Effect.provide(TestRenderer.make().layer),
    Effect.provideService(NetworkDisabled, true),
    Effect.map((value) => {
      expect(value).toBe("local result");
      expect(attempts).toBe(0);
    }),
  );
});

it.effect("offline disables telemetry even with explicit delivery consent", () => {
  let requests = 0;
  let detections = 0;
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      requests += 1;
      return HttpClientResponse.fromWeb(request, new Response("{}"));
    }),
  );
  return Effect.scoped(
    Effect.gen(function* () {
      const telemetry = yield* TelemetryClient;
      yield* telemetry.trackEvent("cli_command", { command: "list" });
    }).pipe(
      Effect.provide(
        TelemetryClientLive({
          mode: "all",
          client: { name: "axm", version: "1.0.0" },
          deliverInTest: true,
          detectCaller: Effect.sync(() => {
            detections += 1;
          }).pipe(Effect.andThen(Effect.die("Unexpected caller detection"))),
        }).pipe(
          Layer.provide(
            Layer.merge(NodeServices.layer, Layer.succeed(HttpClient.HttpClient, transport)),
          ),
        ),
      ),
    ),
  ).pipe(
    Effect.provideService(NetworkDisabled, true),
    Effect.map(() => {
      expect(requests).toBe(0);
      expect(detections).toBe(0);
    }),
  );
});
