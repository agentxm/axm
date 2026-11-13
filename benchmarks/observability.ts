/** Opt-in, uncached process evidence. Missing scope and failed oracles never become a pass. */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import {
  inspectLocalTrace,
  TraceReceiptSchema,
  traceRetrievalPlan,
  decodeTraceRetrieval,
  type TraceReceipt,
  type TraceWorkSummary,
} from "axm.sh/runtime";
import {
  BinaryManifestSchema,
  ObservabilityBenchmarkFailure,
  ObservabilityBudgetsSchema,
  assessObservabilityEvidence,
  assessScenarioTiming,
  observationLimitIssues,
  observationPairIssues,
  timingBlockOrder,
  traceModes,
  verifyBinaryIdentity,
  type BinaryManifest,
  type ObservationSample,
  type TraceMode,
} from "./observability-contract.js";
import {
  discoverObservabilityRoutes,
  makeObservabilityCoverage,
} from "./observability-coverage.js";
import {
  copyTemplate,
  captureContainerReceiptEvidence,
  containerReceiptComparison,
  verifyContainerReceiptEvidence,
  prepareObservabilityFixtures,
  type ObservabilityScenario,
  type PrepareInvocation,
} from "./observability-fixtures.js";
import {
  compressObservationArtifacts,
  digest,
  hostResourceSnapshot,
  normalizeObservation,
  outputDigest,
  projectPlanEvaluationTime,
  progressComparisonNormalization,
  runObservedProcess,
  snapshotDigest,
  snapshotTree,
  volatileComparisonFields,
} from "./observability-process.js";
import { prepareObservabilityModeFixtures } from "./observability-mode-fixtures.js";
import { harnessProvenance } from "./observability-provenance.js";

const readJson = (file: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(fs.readFileSync(file, "utf8")),
    catch: () =>
      new ObservabilityBenchmarkFailure({
        code: "input",
        message: "Cannot read JSON input: " + file,
      }),
  });
const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const fail = (code: string, message: string) =>
  new ObservabilityBenchmarkFailure({ code, message });

const deliveredReuseKinds: ReadonlyArray<string> = [
  "axm.observation.reuse",
  "axm.observation.pack-reuse",
  "axm.resolve.desired-state-reuse",
  "axm.registry.metadata-reuse",
  "axm.auth.cache",
];
const deliveredReuseComparison = {
  kinds: deliveredReuseKinds,
  dimension: "axm.cache.outcome",
  values: ["hit", "coalesced"],
  comparedAs: "delivered-reuse",
  condition:
    "Successful rows only: positive integer count=requested=reused, executed=0, all three counters fully measured; axm.work.reused, if present, must be true.",
  preservation:
    "Only the completed-versus-pending reuse label is projected for cross-run comparison. Raw facts, receipts and inspections retain it; all other dimensions, owner grouping, quantities and measurement coverage remain significant.",
};

const isDeliveredReuse = (row: TraceWorkSummary): boolean =>
  deliveredReuseKinds.includes(row.kind) &&
  (row.dimensions["axm.cache.outcome"] === "hit" ||
    row.dimensions["axm.cache.outcome"] === "coalesced") &&
  row.dimensions["axm.outcome"] === "success" &&
  (row.dimensions["axm.work.reused"] === undefined || row.dimensions["axm.work.reused"] === true) &&
  Number.isSafeInteger(row.count) &&
  row.count > 0 &&
  row.requested === row.count &&
  row.executed === 0 &&
  row.reused === row.count &&
  Object.entries({
    "axm.work.requested": row.count,
    "axm.work.executed": 0,
    "axm.work.reused-count": row.count,
  }).every(([field, total]) => {
    const measurement = row.measurements[field];
    return (
      measurement?.total === total &&
      measurement.measured === row.count &&
      measurement.occurrences === row.count
    );
  });

const periodicMaintenanceComparison = {
  kind: "axm.native.lock-io",
  phase: "heartbeat",
  operations: ["stat", "utimes"],
  condition:
    "Successful positive-integer count=executed rows only, with complete executed and duration measurements, no additional quantities or dimensions beyond native operation/phase, outcome and owner.",
  rationale:
    "Periodic lock refresh depends on actual hold duration and timer scheduling. Exact per-invocation observations remain in trace.periodicMaintenance and the raw inspection; they are separate from deterministic cross-run work equality.",
};

const isPeriodicMaintenance = (row: TraceWorkSummary): boolean => {
  const executed = row.measurements["axm.work.executed"];
  const duration = row.measurements["axm.summary.work-duration-us"];
  return (
    row.kind === "axm.native.lock-io" &&
    row.dimensions["axm.native.phase"] === "heartbeat" &&
    (row.dimensions["axm.native.operation"] === "stat" ||
      row.dimensions["axm.native.operation"] === "utimes") &&
    row.dimensions["axm.outcome"] === "success" &&
    typeof row.dimensions["axm.work.owner"] === "string" &&
    row.dimensions["axm.work.owner"].length > 0 &&
    Object.keys(row.dimensions).every((key) =>
      ["axm.native.phase", "axm.native.operation", "axm.outcome", "axm.work.owner"].includes(key),
    ) &&
    Number.isSafeInteger(row.count) &&
    row.count > 0 &&
    row.executed === row.count &&
    executed?.total === row.count &&
    executed.measured === row.count &&
    executed.occurrences === row.count &&
    duration !== undefined &&
    Number.isFinite(duration.total) &&
    duration.total >= 0 &&
    duration.measured === row.count &&
    duration.occurrences === row.count &&
    row.workDurationMs === duration.total / 1000 &&
    Object.keys(row.measurements).length === 2 &&
    [
      row.requested,
      row.reused,
      row.bytes,
      row.ioBytes,
      row.archiveBytes,
      row.workCount,
      row.batchItems,
      row.registryBatchItems,
      row.archiveEntries,
      row.deniedItems,
    ].every((value) => value === null)
  );
};

