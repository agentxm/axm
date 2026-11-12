import * as Data from "effect/Data";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { expect, it } from "@effect/vitest";
import { startDeviceAuthServer, startHttpRegistry } from "@agentxm/client-e2e-utils/registry";
import {
  benchmarkBindAddress,
  benchmarkTraffic,
  type FixtureRequestObservation,
  startBenchmarkDeviceAuthServer,
  startBenchmarkRegistry,
} from "../benchmarks/cli-operations/http-fixture.js";
import { benchmarkProcessEnvironment } from "../benchmarks/process-environment.js";

class HttpFixtureTestFailed extends Data.TaggedError("HttpFixtureTestFailed")<{
  readonly cause: unknown;
}> {}

const observe = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new HttpFixtureTestFailed({ cause }) });

const userAgent = "axm-cli/http-fixture-test";
// The benchmark reference host is Linux; portable guard/default-bind controls
// below do not require an additional loopback address.
const referenceHostTest = it.effect.skipIf(process.platform !== "linux");
interface GuardedHttpFixture {
  readonly url: string;
  readonly requests: ReadonlyArray<unknown>;
  readonly observations: ReadonlyArray<FixtureRequestObservation>;
  readonly assertTrafficClean: () => void;
  readonly close: () => Promise<void>;
}
type SupplementalHandler = NonNullable<Parameters<typeof startDeviceAuthServer>[1]>;
const guardedFixtures: ReadonlyArray<{
  readonly name: string;
  readonly start: (handler: SupplementalHandler) => Promise<GuardedHttpFixture>;
}> = [
  {
    name: "Registry",
    start: (handleRequest: SupplementalHandler) => startBenchmarkRegistry({ handleRequest }),
  },
  {
    name: "device auth",
    start: (handleRequest: SupplementalHandler) =>
      startBenchmarkDeviceAuthServer("approved", handleRequest),
  },
];

const request = (url: string, agent = userAgent) =>
  HttpClientRequest.get(url).pipe(
    HttpClientRequest.setHeader("user-agent", agent),
    HttpClient.execute,
  );

const expectConnectionRefused = (url: string) =>
  Effect.gen(function* () {
    const result = yield* request(url).pipe(Effect.timeout("2 seconds"), Effect.result);
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "HttpClientError", reason: { _tag: "TransportError" } },
    });
  });

// Real loopback servers and HTTP clients exercise binding, protocol and guard
// behavior. These tests never launch AXM or access native credential storage.
it.live("shared HTTP fixtures retain their ordinary 127.0.0.1 defaults", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const registry = yield* Effect.acquireRelease(
        observe(() => startHttpRegistry()),
        (fixture) => observe(fixture.close).pipe(Effect.orDie),
      );
      const auth = yield* Effect.acquireRelease(
        observe(() => startDeviceAuthServer()),
        (fixture) => observe(fixture.close).pipe(Effect.orDie),
      );
      expect(new URL(registry.url).hostname).toBe("127.0.0.1");
      expect(new URL(auth.url).hostname).toBe("127.0.0.1");
      const response = yield* HttpClientRequest.post(`${auth.url}/v1/auth/device/code`).pipe(
        HttpClient.execute,
      );
      expect(response.status).toBe(200);
      expect(yield* response.json).toMatchObject({
        verification_uri: `${auth.url}/device`,
        verification_uri_complete: `${auth.url}/device?user_code=ABCD-1234`,
      });
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  ),
);

for (const fixture of guardedFixtures) {
  referenceHostTest(
    `${fixture.name} benchmark fixture serves its explicit address without listening on 127.0.0.1`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let handled = 0;
          const server = yield* Effect.acquireRelease(
            observe(() =>
              fixture.start(async (_request, response) => {
                handled++;
                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify({ control: "fixture-protocol" }));
                return true;
              }),
            ),
            (server) => observe(server.close).pipe(Effect.orDie),
          );
          const address = new URL(server.url);
          expect(address.hostname).toBe(benchmarkBindAddress);
          expect(benchmarkBindAddress).toBe("127.0.0.2");
          const response = yield* request(`${server.url}/v1/control`);
          expect(response.status).toBe(200);
          expect(yield* response.json).toEqual({ control: "fixture-protocol" });
          expect(handled).toBe(1);
          expect(server.observations).toEqual([
            { method: "GET", path: "/v1/control", status: 200, userAgent },
          ]);
          expect(server.requests).toHaveLength(1);
          expect(() => server.assertTrafficClean()).not.toThrow();
          address.hostname = "127.0.0.1";
          yield* expectConnectionRefused(`${address.origin}/v1/control`);
          expect(server.observations).toHaveLength(1);
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      ),
  );
}

