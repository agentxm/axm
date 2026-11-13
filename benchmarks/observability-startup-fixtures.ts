/** Startup cache and background refresh through the compiled CLI's actual HTTPS URL. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  copyTemplate,
  type ObservabilityScenario,
  type PrepareInvocation,
} from "./observability-fixtures.js";
import { fixtureFailure } from "./observability-contract.js";
import { digest, normalizeObservation, projectComparisonField } from "./observability-process.js";
import { startStartupReleaseProxy } from "./observability-startup-proxy.js";

const Cache = Schema.Struct({
  schema: Schema.Literal("axm.update-check-cache/v3"),
  source: Schema.Literal("distribution-latest"),
  version: Schema.String,
  validatedAt: Schema.String,
});
const cacheRelative = ".cache/axm/update-check.json";
// Below the owner's three-second refresh timeout. The deterministic distinction is
// exercised by cli-maintenance/self-update/application/startup-check.test.ts:
// command-scope closure completes without advancing TestClock; timeout needs 3s.
const cancellationEvidenceBoundMillis = 2500;

export const prepareStartupObservabilityFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly view: ObservabilityScenario;
  readonly invoke: PrepareInvocation;
}) {
  const proxy = yield* startStartupReleaseProxy();
  const version = yield* options.invoke(options.view.template, ["--version"]);
  const local = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({ type: Schema.Literal("version"), version: Schema.String }),
    ),
  )(version.stdout);
  const cases = [
    {
      name: "fresh-current",
      cache: "fresh",
      version: local.version,
      status: 200,
      body: "999.0.0\n",
      delay: 0,
      refresh: false,
      writes: false,
      notice: false,
    },
    {
      name: "fresh-newer",
      cache: "fresh",
      version: "999.0.0",
      status: 200,
      body: "999.0.0\n",
      delay: 0,
      refresh: false,
      writes: false,
      notice: true,
    },
    {
      name: "missing-success",
      cache: "missing",
      version: local.version,
      status: 200,
      body: "999.0.0\n",
      delay: 0,
      refresh: true,
      writes: true,
      notice: false,
    },
    {
      name: "stale-success",
      cache: "stale",
      version: local.version,
      status: 200,
      body: "999.0.0\n",
      delay: 0,
      refresh: true,
      writes: true,
      notice: false,
    },
    {
      name: "stale-invalid-version",
      cache: "stale",
      version: local.version,
      status: 200,
      body: "not-a-version\n",
      delay: 0,
      refresh: true,
      writes: false,
      notice: false,
    },
    {
      name: "stale-http-failure",
      cache: "stale",
      version: local.version,
      status: 503,
      body: "unavailable\n",
      delay: 0,
      refresh: true,
      writes: false,
      notice: false,
    },
    {
      name: "missing-cancelled",
      cache: "missing",
      version: local.version,
      status: 200,
      body: "999.0.0\n",
      delay: 10_000,
      refresh: true,
      writes: false,
      notice: false,
    },
  ] as const;
  return cases.map((item): ObservabilityScenario => {
    const template = copyTemplate(options.view.template, path.join(options.root, item.name));
    let seeded = "";
    const activate = Effect.sync(() => {
      const file = path.join(template.home, cacheRelative);
      fs.rmSync(file, { force: true });
      seeded =
        JSON.stringify({
          schema: "axm.update-check-cache/v3",
          source: "distribution-latest",
          version: item.version,
          validatedAt: new Date(
            Date.now() - (item.cache === "stale" ? 2 * 60 * 60 * 1000 : 0),
          ).toISOString(),
        }) + "\n";
      if (item.cache !== "missing") {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, seeded);
      }
    });
    return {
      ...options.view,
      id: "startup/" + item.name,
      template,
      json: false,
      activate,
      condition: { ...options.view.condition, network: "slow" },
      environment: { AXM_NO_UPDATE_CHECK: "0", CLAUDECODE: "1", ...proxy.environment },
      external: {
        reset: Effect.sync(() =>
          proxy.reset({ status: item.status, body: item.body, bodyDelayMillis: item.delay }),
        ),
        snapshot: () => ({ certificateSha256: proxy.certificateSha256, ...proxy.evidence() }),
      },
      requests: () => [...(options.view.registry?.timeline() ?? []), ...proxy.requests()],
      workExpectations: () => [
        {
          kind: "axm.update.cache",
          dimensions: { "axm.cache.outcome": item.cache === "missing" ? "miss" : "hit" },
          count: 1,
          requested: 1,
          executed: 1,
        },
        {
          kind: "axm.update.request",
          count: proxy.requests().length,
          requested: proxy.requests().length,
          executed: proxy.requests().length,
        },
        {
          kind: "axm.update.body",
          count: proxy
            .evidence()
            .responses.filter((response) => response.status === 200 && response.headersSent).length,
          executed: proxy
            .evidence()
            .responses.filter((response) => response.status === 200 && response.headersSent).length,
        },
      ],
      verify: ({ fixture, stderr, startedAtMillis, endedAtMillis }) =>
        Effect.gen(function* () {
          const evidence = proxy.evidence();
          if (
            evidence.acceptedTunnels !== (item.refresh ? 1 : 0) ||
            evidence.successfulHandshakes !== (item.refresh ? 1 : 0) ||
            evidence.failedHandshakes !== 0 ||
            evidence.rejectedTunnels !== 0 ||
            evidence.rejectedHttpRequests !== 0 ||
            proxy.requests().length !== (item.refresh ? 1 : 0)
          )
            return yield* fixtureFailure(
              "Startup refresh did not match independent CONNECT, TLS and origin request evidence.",
            );
          if (stderr.includes("AXM_UPDATE_AVAILABLE") !== item.notice)
            return yield* fixtureFailure(
              "Startup notification did not match the independently seeded cache state.",
            );
          const file = path.join(fixture.home, cacheRelative);
          if (!item.writes) {
            if (
              item.cache === "missing"
                ? fs.existsSync(file)
                : fs.readFileSync(file, "utf8") !== seeded
            )
              return yield* fixtureFailure(
                "A failed, cancelled or unnecessary refresh changed the startup cache.",
              );
            const response = evidence.responses[0];
            const request = proxy.requests()[0];
            if (
              item.name === "stale-invalid-version" &&
              (evidence.responses.length !== 1 ||
                response?.status !== 200 ||
                !response.headersSent ||
                !response.completed ||
                response.responseBytes !== Buffer.byteLength(item.body) ||
                request === undefined ||
                request.finishedAtMs < request.startedAtMs ||
                request.finishedAtMs > endedAtMillis)
            )
              return yield* fixtureFailure(
                "Invalid-version refresh did not independently complete its expected response body before preserving the cache.",
              );
            if (item.delay > 0) {
              const invocationMillis = endedAtMillis - startedAtMillis;
              if (
                evidence.responses.length !== 1 ||
                response?.status !== 200 ||
                !response.headersSent ||
                response.completed ||
                response.responseBytes !== 0 ||
                request === undefined ||
                request.startedAtMs < startedAtMillis ||
                request.finishedAtMs < request.startedAtMs ||
                request.finishedAtMs > endedAtMillis ||
                invocationMillis < 0 ||
                invocationMillis >= cancellationEvidenceBoundMillis
              )
                return yield* fixtureFailure(
                  "Scope-cancellation evidence requires the delayed body to close and the invocation to exit before 2500ms; a refresh timeout or unclosed body does not satisfy it.",
                );
              return {
                assertions: [
                  "The delayed origin body closed incomplete with zero sent bytes and no cache write.",
                  "Parent invocation completed in " +
                    invocationMillis +
                    "ms and the proxy body closed " +
                    (request.finishedAtMs - startedAtMillis) +
                    "ms after invocation start, both before the 2500ms evidence bound and the owner's 3000ms refresh timeout.",
                  "The owner's deterministic command-scope test establishes cancellation without advancing its TestClock; the timeout counterpart requires three seconds.",
                ],
              };
            }
            return {
              assertions: [
                "Startup cache and notification match the seed; independent TLS/request/body records distinguish skipped and failed refresh paths.",
                ...(item.name === "stale-invalid-version"
                  ? [
                      "The full expected invalid-version body completed before the unchanged cache was checked.",
                    ]
                  : []),
              ],
            };
          }
          const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
            fs.readFileSync(file, "utf8"),
          );
          const cache = yield* Schema.decodeUnknownEffect(Cache)(raw);
          const epoch = Date.parse(cache.validatedAt);
          if (
            cache.version !== "999.0.0" ||
            !Number.isFinite(epoch) ||
            epoch < startedAtMillis ||
            epoch > endedAtMillis ||
            evidence.responses[0]?.completed !== true ||
            evidence.responses[0].responseBytes !== Buffer.byteLength(item.body)
          )
            return yield* fixtureFailure(
              "Successful startup refresh did not persist the independently served release within its invocation.",
            );
          return {
            assertions: [
              "The actual fixed HTTPS distribution URL refreshed the cache through a child-only trusted ephemeral CA.",
              "Origin body bytes and cache version/time are independently verified; no system trust or production endpoint override is used.",
            ],
            fileComparisons: [
              {
                container: "home" as const,
                path: cacheRelative,
                sha256: digest(
                  JSON.stringify(
                    normalizeObservation(
                      projectComparisonField(
                        raw,
                        ["validatedAt"],
                        cache.validatedAt,
                        "<validated-during-invocation>",
                      ),
                      [fixture.workspace, fixture.home],
                    ),
                  ),
                ),
                reason:
                  "Only the schema-validated startup cache instant within this invocation is projected; raw bytes remain retained.",
              },
            ],
          };
        }),
    };
  });
});