/** Exact observations retained alongside the deterministic comparison, never rewritten. */
export const periodicMaintenanceWork = (work: ReadonlyArray<TraceWorkSummary>) =>
  work.filter(isPeriodicMaintenance);

/** Compare deterministic work; preserve duration-dependent maintenance separately. */
export const workDigest = (work: ReadonlyArray<TraceWorkSummary>): string => {
  const groups = new Map<string, Array<number | null>>();
  const measured = new Map<
    string,
    Map<string, { total: number; measured: number; occurrences: number }>
  >();
  for (const row of work) {
    if (isPeriodicMaintenance(row)) continue;
    const deliveredReuse = isDeliveredReuse(row);
    const key = JSON.stringify([
      row.kind,
      row.ownerName,
      Object.entries(row.dimensions)
        .map(
          ([key, value]) =>
            [
              key,
              key === "axm.cache.outcome" && deliveredReuse
                ? deliveredReuseComparison.comparedAs
                : value,
            ] as const,
        )
        .sort(([a], [b]) => a.localeCompare(b)),
    ]);
    const totals = groups.get(key) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const values = [
      row.count,
      row.requested,
      row.executed,
      row.reused,
      row.bytes,
      row.ioBytes,
      row.archiveBytes,
      row.workCount,
      row.batchItems,
      row.registryBatchItems,
      row.archiveEntries,
      row.deniedItems,
    ];
    const partial =
      measured.get(key) ??
      new Map<string, { total: number; measured: number; occurrences: number }>();
    for (const [field, observation] of Object.entries(row.measurements)) {
      if (field === "axm.summary.work-duration-us") continue;
      const prior = partial.get(field) ?? { total: 0, measured: 0, occurrences: 0 };
      partial.set(field, {
        total: prior.total + observation.total,
        measured: prior.measured + observation.measured,
        occurrences: prior.occurrences + observation.occurrences,
      });
    }
    measured.set(key, partial);
    groups.set(
      key,
      totals.map((total, index) => {
        const value = values[index];
        return total === null || value === null || value === undefined ? null : total + value;
      }),
    );
  }
  return digest(
    JSON.stringify(
      [...groups]
        .map(([key, totals]) => [
          key,
          totals,
          [...(measured.get(key) ?? [])].sort(([a], [b]) => a.localeCompare(b)),
        ])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ),
  );
};

const childEnvironment = (
  fixture: { readonly workspace: string; readonly home: string },
  extra: Readonly<Record<string, string>> = {},
) => ({
  PATH: process.env["PATH"],
  HOME: fixture.home,
  AXM_USER_HOME: fixture.home,
  XDG_CACHE_HOME: path.join(fixture.home, "cache"),
  AXM_NO_UPDATE_CHECK: "1",
  AXM_TELEMETRY: "0",
  CI: "1",
  NO_COLOR: "1",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  TZ: "UTC",
  ...extra,
});
const cliArgs = (args: ReadonlyArray<string>, json = true): ReadonlyArray<string> => [
  ...args,
  ...(json ? ["--json"] : []),
  "--non-interactive",
];

const readManifest = Effect.fnUntraced(function* (file: string | undefined, label: string) {
  if (file === undefined)
    return yield* fail(
      "manifest",
      "Set AXM_OBSERVABILITY_" + label + "_MANIFEST to an immutable binary provenance JSON file.",
    );
  const manifest = yield* readJson(file).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(BinaryManifestSchema)),
  );
  if (
    manifest.sourceDirty &&
    (manifest.sourceDiffSha256 === undefined || manifest.sourceDiffPath === undefined)
  )
    return yield* fail(
      "manifest",
      "A dirty source manifest requires sourceDiffSha256 and sourceDiffPath for its retained source diff artifact, including new files.",
    );
  if (
    manifest.sourceDiffPath !== undefined &&
    digest(fs.readFileSync(manifest.sourceDiffPath)) !== manifest.sourceDiffSha256
  )
    return yield* fail(
      "manifest",
      "The retained source diff artifact does not match its manifest digest.",
    );
  const binaryPath = path.resolve(manifest.binaryPath);
  const actual = yield* Effect.try({
    try: () => digest(fs.readFileSync(binaryPath)),
    catch: () => fail("binary", "Cannot read the " + label + " executable."),
  });
  yield* verifyBinaryIdentity(manifest, actual);
  return { ...manifest, binaryPath };
});

