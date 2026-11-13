import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { devNull } from "node:os";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { startDeviceAuthServer } from "@agentxm/test-support/auth-server";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import {
  evidenceDirectory,
  command,
  comparableProduct,
  inspectEventually,
  inspectFixture,
  inspectReceipt,
  invoke,
  readJson,
  retrieveTree,
  rootEnvironment,
  seqEndpoint,
  snapshotFiles,
  sourceIdentity,
  sourceTreeSha256,
  startKilledInvocation,
  startTraceRelay,
  temporary,
  waitUntil,
  writeJson,
  TraceFixtureError,
} from "./e2e/local-tracing-seq.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/local-tracing-describes-operation-work",
    "cli/local-tracing-stays-local-and-private",
    "cli/local-tracing-preserves-outcomes",
    "cli/local-tracing-identifies-invocations",
    "cli/local-tracing-inspects-complete-evidence",
    "cli/local-tracing-records-producer-completion",
    "cli/local-tracing-summarizes-work",
  ],
  boundary: "binary",
  rationale:
    "Opt-in source and host-binary invocations use real HTTP and Seq; independent protocol records and file hashes verify outcome/work equivalence, and deliberately lost delivery must fail exact receipt inspection. Native keychain and authenticated Seq setup remain separate platform/environment evidence.",
});

const kinds = ["source", "compiled"] as const;
const loginArgs = [
  "login",
  "--device-code",
  "--wait-for-human",
  "20",
  "--json",
  "--non-interactive",
];
const whoamiArgs = ["whoami", "--json", "--non-interactive"];
const assertNoConnectionSecrets = (text: string) => {
  // Report only a boolean on failure; a failed privacy test must not print the key.
  for (const name of ["AXM_TRACE_API_KEY", "SEQCLI_CONNECTION_APIKEY"]) {
    const secret = process.env[name];
    if (secret !== undefined && secret !== "")
      expect(text.includes(secret), "Seq credentials must remain outside evidence").toBe(false);
  }
};
const containsInvocationRoot = (root: unknown, expectedId: string) => {
  const envelope = Schema.Struct({
    type: Schema.optional(Schema.String),
    spanId: Schema.optional(Schema.String),
    message: Schema.optional(Schema.String),
    children: Schema.optional(Schema.Array(Schema.Unknown)),
  });
  const pending: unknown[] = [root];
  for (let visited = 0; pending.length > 0 && visited < 100_000; visited += 1) {
    const current = pending.pop();
    if (!Schema.is(envelope)(current)) continue;
    if (
      current.type === "span" &&
      current.spanId === expectedId &&
      current.message === "axm.cli.invocation"
    )
      return true;
    pending.push(...(current.children ?? []));
  }
  return false;
};
const run = (
  kind: (typeof kinds)[number],
  args: ReadonlyArray<string>,
  home: string,
  environment: Readonly<Record<string, string>>,
  cwd = home,
) => invoke(kind, args, { cwd, env: environment, timeout: 30_000, exactOutput: true });
const configure = (home: string, registry: string) =>
  Effect.sync(() => {
    const settings = join(home, ".axm", "workspace");
    fs.mkdirSync(settings, { recursive: true });
    fs.writeFileSync(
      join(settings, "axm.json"),
      JSON.stringify({
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: registry }],
      }) + "\n",
    );
  });
const fixture = (outcome: Parameters<typeof startDeviceAuthServer>[0] = "approved") =>
  Effect.gen(function* () {
    const auth = yield* Effect.acquireRelease(startDeviceAuthServer(outcome), (server) =>
      server.close.pipe(Effect.orDie),
    );
    const home = yield* temporary;
    yield* configure(home.path, auth.url);
    const environment = { ...rootEnvironment(home.path), ...(yield* sourceIdentity) };
    return { auth, home: home.path, environment };
  });
const authenticate = (home: string, environment: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const result = yield* run("compiled", loginArgs, home, environment);
    expect(result.exitCode, result.stderr).toBe(0);
    return result;
  });
