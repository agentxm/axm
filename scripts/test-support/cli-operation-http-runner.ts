/** Real Bun/runtime control for late fixture contamination; never executes AXM. */
import * as fs from "node:fs/promises";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type { BenchmarkScenario, ProcessResult } from "../../benchmarks/cli-operations/fixtures.js";
import { startBenchmarkRegistry } from "../../benchmarks/cli-operations/http-fixture.js";
import { runScenarioSample } from "../../benchmarks/cli-operations/runner.js";

class HttpRunnerControlFailed extends Data.TaggedError("HttpRunnerControlFailed")<{
  readonly cause: unknown;
}> {}

const observe = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new HttpRunnerControlFailed({ cause }) });

await Effect.runPromise(
  Effect.gen(function* () {
    const repoRoot = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(process.argv[2]);
    let root = "";
    let origin = "";
    const stages: string[] = [];
    const scenario: BenchmarkScenario = {
      id: "http-fixture-late-traffic-control",
      operationId: "control",
      modeId: "default",
      fixtureId: "http-fixture-late-traffic-control",
      description: "Prove disposal contamination rejects an otherwise successful sample",
      dimensions: {
        scope: "none",
        source: "none",
        selection: "none",
        view: "none",
        output: "human",
        state: "query",
        format: "text",
        kinds: [],
      },
      prepare: (context) =>
        Effect.runPromise(
          Effect.gen(function* () {
            root = context.root;
            const server = yield* observe(() => startBenchmarkRegistry());
            origin = server.url;
            return {
              args: ["-e", "process.stdout.write('ok')"],
              expectedExitCode: 0,
              metrics: () => {
                stages.push("metrics");
                return { requests: server.requests.length };
              },
              verify: (result: ProcessResult) =>
                Effect.runPromise(
                  Effect.gen(function* () {
                    yield* Schema.decodeUnknownEffect(Schema.Literal("ok"))(result.stdout);
                    stages.push("verify-start");
                    const response = yield* HttpClientRequest.get(
                      `${server.url}/?token=late-query-marker`,
                    ).pipe(
                      HttpClientRequest.setHeaders({
                        "user-agent": "Go-http-client/1.1",
                        authorization: "Bearer late-authorization-marker",
                      }),
                      HttpClient.execute,
                    );
                    yield* Schema.decodeUnknownEffect(Schema.Literal(403))(response.status);
                    yield* response.arrayBuffer;
                    stages.push("verify-complete");
                  }).pipe(Effect.provide(FetchHttpClient.layer)),
                ),
              dispose: () => {
                stages.push("dispose");
                return server.close();
              },
            };
          }),
        ),
    };
    const result = yield* runScenarioSample(scenario, repoRoot, process.execPath).pipe(
      Effect.result,
    );
    yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(root);
    yield* Effect.gen(function* () {
      const found = yield* observe(() => fs.lstat(root)).pipe(Effect.result);
      if (found._tag === "Failure")
        yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.Literal("ENOENT") }))(
          found.failure.cause,
        );
      const connection = yield* HttpClientRequest.get(`${origin}/v1/control`).pipe(
        HttpClientRequest.setHeader("user-agent", "axm-cli/http-runner-control"),
        HttpClient.execute,
        Effect.timeout("2 seconds"),
        Effect.result,
      );
      if (connection._tag === "Success") yield* connection.success.arrayBuffer;
      yield* Effect.sync(() =>
        process.stdout.write(
          JSON.stringify({
            stages,
            result,
            rootAbsentAfterRunner: found._tag === "Failure",
            listenerClosedAfterRunner:
              connection._tag === "Failure" &&
              connection.failure._tag === "HttpClientError" &&
              connection.failure.reason._tag === "TransportError",
          }) + "\n",
        ),
      );
    }).pipe(
      Effect.ensuring(
        observe(() => fs.rm(root, { recursive: true, force: true })).pipe(Effect.orDie),
      ),
    );
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