const normalizedRequestRecords = (scenario: ObservabilityScenario) =>
  (scenario.requests?.() ?? scenario.registry?.timeline() ?? [])
    .map((record) => ({
      key: record.key,
      status: record.status,
      responseBytes: record.responseBytes,
      archiveBody: record.archiveBody,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

export const runObservabilityBenchmark = (repoRoot: string) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        if (process.platform !== "linux" || process.arch !== "x64")
          return yield* fail(
            "host",
            "The declared reference campaign requires Linux x64 and GNU time.",
          );
        const runMode = process.env["AXM_OBSERVABILITY_RUN"] ?? "fixtures";
        if (runMode !== "fixtures" && runMode !== "measure")
          return yield* fail("configuration", "AXM_OBSERVABILITY_RUN must be fixtures or measure.");
        if (runMode === "measure" && process.env["AXM_OBSERVABILITY_REFERENCE_HOST"] !== "1")
          return yield* fail(
            "host",
            "Measurement requires an isolated reference host; set AXM_OBSERVABILITY_REFERENCE_HOST=1 only after establishing that condition.",
          );
        const baseline = yield* readManifest(
          process.env["AXM_OBSERVABILITY_BASELINE_MANIFEST"],
          "BASELINE",
        );
        const candidate = yield* readManifest(
          process.env["AXM_OBSERVABILITY_CANDIDATE_MANIFEST"],
          "CANDIDATE",
        );
        const budgetsPath = path.join(repoRoot, "benchmarks", "observability-budgets.json");
        const budgets = yield* readJson(budgetsPath).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ObservabilityBudgetsSchema)),
        );
        const output = path.resolve(
          process.env["AXM_OBSERVABILITY_OUTPUT"] ??
            path.join(repoRoot, "test-results", "benchmarks", "observability"),
        );
        if (fs.existsSync(output))
          return yield* fail(
            "existing-output",
            "Choose a fresh AXM_OBSERVABILITY_OUTPUT directory; evidence is never overwritten.",
          );
        fs.mkdirSync(output, { recursive: true, mode: 0o700 });
        for (const [label, manifest] of [
          ["baseline", baseline],
          ["candidate", candidate],
        ] as const)
          if (manifest.sourceDiffPath !== undefined)
            fs.copyFileSync(manifest.sourceDiffPath, path.join(output, label + "-source.diff"));
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-observability-"));
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
        );
        const samples: ObservationSample[] = [];
        const fixtureChecks: Array<{
          scenario: string;
          mode: TraceMode;
          exitCode: number;
          artifacts: string;
          baselineArtifacts: string;
          comparisonVerified: boolean;
          comparisonIssues: ReadonlyArray<string>;
          trace?: ObservationSample["trace"];
        }> = [];
        let coverage = makeObservabilityCoverage([]);
        let scenarioIds: string[] = [];
        let scenarioMetadata: ReadonlyArray<{
          readonly id: string;
          readonly command: string;
          readonly args: ReadonlyArray<string>;
          readonly condition: ObservabilityScenario["condition"];
          readonly expectedExitCode: number;
          readonly detailSelection: TraceReceipt["detailSelection"];
          readonly detailSelectionReason: string;
        }> = [];
        let preparation = 0;
        let discovery = 0;
        let inTimingBlock = false;
        const artifactBytes = { raw: 0, compressed: 0 };
        writeJson(path.join(output, "host-preflight.json"), hostResourceSnapshot(output));
        const harness = yield* Effect.try(() => harnessProvenance(repoRoot, "scripts/bench.ts"));
        writeJson(path.join(output, "harness-modules.json"), harness);
        const provenance = {
          schemaVersion: 2,
          runMode,
          startedAt: new Date().toISOString(),
          baseline,
          candidate,
          host: {
            platform: os.platform(),
            architecture: os.arch(),
            release: os.release(),
            cpu: os.cpus()[0]?.model,
            cpus: os.cpus().length,
            memoryBytes: os.totalmem(),
            isolationDeclared: process.env["AXM_OBSERVABILITY_REFERENCE_HOST"] === "1",
          },
          budgetsSha256: digest(fs.readFileSync(budgetsPath)),
          budgets,
          harnessSha256: harness.sha256,
          dependencyLockSha256: digest(fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"))),
          normalization: {
            protocolFields: [...volatileComparisonFields],
            progress: progressComparisonNormalization,
            deliveredReuse: deliveredReuseComparison,
            periodicMaintenance: periodicMaintenanceComparison,
            containerReceipts: containerReceiptComparison,
            fixtureRoots:
              "Temporary workspace/home roots normalize to indexed markers; raw bytes and hashes are retained.",
            requestOrder:
              "Compare request multiset; preserve original server timeline independently.",
          },
        };
        const save = (complete: boolean, error?: string) =>
          writeJson(path.join(output, "report.json"), {
            ...provenance,
            complete,
            invocationCounts: {
              discovery,
              preparation,
              scheduledPreflight: scenarioIds.length * 4,
              scheduledInitialTiming: scenarioIds.length * 24,
              actualTiming: samples.length,
            },
            updatedAt: new Date().toISOString(),
            artifactBytes,
            coverage,
            scenarios: scenarioIds,
            scenarioMetadata,
            fixtureChecks,
            samples,
            tracePreflight: {
              expectedTraces: scenarioIds.length * 2,
              inspectedTraces: fixtureChecks.filter((check) => check.trace !== undefined).length,
              rawRetrievedBytes: fixtureChecks.reduce(
                (total, check) => total + (check.trace?.retrievalBytes ?? 0),
                0,
              ),
              maximumRetrievedTraceBytes: Math.max(
                0,
                ...fixtureChecks.map((check) => check.trace?.retrievalBytes ?? 0),
              ),
              interpretation:
                "Exact receiver inspection occurs only in preflight. Timing keeps active export and producer receipts but does not individually inspect delivery. Receiver growth and ingestion health require independent observations.",
            },
            assessment: assessObservabilityEvidence(
              budgets,
              coverage,
              scenarioIds,
              samples,
              fixtureChecks,
            ),
            ...(error === undefined ? {} : { error }),
          });
        save(false);
        const prepare: PrepareInvocation = Effect.fnUntraced(function* (fixture, args, options) {
          const artifacts = path.join(output, "preparation", String(preparation++));
          const observed = yield* runObservedProcess({
            executable: baseline.binaryPath,
            args: cliArgs(args, options?.json !== false),
            cwd: fixture.workspace,
            environment: childEnvironment(fixture, options?.environment),
            artifacts,
          });
          const matched =
            options?.expectedExitCode === "nonzero"
              ? observed.exitCode !== 0
              : observed.exitCode === (options?.expectedExitCode ?? 0);
          if (!matched)
            return yield* fail(
              "fixture-preparation",
              "Fixture preparation failed: " +
                args.join(" ") +
                " (" +
                observed.exitCode +
                "). See retained process output.",
            );
          if (!inTimingBlock) {
            const sizes = compressObservationArtifacts(artifacts);
            artifactBytes.raw += sizes.rawBytes;
            artifactBytes.compressed += sizes.compressedBytes;
          }
          return observed;
        });
        const campaign = Effect.gen(function* () {
          const inventoryFixture = {
            workspace: path.join(root, "inventory/workspace"),
            home: path.join(root, "inventory/home"),
          };
          fs.mkdirSync(inventoryFixture.workspace, { recursive: true });
          fs.mkdirSync(inventoryFixture.home, { recursive: true });
          const commands = yield* discoverObservabilityRoutes(
            Effect.fnUntraced(function* (route) {
              discovery++;
              const artifacts = path.join(
                output,
                "inventory",
                route.replaceAll(" ", "-") || "root",
              );
              const result = yield* runObservedProcess({
                executable: candidate.binaryPath,
                args: cliArgs([...(route === "" ? [] : route.split(" ")), "--help"]),
                cwd: inventoryFixture.workspace,
                environment: childEnvironment(inventoryFixture),
                artifacts,
              });
              if (result.exitCode !== 0)
                return yield* fail(
                  "command-inventory",
                  "Candidate public help failed for " + route,
                );
              const sizes = compressObservationArtifacts(artifacts);
              artifactBytes.raw += sizes.rawBytes;
              artifactBytes.compressed += sizes.compressedBytes;
              return result.stdout;
            }),
          );
          writeJson(path.join(output, "commands.json"), commands);
          const fixtures = yield* prepareObservabilityFixtures(
            path.join(root, "templates"),
            prepare,
            {
              proxyApi: process.env["AXM_REGISTRY_NETWORK_API"] ?? "http://127.0.0.1:8474",
              proxyPort: Number(process.env["AXM_OBSERVABILITY_PROXY_PORT"] ?? 18089),
            },
          );
          const scenarios = yield* prepareObservabilityModeFixtures({
            root: path.join(root, "modes"),
            scenarios: fixtures.scenarios,
            commands,
            invoke: prepare,
          });
          coverage = makeObservabilityCoverage(scenarios, commands);
          scenarioIds = scenarios.map((scenario) => scenario.id);
          if (new Set(scenarioIds).size !== scenarioIds.length)
            return yield* fail("scenario-identity", "Scenario IDs must be unique.");
          for (const scenario of scenarios)
            if ((scenario.expectedExitCode ?? 0) !== 0 && scenario.verify === undefined)
              return yield* fail(
                "failure-oracle",
                "A nonzero scenario requires an independent semantic/state verifier: " +
                  scenario.id,
              );
          scenarioMetadata = scenarios.map((scenario) => ({
            id: scenario.id,
            command: scenario.command,
            args: scenario.args,
            condition: scenario.condition,
            expectedExitCode: scenario.expectedExitCode ?? 0,
            detailSelection: { kinds: ["io"], phase: scenario.detailPhase ?? null },
            detailSelectionReason: scenario.args.includes("--preview")
              ? "Preview does not acquire artifacts; retain unscoped I/O detail."
              : scenario.detailPhase === "acquisition"
                ? "Registry sync restoration observes acquisition I/O at every declared size/cache condition."
                : "Unscoped I/O detail.",
          }));
          writeJson(path.join(output, "scenarios.json"), scenarioMetadata);
          save(false);
          const filter = process.env["AXM_OBSERVABILITY_SCENARIO_FILTER"];
          if (runMode === "measure" && filter !== undefined)
            return yield* fail(
              "partial-campaign",
              "A measured campaign cannot exclude scenarios; use fixtures mode for a focused diagnostic.",
            );
          if (runMode === "measure" && coverage.some((entry) => entry.status !== "implemented"))
            return yield* fail(
              "coverage",
              "Successful fixtures are still missing; inspect report.json coverage before collection.",
            );
          const selectors = filter
            ?.split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
          const selected =
            selectors === undefined
              ? scenarios
              : scenarios.filter((scenario) =>
                  selectors.some((selector) => scenario.id.includes(selector)),
                );
          if (selected.length === 0)
            return yield* fail("scenario-selection", "The fixture selection is empty.");
          const seqEnvironment = {
            ...process.env,
            SEQCLI_CONNECTION_SERVERURL:
              process.env["SEQCLI_CONNECTION_SERVERURL"] ?? "http://127.0.0.1:5341",
          };
          {
            const version = yield* runObservedProcess({
              executable: "mise",
              args: ["exec", "--", "seqcli", "version"],
              cwd: repoRoot,
              environment: seqEnvironment,
              artifacts: path.join(output, "seq-version"),
              measureRss: false,
              timeoutMillis: 15_000,
            });
            const pinned = /"github:datalust\/seqcli"\s*=\s*"([0-9.]+)"/.exec(
              fs.readFileSync(path.join(repoRoot, "mise.toml"), "utf8"),
            )?.[1];
            if (
              version.exitCode !== 0 ||
              pinned === undefined ||
              version.stdout.trim().split("+")[0] !== pinned
            )
              return yield* fail(
                "seq-version",
                "The query client does not match the repository's Seq pin.",
              );
          }
          const sampleId = (
            scenario: ObservabilityScenario,
            phase: "preflight" | "timing",
            mode: TraceMode,
            subject: "baseline" | "candidate",
            iteration: number,
            warmup: boolean,
          ) =>
            [
              phase,
              scenario.id,
              mode,
              subject,
              phase === "preflight" ? "validation" : warmup ? "warmup" : "measured",
              iteration,
            ].join("/");
          const execute = Effect.fnUntraced(function* (
            scenario: ObservabilityScenario,
            phase: "preflight" | "timing",
            binary: BinaryManifest,
            mode: TraceMode,
            subject: "baseline" | "candidate",
            iteration: number,
            warmup: boolean,
          ) {
            const id = sampleId(scenario, phase, mode, subject, iteration, warmup);
            const artifacts = path.join(output, "samples", id);
            fs.mkdirSync(artifacts, { recursive: true });
            const sampleRoot = path.join(root, "sample");
            fs.rmSync(sampleRoot, { recursive: true, force: true });
            const fixture = copyTemplate(scenario.template, sampleRoot);
            if (scenario.prepare !== undefined) yield* scenario.prepare(fixture, prepare);
            if (scenario.external !== undefined) yield* scenario.external.reset;
            const receiptBefore = yield* captureContainerReceiptEvidence({
              fixture,
              artifacts,
              phase,
              stage: "before",
            });
            const roots = [
              fixture.workspace,
              fixture.home,
              scenario.template.workspace,
              scenario.template.home,
            ];
            const before =
              phase !== "preflight"
                ? undefined
                : {
                    workspace: snapshotTree(fixture.workspace, roots),
                    home: snapshotTree(fixture.home, roots),
                    external: scenario.external?.snapshot(),
                  };
            const beforeExternalComparison =
              before === undefined
                ? undefined
                : (scenario.external?.comparison?.() ?? before.external);
            const protectedExternalBefore =
              before === undefined
                ? undefined
                : (scenario.external?.protectedState?.() ?? before.external);
            if (before !== undefined) writeJson(path.join(artifacts, "before.json"), before);
            scenario.registry?.reset(true);
            const traceEnabled = subject === "candidate" && mode !== "disabled";
            const detailSelection: TraceReceipt["detailSelection"] =
              mode === "detail"
                ? { kinds: ["io"], phase: scenario.detailPhase ?? null }
                : { kinds: [], phase: null };
            const receiptPath = path.join(artifacts, "receipt.json");
            if (phase === "preflight")
              writeJson(path.join(artifacts, "host-before.json"), hostResourceSnapshot(artifacts));
            const startedAtMillis = Date.now();
            const result = yield* runObservedProcess({
              executable: binary.binaryPath,
              args: cliArgs(scenario.args, scenario.json !== false),
              cwd: fixture.workspace,
              environment: childEnvironment(fixture, {
                ...scenario.environment,
                ...(traceEnabled
                  ? {
                      AXM_TRACE: "1",
                      AXM_TRACE_DETAIL: detailSelection.kinds.join(","),
                      AXM_TRACE_DETAIL_PHASE: detailSelection.phase ?? "",
                      AXM_TRACE_RECEIPT: receiptPath,
                      ...(process.env["AXM_TRACE_ENDPOINT"] === undefined
                        ? {}
                        : { AXM_TRACE_ENDPOINT: process.env["AXM_TRACE_ENDPOINT"] }),
                      ...(process.env["AXM_TRACE_API_KEY"] === undefined
                        ? {}
                        : { AXM_TRACE_API_KEY: process.env["AXM_TRACE_API_KEY"] }),
                    }
                  : { AXM_TRACE: "off" }),
              }),
              artifacts,
            });
            const endedAtMillis = Date.now();
            const receiptAfter = yield* captureContainerReceiptEvidence({
              fixture,
              artifacts,
              phase,
              stage: "after",
            });
            if (phase === "preflight")
              writeJson(path.join(artifacts, "host-after.json"), hostResourceSnapshot(artifacts));
            const after =
              phase !== "preflight"
                ? undefined
                : {
                    workspace: snapshotTree(fixture.workspace, roots),
                    home: snapshotTree(fixture.home, roots),
                    external: scenario.external?.snapshot(),
                  };
            const afterExternalComparison =
              after === undefined
                ? undefined
                : (scenario.external?.comparison?.() ?? after.external);
            if (after !== undefined) writeJson(path.join(artifacts, "after.json"), after);
            if (phase === "preflight" && scenario.external?.comparison !== undefined)
              writeJson(path.join(artifacts, "external-comparison.json"), {
                description: scenario.external.comparisonDescription,
                before: beforeExternalComparison,
                after: afterExternalComparison,
              });
            if (scenario.preserveState && before !== undefined && after !== undefined) {
              // AXM may populate its archive cache during assessment. The complete raw home inventory is retained.
              const protectedHome = (entries: typeof before.home) =>
                entries.filter(
                  (entry) =>
                    entry.path !== ".cache/axm" &&
                    !entry.path.startsWith(".cache/axm/") &&
                    !(entry.path === ".cache" && entry.kind === "directory"),
                );
              const protectedExternalAfter =
                scenario.external?.protectedState?.() ?? after.external;
              if (
                snapshotDigest(before.workspace) !== snapshotDigest(after.workspace) ||
                snapshotDigest(protectedHome(before.home)) !==
                  snapshotDigest(protectedHome(after.home)) ||
                JSON.stringify(normalizeObservation(protectedExternalBefore, roots)) !==
                  JSON.stringify(normalizeObservation(protectedExternalAfter, roots))
              )
                return yield* fail(
                  "preview-mutation",
                  "Preview changed protected product state: " + scenario.id,
                );
            }
            const requests = normalizedRequestRecords(scenario);
            const independentWork = scenario.workExpectations?.() ?? [];
            writeJson(path.join(artifacts, "oracle.json"), {
              requests,
              timeline: scenario.requests?.() ?? scenario.registry?.timeline() ?? [],
              metrics: scenario.registry?.metrics() ?? null,
              workExpectations: independentWork,
              observation:
                phase === "preflight"
                  ? "Independent server/process records, operation assertions and full before/after state; internal filesystem read counts use separate port evidence."
                  : "Timing phase: essential process/output/request and operation assertions only; full state and receiver delivery were inspected in preflight.",
            });
            if (result.exitCode !== (scenario.expectedExitCode ?? 0))
              return yield* fail(
                "scenario-failed",
                "Scenario exit differs from its declared outcome: " +
                  id +
                  " (" +
                  result.exitCode +
                  "). Raw output is retained.",
              );
            const receiptVerification =
              phase === "preflight"
                ? yield* verifyContainerReceiptEvidence(scenario.template, {
                    before: receiptBefore,
                    after: receiptAfter,
                  })({
                    fixture,
                    phase,
                    artifacts,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    startedAtMillis,
                    endedAtMillis,
                  })
                : undefined;
            const operationVerification =
              scenario.verify === undefined
                ? undefined
                : yield* scenario.verify({
                    fixture,
                    phase,
                    artifacts,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    startedAtMillis,
                    endedAtMillis,
                  });
            const verification =
              receiptVerification === undefined
                ? operationVerification
                : {
                    ...operationVerification,
                    assertions: [
                      ...receiptVerification.assertions,
                      ...(operationVerification?.assertions ?? [
                        "Declared process outcome and raw output/request evidence retained for comparison.",
                      ]),
                    ],
                    fileComparisons: [
                      ...(receiptVerification.fileComparisons ?? []),
                      ...(operationVerification?.fileComparisons ?? []),
                    ],
                  };
            const comparisonTargets =
              verification?.fileComparisons?.map((entry) => entry.container + "/" + entry.path) ??
              [];
            if (new Set(comparisonTargets).size !== comparisonTargets.length)
              return yield* fail(
                "comparison-projection",
                "Receipt and operation verifiers cannot project the same product file twice.",
              );
            writeJson(
              path.join(artifacts, "semantic-verification.json"),
              verification ?? {
                assertions: [
                  "Declared process outcome and raw output/request evidence retained for comparison.",
                ],
              },
            );
            for (const retained of verification?.retainedArtifacts ?? []) {
              if (!/^[a-z0-9-]+$/.test(retained.name))
                return yield* fail(
                  "retained-artifact",
                  "A fixture artifact must use a bounded local name.",
                );
              const destination = path.join(artifacts, "retained", retained.name);
              fs.mkdirSync(path.dirname(destination), { recursive: true });
              fs.cpSync(retained.source, destination, {
                recursive: true,
                verbatimSymlinks: true,
                preserveTimestamps: true,
              });
            }
            let comparedWorkspace = after?.workspace;
            let comparedHome = after?.home;
            if (phase === "preflight")
              for (const projection of verification?.fileComparisons ?? []) {
                const entries =
                  projection.container === "workspace" ? comparedWorkspace : comparedHome;
                if (
                  entries === undefined ||
                  !entries.some((entry) => entry.path === projection.path && entry.kind === "file")
                )
                  return yield* fail(
                    "comparison-projection",
                    "A fixture comparison projection names an absent product file.",
                  );
                const rawProjectionPath = path.join(
                  artifacts,
                  "raw-projections",
                  projection.container,
                  projection.path,
                );
                fs.mkdirSync(path.dirname(rawProjectionPath), { recursive: true });
                fs.copyFileSync(
                  path.join(fixture[projection.container], projection.path),
                  rawProjectionPath,
                );
                const projected = entries.map((entry) =>
                  entry.path === projection.path
                    ? { ...entry, comparisonSha256: projection.sha256 }
                    : entry,
                );
                if (projection.container === "workspace") comparedWorkspace = projected;
                else comparedHome = projected;
              }
            let trace: ObservationSample["trace"];
            if (traceEnabled) {
              const receiptInput = yield* readJson(receiptPath);
              const receipt = yield* Schema.decodeUnknownEffect(TraceReceiptSchema)(receiptInput);
              if (
                receipt.commandRoute !== (scenario.command || "root") ||
                receipt.mode !== mode ||
                receipt.detailSelection.phase !== detailSelection.phase ||
                receipt.detailSelection.kinds.join(",") !== detailSelection.kinds.join(",")
              )
                return yield* fail(
                  "trace-command-identity",
                  "The completed receipt does not identify the selected fixture command, capture mode and detail scope.",
                );
              if (
                receipt.build.revision !== binary.sourceRevision ||
                receipt.build.dirty !== binary.sourceDirty ||
                receipt.build.execution !== "compiled"
              )
                return yield* fail(
                  "trace-build-provenance",
                  "The completed receipt does not match the compiled binary's source manifest.",
                );
              if (
                !receipt.producerComplete ||
                receipt.timings === null ||
                receipt.droppedSpanCount !== 0 ||
                receipt.droppedAggregateEventCount !== 0 ||
                receipt.unrecognizedSpanCount !== 0 ||
                receipt.unrecognizedAttributeCount !== 0 ||
                receipt.summaryOverflowCount !== 0
              )
                return yield* fail(
                  "trace-producer-incomplete",
                  "Producer accounting did not complete without loss, unknown data or overflow.",
                );
              const shutdownUpperBound =
                result.durationMs - receipt.timings.runtimeElapsedAtExecutionEndMillis;
              if (shutdownUpperBound < 0)
                return yield* fail(
                  "timing-oracle",
                  "The producer runtime interval exceeds independent process elapsed.",
                );
              trace = {
                complete: true,
                delivery: "not-individually-inspected",
                periodicMaintenance: null,
                retainedSpanCount: receipt.retainedSpanCount,
                retainedDetailSpanCount: null,
                summaryGroups: receipt.aggregateEventCount,
                diagnosticShutdownMillis: shutdownUpperBound,
                exportFinalizationMillis: receipt.timings.exportFinalizationMillis,
                traceId: receipt.traceId,
                rootSpanId: receipt.spanId,
              };
              if (phase === "preflight") {
                const hasRequestOracle =
                  scenario.requests !== undefined || scenario.registry !== undefined;
                const expected = {
                  spans: [{ name: "axm.cli.command", count: 1 }],
                  work: [
                    ...independentWork,
                    ...(!hasRequestOracle
                      ? []
                      : [
                          {
                            kind: "axm.http.request",
                            count: requests.length,
                            executed: requests.length,
                          },
                          {
                            kind: "axm.registry.archive-body",
                            count: requests.filter((record) => record.archiveBody).length,
                            archiveBytes: requests
                              .filter((record) => record.archiveBody)
                              .reduce((total, record) => total + record.responseBytes, 0),
                          },
                        ]),
                  ],
                };
                writeJson(path.join(artifacts, "expectations.json"), expected);
                const retrieval = yield* traceRetrievalPlan(receipt);
                const retrieved = yield* runObservedProcess({
                  executable: "mise",
                  args: ["exec", "--", "seqcli", ...retrieval.args],
                  cwd: repoRoot,
                  environment: seqEnvironment,
                  artifacts: path.join(artifacts, "seq"),
                  measureRss: false,
                  timeoutMillis: 15_000,
                });
                if (retrieved.exitCode !== 0)
                  return yield* fail("seq-retrieval", "Exact trace retrieval failed for " + id);
                const tree = yield* Effect.try({
                  try: (): unknown => JSON.parse(retrieved.stdout),
                  catch: () => fail("seq-json", "Seq did not return a JSON trace tree."),
                });
                const inspected = yield* inspectLocalTrace(
                  receiptInput,
                  yield* decodeTraceRetrieval(receipt, tree),
                  { expected },
                );
                writeJson(path.join(artifacts, "inspection.json"), inspected);
                if (
                  scenario.args.includes("--preview") &&
                  inspected.invocation.attributes["axm.operation.mode"] !== "preview"
                )
                  return yield* fail(
                    "trace-operation-mode",
                    "The independently selected preview did not report preview mode.",
                  );
                if (
                  scenario.args.includes("--fix") &&
                  !scenario.args.includes("--preview") &&
                  inspected.invocation.attributes["axm.operation.mode"] !== "apply"
                )
                  return yield* fail(
                    "trace-operation-mode",
                    "The independently selected lint repair did not report apply mode.",
                  );
                trace = {
                  ...trace,
                  delivery: "inspected",
                  retainedDetailSpanCount: inspected.evidence.retainedDetailSpanCount,
                  summaryGroups: inspected.evidence.aggregateEventCount,
                  workDigest: workDigest(inspected.work),
                  periodicMaintenance: periodicMaintenanceWork(inspected.work),
                  retrievalBytes: Buffer.byteLength(retrieved.stdout),
                };
              }
            }
            const sample: ObservationSample = {
              id,
              phase,
              scenario: scenario.id,
              mode,
              subject,
              iteration,
              warmup,
              ...(phase !== "timing" || subject !== "candidate"
                ? {}
                : {
                    baselineId: sampleId(
                      scenario,
                      phase,
                      "disabled",
                      "baseline",
                      iteration,
                      warmup,
                    ),
                  }),
              durationMs: result.durationMs,
              peakRssBytes: result.peakRssBytes,
              exitCode: result.exitCode,
              expectedExitCode: scenario.expectedExitCode ?? 0,
              inputDigest:
                before === undefined
                  ? null
                  : digest(
                      snapshotDigest(before.workspace) +
                        snapshotDigest(before.home) +
                        JSON.stringify(normalizeObservation(beforeExternalComparison, roots)),
                    ),
              stdoutDigest: outputDigest(
                projectPlanEvaluationTime(
                  verification?.stdoutComparison ?? result.stdout,
                  startedAtMillis,
                  endedAtMillis,
                ),
                roots,
              ),
              stderrDigest: outputDigest(result.stderr, roots),
              postconditionDigest:
                comparedWorkspace === undefined || comparedHome === undefined
                  ? null
                  : digest(
                      snapshotDigest(comparedWorkspace) +
                        snapshotDigest(comparedHome) +
                        JSON.stringify(normalizeObservation(afterExternalComparison, roots)),
                    ),
              artifacts: path.relative(output, artifacts),
              oracle: {
                verified: true,
                requestCount: requests.length,
                requestDigest: digest(JSON.stringify(normalizeObservation(requests, roots))),
                evidence: path.relative(
                  output,
                  path.join(artifacts, phase === "preflight" ? "oracle.json.gz" : "oracle.json"),
                ),
              },
              ...(trace === undefined ? {} : { trace }),
            };
            writeJson(path.join(artifacts, "sample.json"), sample);
            const violations = observationLimitIssues(budgets, sample);
            if (violations.length > 0) return yield* fail("sample-limits", violations.join("; "));
            if (phase === "preflight") {
              const sizes = compressObservationArtifacts(artifacts);
              artifactBytes.raw += sizes.rawBytes;
              artifactBytes.compressed += sizes.compressedBytes;
            }
            return sample;
          });
          const activate = (scenario: ObservabilityScenario) =>
            fixtures.activate(scenario).pipe(Effect.andThen(scenario.activate ?? Effect.void));
          for (const scenario of selected) {
            yield* activate(scenario);
            const before = yield* execute(
              scenario,
              "preflight",
              baseline,
              "disabled",
              "baseline",
              0,
              false,
            );
            let summaryWork: string | undefined;
            for (const mode of traceModes) {
              const result = yield* execute(
                scenario,
                "preflight",
                candidate,
                mode,
                "candidate",
                0,
                false,
              );
              const comparisonIssues = [...observationPairIssues(before, result)];
              if (mode === "summary") summaryWork = result.trace?.workDigest;
              if (
                mode === "detail" &&
                (summaryWork === undefined || result.trace?.workDigest !== summaryWork)
              )
                comparisonIssues.push("Summary/detail work mismatch: " + scenario.id);
              fixtureChecks.push({
                scenario: scenario.id,
                mode,
                exitCode: result.exitCode,
                artifacts: result.artifacts,
                baselineArtifacts: before.artifacts,
                comparisonVerified: comparisonIssues.length === 0,
                comparisonIssues,
                ...(result.trace === undefined ? {} : { trace: result.trace }),
              });
              save(false);
              if (comparisonIssues.length !== 0)
                return yield* fail("fixture-comparison", comparisonIssues.join("; "));
            }
          }
          if (runMode === "fixtures") {
            save(false);
            return;
          }
          for (const [scenarioIndex, scenario] of selected.entries()) {
            yield* activate(scenario);
            const block = (iteration: number, warmup: boolean) =>
              Effect.gen(function* () {
                const blockDirectory = path.join(
                  output,
                  "blocks",
                  scenario.id,
                  warmup ? "warmup" : "measured",
                  String(iteration),
                );
                fs.mkdirSync(blockDirectory, { recursive: true });
                writeJson(
                  path.join(blockDirectory, "host-before.json"),
                  hostResourceSnapshot(output),
                );
                const collected: ObservationSample[] = [];
                inTimingBlock = true;
                for (const subject of timingBlockOrder(
                  scenarioIndex,
                  iteration + (warmup ? 0 : 1),
                )) {
                  const result = yield* execute(
                    scenario,
                    "timing",
                    subject === "baseline" ? baseline : candidate,
                    subject === "baseline" ? "disabled" : subject,
                    subject === "baseline" ? "baseline" : "candidate",
                    iteration,
                    warmup,
                  );
                  collected.push(result);
                  samples.push(result);
                }
                writeJson(
                  path.join(blockDirectory, "host-after.json"),
                  hostResourceSnapshot(output),
                );
                const before = collected.find((sample) => sample.subject === "baseline");
                if (before === undefined)
                  return yield* fail("timing-block", "A timing block has no independent baseline.");
                for (const after of collected.filter((sample) => sample.subject === "candidate")) {
                  const issues = [...observationPairIssues(before, after)];
                  if (
                    after.peakRssBytes - before.peakRssBytes >
                    budgets.maximumAdditionalRssBytes[after.mode]
                  )
                    issues.push("Memory budget exceeded: " + after.id);
                  if (issues.length > 0)
                    return yield* fail("timing-correctness", issues.join("; "));
                }
              }).pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    inTimingBlock = false;
                  }),
                ),
              );
            yield* block(0, true);
            for (let iteration = 0; iteration < budgets.measurement.repetitions; iteration++)
              yield* block(iteration, false);
            let result = assessScenarioTiming(
              budgets,
              samples.filter((sample) => sample.scenario === scenario.id),
            );
            if (result.needsEscalation) {
              for (
                let iteration = budgets.measurement.repetitions;
                iteration < budgets.measurement.maximumRepetitions;
                iteration++
              )
                yield* block(iteration, false);
              result = assessScenarioTiming(
                budgets,
                samples.filter((sample) => sample.scenario === scenario.id),
              );
            }
            save(false);
            if (!result.passed)
              return yield* fail(
                result.inconclusive ? "timing-inconclusive" : "timing-budget",
                "The retained timing evidence did not pass for " + scenario.id,
              );
          }
          const assessment = assessObservabilityEvidence(
            budgets,
            coverage,
            scenarioIds,
            samples,
            fixtureChecks,
          );
          save(assessment.passed);
          if (!assessment.passed)
            return yield* fail(
              "evidence-rejected",
              "The campaign did not meet its declared coverage, behavior, trace or performance contract; inspect report.json.",
            );
        });
        yield* campaign.pipe(
          Effect.tapError((error) => Effect.sync(() => save(false, String(error)))),
        );
      }),
    ).pipe(Effect.provide([NodeServices.layer, FetchHttpClient.layer])),
  );