// The traffic guard itself is portable. Compose it with the shared fixture's
// ordinary listener, without reimplementing either benchmark wrapper's close.
for (const testCase of [
  { label: "accepts an AXM protocol request", agent: userAgent, path: "/v1/control", status: 200 },
  { label: "rejects a foreign root probe", agent: "Go-http-client/1.1", path: "/", status: 403 },
  {
    label: "rejects a foreign client on a protocol path",
    agent: "Go-http-client/1.1",
    path: "/v1/control",
    status: 403,
  },
  {
    label: "rejects an AXM client on an unexpected path",
    agent: userAgent,
    path: "/",
    status: 403,
  },
]) {
  it.live(`benchmark traffic guard ${testCase.label} with safe diagnostic metadata`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const traffic = benchmarkTraffic();
        let handled = 0;
        const server = yield* Effect.acquireRelease(
          observe(() =>
            startHttpRegistry({
              handleRequest: async (request, response) => {
                if (traffic.observe(request, response)) return true;
                handled++;
                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify({ control: "fixture-protocol" }));
                return true;
              },
            }),
          ),
          (server) => observe(server.close).pipe(Effect.orDie),
        );
        expect(new URL(server.url).hostname).toBe("127.0.0.1");
        const response = yield* HttpClientRequest.get(
          `${server.url}${testCase.path}?token=private-query-marker`,
        ).pipe(
          HttpClientRequest.setHeaders({
            "user-agent": testCase.agent,
            authorization: "Bearer private-authorization-marker",
          }),
          HttpClient.execute,
        );
        expect(response.status).toBe(testCase.status);
        expect(yield* response.json).toEqual(
          testCase.status === 200
            ? { control: "fixture-protocol" }
            : { error: "unexpected_benchmark_traffic" },
        );
        expect(handled).toBe(testCase.status === 200 ? 1 : 0);
        const expected = {
          method: "GET",
          path: testCase.path,
          status: testCase.status,
          userAgent: testCase.agent,
        };
        expect(traffic.observations).toEqual([expected]);
        if (testCase.status === 200) expect(() => traffic.assertClean()).not.toThrow();
        else
          expect(() => traffic.assertClean()).toThrowError(
            expect.objectContaining({
              _tag: "BenchmarkTrafficFailure",
              message: `Benchmark fixture received unexpected traffic: ${JSON.stringify([expected])}`,
            }),
          );
        expect(JSON.stringify(traffic.observations)).not.toContain("private-query-marker");
        expect(JSON.stringify(traffic.observations)).not.toContain("private-authorization-marker");
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    ),
  );
}

referenceHostTest(
  "benchmark device verification URLs and approved token protocol use the explicit fixture origin",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* Effect.acquireRelease(
          observe(() => startBenchmarkDeviceAuthServer("approved")),
          (fixture) => observe(fixture.close).pipe(Effect.orDie),
        );
        const response = yield* HttpClientRequest.post(`${server.url}/v1/auth/device/code`).pipe(
          HttpClientRequest.setHeader("user-agent", userAgent),
          HttpClient.execute,
        );
        expect(response.status).toBe(200);
        const device = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            verification_uri: Schema.String,
            verification_uri_complete: Schema.String,
          }),
        )(yield* response.json);
        expect(device.verification_uri).toBe(`${server.url}/device`);
        expect(device.verification_uri_complete).toBe(`${server.url}/device?user_code=ABCD-1234`);
        expect(new URL(device.verification_uri).hostname).toBe("127.0.0.2");
        const token = yield* HttpClientRequest.post(`${server.url}/v1/auth/token`).pipe(
          HttpClientRequest.setHeader("user-agent", userAgent),
          HttpClient.execute,
        );
        expect(token.status).toBe(200);
        expect(yield* token.json).toMatchObject({
          token_type: "Bearer",
          access_token: "axm_ses_e2e",
        });
        expect(server.requests.map((entry) => entry.path)).toEqual([
          "/v1/auth/device/code",
          "/v1/auth/token",
        ]);
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    ),
);

for (const fixture of [
  { name: "Registry", start: () => startHttpRegistry({ bindAddress: "203.0.113.1" }) },
  {
    name: "device auth",
    start: () => startDeviceAuthServer("pending", undefined, { bindAddress: "203.0.113.1" }),
  },
]) {
  it.live(`${fixture.name} fixture rejects an unavailable bind address without falling back`, () =>
    Effect.gen(function* () {
      // A numeric documentation-only address avoids DNS and cannot be a local
      // listener on the reference host. Unexpected success is still cleaned up.
      const result = yield* Effect.scoped(
        Effect.acquireRelease(
          observe(async () => fixture.start()),
          (server) => observe(server.close).pipe(Effect.orDie),
        ),
      ).pipe(Effect.timeout("2 seconds"), Effect.result);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "HttpFixtureTestFailed", cause: { code: "EADDRNOTAVAIL" } },
      });
    }),
  );
}

referenceHostTest(
  "late foreign HTTP traffic rejects the real runner sample and closes its listener and root",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-http-runner-control-" });
        const repoRoot = path.resolve(import.meta.dirname, "..");
        const child = yield* spawner.spawn(
          ChildProcess.make(
            "bun",
            [path.join(import.meta.dirname, "test-support/cli-operation-http-runner.ts"), repoRoot],
            {
              cwd: repoRoot,
              env: { ...benchmarkProcessEnvironment(home) },
              stdout: "pipe",
              stderr: "pipe",
              forceKillAfter: "1 second",
            },
          ),
        );
        const [stdout, stderr, exit] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(child.stdout)),
            Stream.mkString(Stream.decodeText(child.stderr)),
            child.exitCode,
          ],
          { concurrency: 3 },
        ).pipe(Effect.timeout("15 seconds"));
        expect(exit, stderr).toBe(0);
        const receipt = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              stages: Schema.Array(Schema.String),
              rootAbsentAfterRunner: Schema.Boolean,
              listenerClosedAfterRunner: Schema.Boolean,
              result: Schema.Struct({
                _tag: Schema.Literal("Failure"),
                failure: Schema.Struct({
                  _tag: Schema.Literal("BenchmarkScenarioFailure"),
                  cause: Schema.Struct({
                    _tag: Schema.Literal("BenchmarkTrafficFailure"),
                    message: Schema.String,
                  }),
                }),
              }),
            }),
          ),
        )(stdout);
        expect(receipt.stages).toEqual(["metrics", "verify-start", "verify-complete", "dispose"]);
        expect(receipt.rootAbsentAfterRunner).toBe(true);
        expect(receipt.listenerClosedAfterRunner).toBe(true);
        expect(receipt.result.failure.cause.message).toBe(
          'Benchmark fixture received unexpected traffic: [{"method":"GET","path":"/","status":403,"userAgent":"Go-http-client/1.1"}]',
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  { timeout: 20_000 },
);