const identityExpectations = {
  work: [
    {
      kind: "axm.http.request",
      ownerName: "axm.cli.operation",
      ownerAttributes: { "axm.operation.mode": "query" },
      count: 1,
      executed: 1,
    },
    {
      kind: "axm.auth.request",
      dimensions: { "axm.auth.purpose": "identity" },
      count: 1,
      executed: 1,
    },
  ],
};

describe("exact source/compiled Seq evidence", () => {
  it.live(
    "isolates concurrent source and compiled inventories in actual linked Git worktrees",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const sourceSha256 = yield* sourceTreeSha256;
        const area = yield* temporary;
        const base = join(area.path, "repository");
        const baseHome = join(area.path, "base-home");
        fs.mkdirSync(base);
        fs.mkdirSync(baseHome);
        const gitEnvironment = {
          ...rootEnvironment(baseHome),
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: devNull,
        };
        const git = (cwd: string, args: ReadonlyArray<string>) =>
          command(
            "git",
            ["-c", "core.hooksPath=" + devNull, "-c", "commit.gpgSign=false", ...args],
            {
              cwd,
              env: gitEnvironment,
            },
          ).pipe(
            Effect.tap((result) =>
              Effect.sync(() => expect(result.exitCode, result.stderr).toBe(0)),
            ),
          );
        yield* git(base, ["init"]);
        const setup = yield* run(
          "compiled",
          [
            "setup",
            "--yes",
            "--scope",
            "project",
            "--agent",
            "claude-code",
            "--json",
            "--non-interactive",
          ],
          baseHome,
          {
            ...rootEnvironment(baseHome),
            ...f.environment,
            HOME: baseHome,
            AXM_USER_HOME: baseHome,
          },
          base,
        );
        expect(setup.exitCode, setup.stderr).toBe(0);
        const settingsPath = join(base, "axm.json");
        const settings = yield* Schema.decodeUnknownEffect(
          Schema.Record(Schema.String, Schema.Unknown),
        )(yield* readJson(settingsPath));
        yield* writeJson(settingsPath, {
          ...settings,
          owner: "@fixture",
          agents: [],
          defaultRegistry: "test",
          sources: [{ name: "test", type: "registry", location: f.auth.url }],
        });
        yield* git(base, ["add", "."]);
        yield* git(base, [
          "-c",
          "user.name=AXM fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-m",
          "Independent workspace fixture",
        ]);
        const fixtureHead = (yield* git(base, ["rev-parse", "HEAD"])).stdout.trim();
        expect(fixtureHead).not.toBe(f.environment.AXM_TRACE_BUILD_REVISION);
        const worktrees = [];
        const args = ["list", "--scope", "project", "--json", "--non-interactive"];
        for (const kind of kinds) {
          const cwd = join(area.path, kind + "-worktree");
          const home = join(area.path, kind + "-home");
          fs.mkdirSync(home);
          yield* configure(home, f.auth.url);
          yield* git(base, ["worktree", "add", "--detach", cwd, fixtureHead]);
          const environment = { ...f.environment, ...rootEnvironment(home) };
          const name = "inventory-" + kind;
          const created = yield* run(
            "compiled",
            ["skills", "new", name, "--owner", "@fixture", "--json", "--non-interactive"],
            home,
            environment,
            cwd,
          );
          expect(created.exitCode, created.stderr).toBe(0);
          const baseline = yield* run(kind, args, home, environment, cwd);
          expect(baseline.exitCode, baseline.stderr).toBe(0);
          expect(baseline.stdout).toContain(name);
          expect(baseline.stdout).not.toContain(
            "inventory-" + (kind === "source" ? "compiled" : "source"),
          );
          const common = (yield* git(cwd, [
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
          ])).stdout.trim();
          expect(common).toBe(join(base, ".git"));
          expect((yield* git(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim()).toBe(cwd);
          worktrees.push({
            kind,
            cwd,
            home,
            environment,
            baseline,
            before: snapshotFiles(cwd),
            homeBefore: snapshotFiles(home),
            common,
          });
        }
        yield* f.auth.reset;
        const artifacts = yield* evidenceDirectory("worktree-isolation");
        const expected = join(artifacts, "expected.json");
        yield* writeJson(expected, { work: [{ kind: "axm.http.request", count: 0 }] });
        const relay = yield* startTraceRelay(seqEndpoint());
        const results = yield* Effect.forEach(
          worktrees,
          (workspace) =>
            Effect.gen(function* () {
              const receipt = join(artifacts, workspace.kind + ".receipt.json");
              const result = yield* run(
                workspace.kind,
                args,
                workspace.home,
                {
                  ...workspace.environment,
                  AXM_TRACE: "1",
                  AXM_TRACE_ENDPOINT: relay.url,
                  AXM_TRACE_RECEIPT: receipt,
                },
                workspace.cwd,
              );
              yield* writeJson(join(artifacts, workspace.kind + ".output.json"), {
                baseline: workspace.baseline,
                result,
              });
              expect(comparableProduct(result)).toEqual(comparableProduct(workspace.baseline));
              expect(snapshotFiles(workspace.cwd)).toEqual(workspace.before);
              expect(snapshotFiles(workspace.home)).toEqual(workspace.homeBefore);
              const summary = yield* inspectEventually(receipt, expected);
              expect(summary.build.execution).toBe(workspace.kind);
              expect(summary.build.revision).toBe(f.environment.AXM_TRACE_BUILD_REVISION);
              expect(summary.invocation.attributes["axm.command.route"]).toBe("list");
              yield* writeJson(join(artifacts, workspace.kind + ".inspection.json"), summary);
              const raw = yield* retrieveTree(
                summary.traceId,
                join(artifacts, workspace.kind + ".tree.json"),
              );
              assertNoConnectionSecrets(raw);
              expect(raw).not.toContain(workspace.cwd);
              expect(raw).not.toContain(workspace.home);
              return {
                kind: workspace.kind,
                cwd: workspace.cwd,
                home: workspace.home,
                common: workspace.common,
                traceId: summary.traceId,
                spanId: summary.rootSpanId,
                output: result,
                before: workspace.before,
                after: snapshotFiles(workspace.cwd),
                homeBefore: workspace.homeBefore,
                homeAfter: snapshotFiles(workspace.home),
              };
            }),
          { concurrency: 2 },
        );
        expect(new Set(results.map((result) => result.traceId)).size).toBe(2);
        expect(new Set(results.map((result) => result.spanId)).size).toBe(2);
        expect(f.auth.requests()).toEqual([]);
        yield* writeJson(join(artifacts, "oracle.json"), {
          fixtureHead,
          sourceRuntimeCache: "isolated per invocation outside product home",
          outputComparison: "all output except validated progress.event.atMs clock readings",
          cliRevision: f.environment.AXM_TRACE_BUILD_REVISION,
          sourceSha256,
          binarySha256: createHash("sha256")
            .update(fs.readFileSync(resolveHostBinaryPath()))
            .digest("hex"),
          worktreeList: (yield* git(base, ["worktree", "list", "--porcelain"])).stdout,
          command: args,
          requests: f.auth.requests(),
          results,
        });
        expect(yield* sourceTreeSha256).toBe(sourceSha256);
      }).pipe(Effect.scoped),
  );

  it.live(
    "preserves authenticated output, state and wire counts across concurrent source/compiled summary/detail capture",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const sourceSha256 = yield* sourceTreeSha256;
        yield* authenticate(f.home, f.environment);
        const before = snapshotFiles(f.home);
        const artifacts = yield* evidenceDirectory("identity");
        const expected = join(artifacts, "expected.json");
        yield* writeJson(expected, identityExpectations);
        const baselines = yield* Effect.forEach(kinds, (kind) =>
          run(kind, whoamiArgs, f.home, f.environment),
        );
        for (const baseline of baselines) expect(baseline.exitCode, baseline.stderr).toBe(0);
        yield* writeJson(join(artifacts, "baselines.json"), baselines);
        expect(baselines.map(comparableProduct)[0]).toEqual(baselines.map(comparableProduct)[1]);
        yield* f.auth.reset;
        const relay = yield* startTraceRelay(seqEndpoint());
        yield* Effect.addFinalizer(() =>
          writeJson(join(artifacts, "relay.json"), {
            receivedBatchCount: relay.payloads.length,
            forwardedBatchCount: relay.forwarded(),
            deliveryCount: relay.deliveries.length,
            deliveries: relay.deliveries.slice(0, 128),
            omittedDeliveryCount: Math.max(0, relay.deliveries.length - 128),
          }),
        );
        const identities: string[] = [];
        const runs = [];
        for (const mode of ["summary", "detail"] as const) {
          const samples = yield* Effect.forEach(
            kinds,
            (kind) =>
              Effect.gen(function* () {
                const receipt = join(artifacts, kind + "-" + mode + ".receipt.json");
                const result = yield* run(kind, whoamiArgs, f.home, {
                  ...f.environment,
                  AXM_TRACE: "1",
                  AXM_TRACE_DETAIL: mode === "detail" ? "io" : "",
                  AXM_TRACE_ENDPOINT: relay.url,
                  AXM_TRACE_RECEIPT: receipt,
                });
                yield* writeJson(join(artifacts, kind + "-" + mode + ".output.json"), result);
                expect(comparableProduct(result)).toEqual(
                  baselines.map(comparableProduct)[kind === "source" ? 0 : 1],
                );
                const summary = yield* inspectEventually(receipt, expected);
                expect(summary.build.execution).toBe(kind);
                expect(summary.build.revision).toBe(f.environment.AXM_TRACE_BUILD_REVISION);
                expect(summary.build.runtime).toBe("bun");
                expect(summary.mode).toBe(mode);
                expect(summary.evidence.expectations).toBe("verified");
                expect(summary.evidence.aggregateIdentityVerified).toBe(true);
                expect(summary.detailSelection).toEqual({
                  kinds: mode === "detail" ? ["io"] : [],
                  phase: null,
                });
                expect(summary.evidence.retainedDetailSpanCount > 0).toBe(mode === "detail");
                expect(summary.invocation.attributes["axm.command.route"]).toBe("whoami");
                identities.push(summary.traceId);
                const tree = join(artifacts, kind + "-" + mode + ".tree.json");
                const raw = yield* retrieveTree(summary.traceId, tree);
                assertNoConnectionSecrets(raw);
                for (const privateValue of [
                  f.home,
                  f.auth.url,
                  "@alice",
                  "axm_ses_e2e",
                  "axm_ref_e2e",
                  "alice@example.com",
                  "device-secret",
                ])
                  expect(raw).not.toContain(privateValue);
                yield* writeJson(join(artifacts, kind + "-" + mode + ".inspection.json"), summary);
                if (kind === "compiled" && mode === "summary") {
                  const limited = yield* inspectReceipt(receipt, expected, ["--max-nodes", "1"]);
                  expect(limited.json).toMatchObject({
                    evidence: "failed",
                    code: "traversal-limit",
                  });
                  const work = summary.work.find((row) => row.kind === "axm.http.request");
                  expect(work).toBeDefined();
                  if (work === undefined)
                    return yield* new TraceFixtureError({
                      message: "Missing expected physical request",
                    });
                  const subtree = yield* inspectReceipt(receipt, expected, [
                    "--span-id",
                    work.owner,
                  ]);
                  expect(subtree.exitCode, subtree.stdout).toBe(0);
                  expect(subtree.json).toMatchObject({
                    scope: { kind: "subtree", spanId: work.owner },
                  });
                  for (const [mutation, code] of [
                    ["truncate", "identity-mismatch"],
                    ["duplicate-work", "expectation-mismatch"],
                    ["missing-owner", "invalid-summary"],
                    ["wrong-owner", "expectation-mismatch"],
                  ]) {
                    if (mutation === undefined || code === undefined)
                      return yield* new TraceFixtureError({ message: "Missing negative control" });
                    const negative = yield* inspectFixture(receipt, tree, expected, mutation);
                    expect(negative.exitCode, negative.stdout).toBe(1);
                    expect(negative.json).toMatchObject({ evidence: "failed", code });
                    yield* writeJson(join(artifacts, mutation + ".json"), negative.json);
                  }
                }
                return {
                  kind,
                  mode,
                  traceId: summary.traceId,
                  work: summary.work
                    .map(({ owner: _owner, workDurationMs: _duration, measurements, ...row }) => ({
                      ...row,
                      measurements: Object.fromEntries(
                        Object.entries(measurements).filter(
                          ([key]) => key !== "axm.summary.work-duration-us",
                        ),
                      ),
                    }))
                    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
                };
              }),
            { concurrency: 2 },
          );
          runs.push(...samples);
        }
        expect(new Set(identities).size).toBe(4);
        expect(f.auth.requests()).toHaveLength(4);
        expect(
          f.auth
            .requests()
            .every(
              (request) =>
                request.method === "GET" &&
                request.pathname === "/v1/auth/me" &&
                request.status === 200,
            ),
        ).toBe(true);
        expect(snapshotFiles(f.home)).toEqual(before);
        for (const privateValue of [
          f.home,
          f.auth.url,
          "@alice",
          "axm_ses_e2e",
          "axm_ref_e2e",
          "alice@example.com",
          "device-secret",
        ])
          expect(Buffer.concat(relay.payloads).toString()).not.toContain(privateValue);
        assertNoConnectionSecrets(Buffer.concat(relay.payloads).toString());
        // All work totals must agree across modes for the same executable.
        // Source and compiled startup/environment work are separate comparisons.
        for (const kind of kinds) {
          const matching = runs.filter((run) => run.kind === kind).map((run) => run.work);
          expect(matching[0]).toEqual(matching[1]);
        }
        yield* writeJson(join(artifacts, "oracle.json"), {
          sourceSha256,
          sourceRuntimeCache: "isolated per invocation outside product home",
          outputComparison: "all output except validated progress.event.atMs clock readings",
          command: whoamiArgs,
          requests: f.auth.requests(),
          before,
          after: snapshotFiles(f.home),
          runs,
          binarySha256: createHash("sha256")
            .update(fs.readFileSync(resolveHostBinaryPath()))
            .digest("hex"),
        });
        expect(yield* sourceTreeSha256).toBe(sourceSha256);
      }).pipe(Effect.scoped),
  );

  it.live(
    "keeps a real response-body hold inside the auth request after headers have completed",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        const registryRelay = yield* startTraceRelay(f.auth.url);
        yield* configure(f.home, registryRelay.url);
        yield* authenticate(f.home, f.environment);
        const baseline = yield* run("compiled", whoamiArgs, f.home, f.environment);
        const before = snapshotFiles(f.home);
        yield* f.auth.reset;
        registryRelay.setBehavior("hold-body");
        const collector = yield* startTraceRelay(seqEndpoint());
        const artifacts = yield* evidenceDirectory("body-hold");
        const receipt = join(artifacts, "receipt.json");
        const child = yield* run("compiled", whoamiArgs, f.home, {
          ...f.environment,
          AXM_TRACE: "1",
          AXM_TRACE_ENDPOINT: collector.url,
          AXM_TRACE_RECEIPT: receipt,
        }).pipe(Effect.forkChild);
        // Exported physical exchange evidence proves headers were observed while
        // the actual response body remained withheld by the independent server.
        yield* waitUntil(
          () =>
            registryRelay.bodyHolds.length === 1 &&
            collector.payloads.some((bytes) => bytes.includes(Buffer.from("axm.http.request"))),
        );
        expect(child.pollUnsafe()).toBeUndefined();
        expect(yield* readJson(receipt)).toMatchObject({ producerComplete: false });
        registryRelay.release();
        const completed = yield* Fiber.join(child);
        yield* writeJson(join(artifacts, "output.json"), { baseline, completed });
        expect(comparableProduct(completed)).toEqual(comparableProduct(baseline));
        const hold = registryRelay.bodyHolds[0];
        if (hold === undefined || hold.endedAtMillis === null)
          return yield* new TraceFixtureError({
            message: "The controlled body hold did not finish",
          });
        const heldMillis = hold.endedAtMillis - hold.startedAtMillis;
        expect(f.auth.requests()).toHaveLength(1);
        expect(f.auth.requests()[0]?.responseBytes).toBe(hold.bytes);
        const expected = join(artifacts, "expected.json");
        yield* writeJson(expected, identityExpectations);
        const summary = yield* inspectEventually(receipt, expected);
        const request = summary.work.filter((row) => row.kind === "axm.auth.request");
        const transport = summary.work.filter((row) => row.kind === "axm.http.request");
        expect(request).toHaveLength(1);
        expect(transport).toHaveLength(1);
        expect(request[0]?.workDurationMs).toBeGreaterThanOrEqual(Math.floor(heldMillis));
        expect(request[0]?.workDurationMs).toBeGreaterThan(
          transport[0]?.workDurationMs ?? Infinity,
        );
        expect(snapshotFiles(f.home)).toEqual(before);
        yield* retrieveTree(summary.traceId, join(artifacts, "tree.json"));
        yield* writeJson(join(artifacts, "inspection.json"), summary);
        yield* writeJson(join(artifacts, "oracle.json"), {
          requests: f.auth.requests(),
          bodyHold: hold,
          heldMillis,
          before,
          after: snapshotFiles(f.home),
          product: completed,
        });
      }).pipe(Effect.scoped),
  );

  it.live("retains real device polling waits and rejects an acknowledged dropped OTLP batch", () =>
    Effect.gen(function* () {
      const f = yield* fixture("pending");
      const artifacts = yield* evidenceDirectory("dropped-batch");
      const relay = yield* startTraceRelay(seqEndpoint(), "drop-first");
      const receipt = join(artifacts, "dropped.receipt.json");
      const child = yield* run("compiled", loginArgs, f.home, {
        ...f.environment,
        AXM_TRACE: "1",
        AXM_TRACE_ENDPOINT: relay.url,
        AXM_TRACE_RECEIPT: receipt,
      }).pipe(Effect.forkChild);
      // The first ended work is acknowledged and discarded while the real product
      // remains pending. Completion/root work is subsequently delivered to Seq.
      yield* waitUntil(() => relay.payloads.length > 0);
      f.auth.setOutcome("approved");
      const completed = yield* Fiber.join(child);
      expect(completed.exitCode, completed.stderr).toBe(0);
      expect(relay.payloads.length).toBeGreaterThanOrEqual(2);
      expect(relay.forwarded()).toBe(relay.payloads.length - 1);
      const produced = yield* readJson(receipt);
      expect(produced).toMatchObject({
        producerComplete: true,
        droppedSpanCount: 0,
        droppedAggregateEventCount: 0,
        unrecognizedSpanCount: 0,
        unrecognizedAttributeCount: 0,
        summaryOverflowCount: 0,
      });
      expect(relay.deliveries.filter((entry) => entry.action === "drop")).toEqual([
        expect.objectContaining({ status: 200, channel: "traces" }),
      ]);
      expect(
        relay.deliveries.some(
          (entry) => entry.action === "forward" && entry.status >= 200 && entry.status < 300,
        ),
      ).toBe(true);
      const identity = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ traceId: Schema.String, spanId: Schema.String }),
      )(produced);
      let receivedRoot = false;
      for (let attempt = 0; !receivedRoot && attempt < 5; attempt += 1) {
        const received = yield* retrieveTree(
          identity.traceId,
          join(artifacts, "dropped.tree.json"),
        ).pipe(Effect.option);
        if (Option.isSome(received)) {
          const receivedTree = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Struct({ traceId: Schema.String, root: Schema.Unknown })),
          )(received.value);
          expect(receivedTree.traceId).toBe(identity.traceId);
          receivedRoot = containsInvocationRoot(receivedTree.root, identity.spanId);
        }
        if (!receivedRoot) yield* Effect.sleep("100 millis");
      }
      // Missing ancestors can make Seq introduce an orphan/group envelope.
      // The delivered final invocation must still be present as a real span.
      expect(receivedRoot).toBe(true);
      const rejected = yield* inspectReceipt(receipt);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.json).toMatchObject({ evidence: "failed" });
      yield* writeJson(join(artifacts, "inspection.json"), rejected.json);
      yield* writeJson(join(artifacts, "oracle.json"), {
        requests: f.auth.requests(),
        batches: relay.payloads.length,
        acknowledgedDroppedBatches: 1,
        forwardedBatches: relay.forwarded(),
        deliveries: relay.deliveries,
        productExit: completed.exitCode,
      });
      for (const privateValue of [
        f.home,
        f.auth.url,
        "device-secret",
        "axm_ses_e2e",
        "axm_ref_e2e",
        "alice@example.com",
      ])
        expect(Buffer.concat(relay.payloads).toString()).not.toContain(privateValue);
      assertNoConnectionSecrets(Buffer.concat(relay.payloads).toString());
      yield* Effect.sync(() =>
        relay.payloads.forEach((bytes, index) =>
          fs.writeFileSync(join(artifacts, "batch-" + index + ".otlp"), bytes),
        ),
      );

      // A separate complete invocation proves real polling waits against server
      // polls, then a controlled duplicate must violate that independent count.
      const fresh = yield* temporary;
      yield* configure(fresh.path, f.auth.url);
      yield* f.auth.reset;
      f.auth.setOutcome("approved");
      const completeReceipt = join(artifacts, "complete.receipt.json");
      const successful = yield* run("source", loginArgs, fresh.path, {
        ...f.environment,
        ...rootEnvironment(fresh.path),
        AXM_TRACE: "1",
        AXM_TRACE_ENDPOINT: seqEndpoint(),
        AXM_TRACE_RECEIPT: completeReceipt,
      });
      expect(successful.exitCode, successful.stderr).toBe(0);
      expect(successful.stdout).toBe(completed.stdout);
      const polls = f.auth
        .requests()
        .filter((request) => request.pathname === "/v1/auth/token").length;
      expect(polls).toBe(1);
      const expected = join(artifacts, "expected.json");
      yield* writeJson(expected, {
        work: [
          {
            kind: "axm.http.request",
            count: f.auth.requests().length,
            executed: f.auth.requests().length,
          },
        ],
        spans: [{ name: "axm.auth.poll-wait", count: polls }],
      });
      const summary = yield* inspectEventually(completeReceipt, expected);
      const waits = summary.waits.filter((wait) => wait.name === "axm.auth.poll-wait");
      expect(waits).toHaveLength(polls);
      expect(waits[0]?.elapsedMs).toBeGreaterThanOrEqual(950);
      const tree = join(artifacts, "complete.tree.json");
      yield* retrieveTree(summary.traceId, tree);
      const duplicate = yield* inspectFixture(completeReceipt, tree, expected, "duplicate-wait");
      expect(duplicate.exitCode, duplicate.stdout).toBe(1);
      expect(duplicate.json).toMatchObject({ code: "expectation-mismatch" });
      yield* writeJson(join(artifacts, "complete.inspection.json"), summary);
      yield* writeJson(join(artifacts, "duplicate-wait.json"), duplicate.json);
      expect(snapshotFiles(f.home)).toEqual(snapshotFiles(fresh.path));
    }).pipe(Effect.scoped),
  );

  it.live(
    "keeps collector rejection/stall separate from product output, requests and credential state",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* authenticate(f.home, f.environment);
        const baseline = yield* run("compiled", whoamiArgs, f.home, f.environment);
        const before = snapshotFiles(f.home);
        const artifacts = yield* evidenceDirectory("collector-failure");
        for (const behavior of ["reject", "stall"] as const) {
          yield* f.auth.reset;
          const relay = yield* startTraceRelay(seqEndpoint(), behavior);
          const receipt = join(artifacts, behavior + ".receipt.json");
          const processStarted = performance.now();
          const result = yield* run("compiled", whoamiArgs, f.home, {
            ...f.environment,
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: relay.url,
            AXM_TRACE_RECEIPT: receipt,
          });
          const processElapsedMillis = performance.now() - processStarted;
          const receiptValue = yield* readJson(receipt);
          const completedTimings = Schema.Struct({
            producerComplete: Schema.Literal(true),
            timings: Schema.Struct({
              startupMillis: Schema.Number,
              executionMillis: Schema.Number,
              runtimeElapsedAtExecutionEndMillis: Schema.Number,
              exportFinalizationMillis: Schema.Number,
            }),
          });
          const timings = Schema.is(completedTimings)(receiptValue) ? receiptValue.timings : null;
          yield* writeJson(join(artifacts, behavior + ".output.json"), { baseline, result });
          expect(comparableProduct(result)).toEqual(comparableProduct(baseline));
          expect(snapshotFiles(f.home)).toEqual(before);
          expect(f.auth.requests()).toHaveLength(1);
          expect(relay.payloads.length).toBeGreaterThan(0);
          const diagnostic = yield* inspectReceipt(receipt);
          expect(diagnostic.exitCode).toBe(1);
          expect(diagnostic.json).toMatchObject({ evidence: "failed" });
          yield* writeJson(join(artifacts, behavior + ".inspection.json"), diagnostic.json);
          yield* writeJson(join(artifacts, behavior + ".oracle.json"), {
            product: result,
            requests: f.auth.requests(),
            before,
            after: snapshotFiles(f.home),
            batches: relay.payloads.length,
            timing: {
              processElapsedMillis,
              receiptTimings: timings,
              diagnosticCleanupUpperBoundMillis:
                timings === null
                  ? null
                  : processElapsedMillis - timings.runtimeElapsedAtExecutionEndMillis,
              declaredCleanupBudgetMillis: 500,
              evaluation:
                "Recorded for isolated budget evaluation; this E2E does not assert a noisy host-speed threshold.",
            },
          });
        }
      }).pipe(Effect.scoped),
  );

  it.live("cannot certify a process killed while an actual identity request is held", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const registryRelay = yield* startTraceRelay(f.auth.url);
      yield* configure(f.home, registryRelay.url);
      yield* authenticate(f.home, f.environment);
      const before = snapshotFiles(f.home);
      const requestsBefore = registryRelay.payloads.length;
      registryRelay.setBehavior("hold");
      const artifacts = yield* evidenceDirectory("forced-kill");
      const receipt = join(artifacts, "unfinished.receipt.json");
      const child = yield* startKilledInvocation(whoamiArgs, f.home, {
        ...f.environment,
        AXM_TRACE: "1",
        AXM_TRACE_ENDPOINT: seqEndpoint(),
        AXM_TRACE_RECEIPT: receipt,
      });
      yield* waitUntil(
        () => registryRelay.payloads.length > requestsBefore && fs.existsSync(receipt),
      );
      child.child.kill("SIGKILL");
      expect(yield* child.closed).toBe("SIGKILL");
      const unfinished = yield* readJson(receipt);
      expect(Schema.is(Schema.Struct({ producerComplete: Schema.Literal(true) }))(unfinished)).toBe(
        false,
      );
      const inspected = yield* inspectReceipt(receipt);
      expect(inspected.exitCode).toBe(1);
      expect(inspected.json).toMatchObject({ evidence: "failed", code: "producer-incomplete" });
      expect(snapshotFiles(f.home)).toEqual(before);
      yield* writeJson(join(artifacts, "inspection.json"), inspected.json);
      yield* writeJson(join(artifacts, "oracle.json"), {
        signal: "SIGKILL",
        heldRequests: registryRelay.payloads.length - requestsBefore,
        before,
        after: snapshotFiles(f.home),
      });
    }).pipe(Effect.scoped),
  );
});
