/** Real CLI fixtures. Source bytes, preparation and external services are shared by matched pairs. */
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { resolveAxmCacheRootPure } from "@agentxm/host-primitives";
import { readContainerReceipts, type ContainerIdentity } from "@agentxm/workspace-kernel/locations";
import { FailureDiagnosticSchema, type OperationPhase } from "@agentxm/workspace-kernel/operations";
import { controlNetwork } from "../scripts/registry-network/control.js";
import {
  startLifecycleRegistry,
  type LifecycleRegistry,
  type RequestRecord,
} from "./lifecycle-registry.js";
import { startLifecycleGitSource, writeSkillPackage } from "./lifecycle-sources.js";
import { prepareTypedObservabilityFixtures } from "./observability-typed-fixtures.js";
import { prepareAuthObservabilityFixtures } from "./observability-auth-fixtures.js";
import { prepareMaintenanceObservabilityFixtures } from "./observability-maintenance-fixtures.js";
import { observabilityRiskScenarios } from "./observability-coverage.js";
import {
  fixtureFailure,
  type NativeReceiptSerialization,
  type AdoptionDiagnosticSerialization,
} from "./observability-contract.js";
import {
  digest,
  normalizeObservation,
  projectComparisonField,
  snapshotDigest,
  snapshotTree,
} from "./observability-process.js";

export interface WorkspaceTemplate {
  readonly workspace: string;
  readonly home: string;
}

/** Supplied by a fixture's independent server/process/state record, never by telemetry. */
export interface IndependentWorkExpectation {
  readonly kind: string;
  readonly ownerName?: string;
  readonly ownerAttributes?: Readonly<Record<string, string | boolean>>;
  readonly dimensions?: Readonly<Record<string, string | boolean>>;
  readonly count?: number;
  readonly requested?: number;
  readonly executed?: number;
  readonly reused?: number;
  readonly bytes?: number;
  readonly ioBytes?: number;
  readonly archiveBytes?: number;
  readonly workCount?: number;
  readonly batchItems?: number;
  readonly registryBatchItems?: number;
  readonly archiveEntries?: number;
  readonly deniedItems?: number;
}

export interface ObservabilityScenario {
  readonly id: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly template: WorkspaceTemplate;
  readonly condition: {
    readonly source: "registry" | "git" | "path" | "authored" | "local";
    readonly extensions: number;
    readonly cache: "cold" | "warm" | "not-applicable";
    readonly network: "baseline" | "typical" | "slow" | "not-applicable";
    readonly archiveBodyDelayMillis: number;
  };
  readonly json?: boolean;
  /** Explicit detail scope for this execution family; aggregates always cover all work. */
  readonly detailPhase?: OperationPhase;
  /** Preview preflight protects workspace and non-cache home state. */
  readonly preserveState?: boolean;
  readonly activate?: Effect.Effect<void, unknown>;
  /** Nonzero outcomes require an explicit semantic/state verifier. */
  readonly expectedExitCode?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly registry?: LifecycleRegistry;
  readonly requests?: () => ReadonlyArray<RequestRecord>;
  readonly workExpectations?: () => ReadonlyArray<IndependentWorkExpectation>;
  readonly prepare?: (
    fixture: WorkspaceTemplate,
    invoke: PrepareInvocation,
  ) => Effect.Effect<void, unknown>;
  /** Audit fresh native receipts created by in-place preparation during preflight only. */
  readonly verifyPreparedReceipts?: true;
  readonly external?: {
    readonly reset: Effect.Effect<void, unknown>;
    readonly snapshot: () => unknown;
    readonly protectedState?: () => unknown;
    readonly comparison?: () => unknown;
    readonly comparisonDescription?: string;
  };
  readonly verify?: (observed: {
    readonly fixture: WorkspaceTemplate;
    readonly phase: "preflight" | "timing";
    /** Durable sample evidence directory, including when semantic verification fails. */
    readonly artifacts: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly startedAtMillis: number;
    readonly endedAtMillis: number;
  }) => Effect.Effect<
    {
      readonly assertions: ReadonlyArray<string>;
      readonly stdoutComparison?: string;
      readonly adoptionDiagnosticSerialization?: AdoptionDiagnosticSerialization;
      readonly retainedArtifacts?: ReadonlyArray<{
        readonly name: string;
        readonly source: string;
      }>;
      readonly fileComparisons?: ReadonlyArray<{
        readonly container: "workspace" | "home";
        readonly path: string;
        readonly comparisonPath?: string;
        readonly sha256: string;
        readonly reason: string;
      }>;
    },
    unknown
  >;
}

/** The refusal fixture has one native entry even though shared and Codex policy both select it. */
export const observeAdoptionNativePreparation = (
  fixture: WorkspaceTemplate,
  acquiredRelative: string,
) =>
  Effect.try(() => {
    const configuration = Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.Struct({ agents: Schema.Array(Schema.String) })),
    )(fs.readFileSync(path.join(fixture.workspace, "axm.json"), "utf8"));
    const source = path.join(fixture.workspace, acquiredRelative, "src");
    const sourceReferent = fs.realpathSync(source);
    const projections = fs
      .readdirSync(fixture.workspace, { withFileTypes: true })
      .filter(
        (entry) => entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()),
      )
      .map((entry) => entry.name)
      .sort()
      .flatMap((name) => {
        const relative = path.join(name, "skills", "bench-001");
        const absolute = path.join(fixture.workspace, relative);
        const info = fs.lstatSync(absolute, { throwIfNoEntry: false });
        if (info === undefined) return [];
        return [
          {
            path: relative,
            kind: info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
            mode: info.mode & 0o777,
            target: info.isSymbolicLink() ? fs.readlinkSync(absolute) : null,
            referent: fs.realpathSync(absolute),
          },
        ];
      });
    const target = path.join(".agents", "skills", "bench-001");
    const projection = projections[0];
    if (
      JSON.stringify(configuration.agents) !== JSON.stringify(["codex"]) ||
      !fs.lstatSync(source).isDirectory() ||
      projections.length !== 1 ||
      projection?.path !== target ||
      projection.kind !== "symlink" ||
      projection.target !==
        path.relative(path.dirname(path.join(fixture.workspace, target)), source) ||
      projection.referent !== sourceReferent
    )
      throw fixtureFailure(
        "Enabled adoption requires Codex and exactly one native bench-001 symlink to its acquired source.",
      );
    return { configuredAgents: configuration.agents, source, sourceReferent, projections };
  });

/** The expected adoption refusal creates one fresh, invocation-bound diagnostic. */
export const verifyAdoptionFailureDiagnostic: NonNullable<ObservabilityScenario["verify"]> = ({
  fixture,
  artifacts,
  stdout,
  phase,
  startedAtMillis,
  endedAtMillis,
}) =>
  Effect.gen(function* () {
    const uuid = Schema.String.check(
      Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u),
    );
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(stdout);
    const identity = yield* Schema.decodeUnknownEffect(Schema.Struct({ diagnosticId: uuid }))(raw);
    const relative = ".axm/diagnostics/" + identity.diagnosticId + ".json";
    let diagnosticBytes: Buffer | undefined;
    if (phase === "preflight") {
      const directory = path.join(fixture.home, ".axm", "diagnostics");
      const file = path.join(fixture.home, relative);
      if (!fs.lstatSync(directory).isDirectory())
        return yield* fixtureFailure("Adoption diagnostics must use an ordinary owned directory.");
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.size > 64 * 1024 || (info.mode & 0o777) !== 0o600)
        return yield* fixtureFailure(
          "Adoption diagnostic must be one bounded restricted ordinary file.",
        );
      diagnosticBytes = fs.readFileSync(file);
      const retained = path.join(artifacts, "retained", "adoption-diagnostic.json");
      fs.mkdirSync(path.dirname(retained), { recursive: true });
      fs.writeFileSync(retained, diagnosticBytes, { flag: "wx", mode: 0o600 });
      if (
        JSON.stringify(fs.readdirSync(directory)) !==
        JSON.stringify([identity.diagnosticId + ".json"])
      )
        return yield* fixtureFailure(
          "Adoption refusal must create exactly its reported diagnostic record.",
        );
    }
    const output = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        ok: Schema.Literal(false),
        mode: Schema.Literal("apply"),
        outcome: Schema.Literal("failed"),
        diagnosticId: uuid,
        result: Schema.Struct({
          failure: Schema.Struct({ code: Schema.Literal("internal"), message: Schema.String }),
        }),
      }),
    )(raw);
    const expectedMessage =
      "Preserved unowned skill artifact at " +
      path.join(fixture.workspace, ".agents", "skills", "bench-001");
    if (output.result.failure.message !== expectedMessage + " (internal)")
      return yield* fixtureFailure(
        "Adoption diagnostic must remain bound to the expected native refusal.",
      );
    const stdoutComparison = JSON.stringify(
      projectComparisonField(raw, ["diagnosticId"], output.diagnosticId, "<adoption-diagnostic>"),
    );
    if (phase === "timing")
      return {
        assertions: [
          "Timing projects only the schema-validated printed diagnostic UUID; stored-record validation belongs to preflight.",
        ],
        stdoutComparison,
      };
    if (diagnosticBytes === undefined)
      return yield* fixtureFailure("Preflight adoption diagnostic capture is missing.");
    const rawRecord = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      diagnosticBytes.toString("utf8"),
    );
    const record = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        eventId: uuid,
        invocationId: uuid,
        occurredAt: Schema.String,
        failure: Schema.Struct({
          ...FailureDiagnosticSchema.fields,
          category: Schema.Literal("internal"),
          errorClass: Schema.Literal("internal"),
          phase: Schema.Literal("command"),
          handled: Schema.Literal(true),
          history: Schema.optional(
            Schema.Array(
              Schema.Struct({
                operation: FailureDiagnosticSchema.fields.operation,
                outcome: Schema.String,
                elapsedMs: Schema.optional(Schema.Number),
              }),
            ).check(Schema.isMaxLength(16)),
          ),
        }),
        causes: Schema.Array(Schema.Struct({ _tag: Schema.String, message: Schema.String })).check(
          Schema.isMaxLength(16),
        ),
      }),
    )(rawRecord);
    const instant = Date.parse(record.occurredAt);
    if (
      ![startedAtMillis, endedAtMillis].every(Number.isFinite) ||
      endedAtMillis < startedAtMillis ||
      record.eventId !== output.diagnosticId ||
      !Number.isFinite(instant) ||
      new Date(instant).toISOString() !== record.occurredAt ||
      instant < startedAtMillis ||
      instant > endedAtMillis ||
      !record.causes.some(
        (cause) =>
          cause.message === expectedMessage || cause.message === output.result.failure.message,
      )
    )
      return yield* fixtureFailure(
        "Stored adoption diagnostic does not match the printed failure and invocation window.",
      );
    let projected = projectComparisonField(
      rawRecord,
      ["eventId"],
      record.eventId,
      "<adoption-diagnostic>",
    );
    projected = projectComparisonField(
      projected,
      ["invocationId"],
      record.invocationId,
      "<adoption-invocation>",
    );
    projected = projectComparisonField(
      projected,
      ["occurredAt"],
      record.occurredAt,
      "<during-invocation>",
    );
    if (diagnosticBytes.toString("utf8") !== JSON.stringify(rawRecord) + "\n")
      return yield* fixtureFailure(
        "Adoption diagnostic must retain its canonical serialized bytes.",
      );
    const projectedFields: Array<AdoptionDiagnosticSerialization["projectedFields"][number]> = [];
    let previous = 0;
    for (const [index, transition] of (record.failure.history ?? []).entries()) {
      const elapsed = transition.elapsedMs;
      if (elapsed === undefined) continue;
      if (
        !Number.isFinite(elapsed) ||
        elapsed < previous ||
        elapsed > endedAtMillis - startedAtMillis
      )
        return yield* fixtureFailure(
          "Adoption diagnostic history has invalid invocation-relative timing.",
        );
      previous = elapsed;
      projectedFields.push({
        path: "failure/history/" + index + "/elapsedMs",
        bytes: Buffer.byteLength(JSON.stringify(elapsed)),
        historical: false,
      });
      projected = projectComparisonField(
        projected,
        ["failure", "history", String(index), "elapsedMs"],
        elapsed,
        "<invocation-relative-duration>",
      );
    }
    const comparisonSha256 = digest(
      JSON.stringify(normalizeObservation(projected, [fixture.workspace, fixture.home])),
    );
    return {
      adoptionDiagnosticSerialization: {
        path: ".axm/diagnostics/adoption-diagnostic.json" as const,
        rawSha256: digest(diagnosticBytes),
        rawBytes: diagnosticBytes.byteLength,
        comparisonSha256,
        projectedScalarBytes: projectedFields.reduce((sum, field) => sum + field.bytes, 0),
        projectedFieldCount: projectedFields.length,
        historicalFieldCount: 0 as const,
        projectedFields,
        validation: "invocation-bound-adoption-diagnostic" as const,
      },
      assertions: [
        "Raw adoption diagnostic retained; printed UUID, file identity, internal refusal cause and occurrence/history timing independently validated.",
        "Only the validated event/invocation UUIDs, occurrence/history times and exact diagnostic filename are projected; failure semantics, history order, causes and unknown fields remain strict.",
      ],
      stdoutComparison,
      fileComparisons: [
        {
          container: "home" as const,
          path: relative,
          comparisonPath: ".axm/diagnostics/adoption-diagnostic.json",
          sha256: comparisonSha256,
          reason:
            "Exact adoption diagnostic UUID binding and process-bounded times verified before projection; raw path, record and hashes retained.",
        },
      ],
    };
  });

export type PrepareInvocation = (
  fixture: WorkspaceTemplate,
  args: ReadonlyArray<string>,
  options?: {
    readonly json?: boolean;
    readonly environment?: Readonly<Record<string, string>>;
    readonly expectedExitCode?: number | "nonzero";
  },
) => Effect.Effect<
  { readonly stdout: string; readonly stderr: string; readonly exitCode: number },
  unknown
>;

export const copyTemplate = (source: WorkspaceTemplate, destination: string): WorkspaceTemplate => {
  const workspace = path.join(destination, "workspace");
  const home = path.join(destination, "home");
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source.workspace, workspace, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  fs.cpSync(source.home, home, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  return { workspace, home };
};

const clearArchiveCache = (home: string) => {
  const cache = resolveAxmCacheRootPure(path.join, process.platform, home, { axmUserHome: home });
  fs.rmSync(cache, { recursive: true, force: true });
};

const emptyTemplate = (root: string): WorkspaceTemplate => {
  const result = { workspace: path.join(root, "workspace"), home: path.join(root, "home") };
  fs.mkdirSync(result.workspace, { recursive: true });
  fs.mkdirSync(result.home, { recursive: true });
  return result;
};

const settings = (fixture: WorkspaceTemplate, value: unknown): void =>
  fs.writeFileSync(path.join(fixture.workspace, "axm.json"), JSON.stringify(value) + "\n");

const localCondition = {
  source: "local",
  extensions: 0,
  cache: "not-applicable",
  network: "not-applicable",
  archiveBodyDelayMillis: 0,
} as const;

/** One known product receipt store, retained before semantic validators run. */
export const captureContainerReceiptEvidence = (options: {
  readonly fixture: WorkspaceTemplate;
  readonly artifacts: string;
  readonly phase: "preflight" | "timing";
  readonly stage: "before" | "after";
}) =>
  Effect.try(() => {
    if (options.phase === "timing") return undefined;
    const directory = path.join(
      options.artifacts,
      "retained",
      "container-receipts-" + options.stage,
    );
    fs.mkdirSync(directory, { recursive: true });
    const source = path.join(options.fixture.workspace, ".axm", "projection-containers.json");
    const info = fs.lstatSync(source, { throwIfNoEntry: false });
    const present = info !== undefined;
    fs.writeFileSync(path.join(directory, "presence.json"), JSON.stringify({ present }) + "\n");
    if (!present) {
      fs.rmSync(path.join(directory, "projection-containers.json"), { force: true });
      return { directory, present, sha256: undefined, bytes: undefined };
    }
    if (!info.isFile())
      throw fixtureFailure("The workspace receipt store is not an ordinary file.");
    const bytes = fs.readFileSync(source);
    fs.writeFileSync(path.join(directory, "projection-containers.json"), bytes);
    return { directory, present, sha256: digest(bytes), bytes: bytes.length };
  });

/** Native metadata is checked independently of the product's receipt verifier. */
const observeReceiptIdentity = (identity: ContainerIdentity, fixture: WorkspaceTemplate) => {
  const insideSample = (target: string) =>
    [fixture.workspace, fixture.home].some((root) => {
      const relative = path.relative(root, target);
      return (
        relative === "" ||
        (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))
      );
    });
  const paths = [
    identity.nativeRoot,
    identity.ownerRoot,
    identity.identityOwnerRoot,
    identity.target,
    identity.physicalPath,
    identity.owner.path,
    identity.root.path,
    ...identity.parents.map((parent) => parent.path),
    ...identity.aliases.flatMap((alias) => [alias.path, alias.entryPath, alias.referentPath]),
  ];
  const outsideSample = paths.filter((target) => !insideSample(target));
  if (outsideSample.length > 0) return { matchesSample: false, outsideSample, checks: [] };
  const checks: Array<{
    readonly field: string;
    readonly expected: unknown;
    readonly observed?: unknown;
    readonly error?: string;
    readonly matches: boolean;
  }> = [];
  const check = (field: string, expected: unknown, read: () => unknown) => {
    try {
      const observed = read();
      checks.push({
        field,
        expected,
        observed,
        matches: JSON.stringify(observed) === JSON.stringify(expected),
      });
    } catch (error) {
      checks.push({ field, expected, error: String(error), matches: false });
    }
  };
  const nativeIdentity = (target: string) => {
    const info = fs.statSync(target, { bigint: true });
    return {
      device: info.dev.toString(),
      inode: info.ino.toString(),
      birthtime: info.birthtime.getTime(),
      mode: Number(info.mode),
    };
  };
  check("owner", identity.owner.identity, () => nativeIdentity(identity.owner.path));
  check("root", identity.root.identity, () => nativeIdentity(identity.root.path));
  check("entry", identity.entry, () => nativeIdentity(identity.physicalPath));
  check(
    "entry-present",
    true,
    () => fs.lstatSync(identity.physicalPath, { throwIfNoEntry: false }) !== undefined,
  );
  identity.parents.forEach((parent, index) =>
    check("parents/" + index, parent.identity, () => nativeIdentity(parent.path)),
  );
  check("owner-referent", identity.owner.path, () => fs.realpathSync(identity.identityOwnerRoot));
  check("root-referent", identity.root.path, () => fs.realpathSync(identity.nativeRoot));
  check("target-referent", identity.physicalPath, () => fs.realpathSync(identity.target));
  identity.aliases.forEach((alias, index) => {
    check("aliases/" + index + "/referent", alias.referentPath, () => fs.realpathSync(alias.path));
    check("aliases/" + index + "/entry", alias.entryPath, () =>
      path.join(fs.realpathSync(path.dirname(alias.path)), path.basename(alias.path)),
    );
    check("aliases/" + index + "/link", alias.linkTarget, () =>
      fs.lstatSync(alias.entryPath).isSymbolicLink() ? fs.readlinkSync(alias.entryPath) : undefined,
    );
  });
  return { matchesSample: checks.every((check) => check.matches), outsideSample, checks };
};

export const containerReceiptComparison = {
  scope:
    "Preflight workspace receipt store: independently matched new/refreshed live identities, exact .axm/tmp cleanup history and exact independently verified preparation identities",
  fields:
    "Only inode and birthtime of live-verified entry/owner/root/parents; separately classified removed .axm/tmp entry retains a distinct historical token",
  retained:
    "Raw before/after receipts, native observations, process window and projected comparison document",
  limitation:
    "Removed scratch entry identity is not post-stat verifiable; only the bounded historical shape, live ancestors, absence and process-bounded creation time are verified.",
  strict:
    "Unverified inherited proofs, devices, modes, ownership, paths, aliases, receipt order and every other field; preparation proof carries only for exact identities present in the operation preimage",
};

interface VerifiedContainerReceiptIdentity {
  readonly identity: string;
  readonly proof: "live" | "historical-runtime-cleanup";
}

type ContainerReceiptVerification = Effect.Success<
  ReturnType<NonNullable<ObservabilityScenario["verify"]>>
> & {
  readonly verifiedIdentities?: ReadonlyArray<VerifiedContainerReceiptIdentity>;
  readonly nativeReceiptSerialization?: NativeReceiptSerialization;
};

export const verifyContainerReceiptEvidence =
  (
    template: WorkspaceTemplate,
    captured: {
      readonly before: Effect.Success<ReturnType<typeof captureContainerReceiptEvidence>>;
      readonly after: Effect.Success<ReturnType<typeof captureContainerReceiptEvidence>>;
      readonly preparedIdentities?: ReadonlyArray<VerifiedContainerReceiptIdentity> | undefined;
    },
  ) =>
  ({
    fixture,
    artifacts,
    phase,
    startedAtMillis,
    endedAtMillis,
  }: Parameters<NonNullable<ObservabilityScenario["verify"]>>[0]): Effect.Effect<
    ContainerReceiptVerification,
    unknown
  > =>
    Effect.gen(function* () {
      if (phase === "timing")
        return {
          assertions: [
            "Timing retains the runner's declared process outcome and output comparison; full receipt/native audit belongs to preflight.",
          ],
        };
      const retained = path.join(artifacts, "retained");
      if (captured.before === undefined || captured.after === undefined)
        return yield* fixtureFailure("Preflight requires both receipt presence observations.");
      // Decode only genuinely present retained files; absence is evidence, never
      // a fabricated empty receipt document. Malformed present files still fail.
      const before = captured.before.present
        ? yield* readContainerReceipts(captured.before.directory).pipe(
            Effect.provide(NodeServices.layer),
          )
        : undefined;
      const after = captured.after.present
        ? yield* readContainerReceipts(captured.after.directory).pipe(
            Effect.provide(NodeServices.layer),
          )
        : undefined;
      if (
        after === undefined ||
        (captured.before.sha256 === captured.after.sha256 &&
          (captured.preparedIdentities?.length ?? 0) === 0)
      )
        return {
          assertions: [
            "Raw receipt presence/absence and present bytes retained; absent or byte-unchanged stores keep strict state comparison without a fresh native-identity audit claim.",
          ],
        };
      const inherited = new Set([
        ...(before?.entries ?? []).map((entry) => JSON.stringify(entry.identity)),
        ...(before?.createdDirectories ?? []).map((identity) => JSON.stringify(identity)),
      ]);
      const prepared = new Map<string, VerifiedContainerReceiptIdentity["proof"]>(
        captured.preparedIdentities?.map((entry) => [entry.identity, entry.proof]),
      );
      const observations = [
        ...after.entries.map((entry, index) => ({
          location: "entries/" + index,
          identity: entry.identity,
        })),
        ...after.createdDirectories.map((identity, index) => ({
          location: "createdDirectories/" + index,
          identity,
        })),
      ].map(({ location, identity }) => {
        const serialized = JSON.stringify(identity);
        const unchanged = inherited.has(serialized);
        const preparationProof = unchanged ? prepared.get(serialized) : undefined;
        const observed = observeReceiptIdentity(identity, fixture);
        const scratch = path.join(fixture.workspace, ".axm", "tmp");
        // Admission persists exclusive creation proof before its finalizer removes
        // the empty scratch directory. The existing runtime-directories-retire-
        // after-withdrawal owner spec covers this historical receipt lifecycle.
        const historicalScratch =
          !unchanged &&
          location.startsWith("createdDirectories/") &&
          identity.nativeRoot === fixture.workspace &&
          identity.ownerRoot === fixture.workspace &&
          identity.identityOwnerRoot === fixture.workspace &&
          identity.owner.path === fixture.workspace &&
          identity.root.path === fixture.workspace &&
          identity.target === scratch &&
          identity.physicalPath === scratch &&
          identity.parents.length === 1 &&
          identity.parents[0]?.path === path.join(fixture.workspace, ".axm") &&
          identity.aliases.length === 1 &&
          identity.aliases[0]?.path === scratch &&
          identity.aliases[0]?.entryPath === scratch &&
          identity.aliases[0]?.referentPath === scratch &&
          identity.aliases[0]?.linkTarget === undefined &&
          identity.entry.device === identity.parents[0]?.identity.device &&
          /^[1-9]\d*$/.test(identity.entry.inode) &&
          Number.isSafeInteger(identity.entry.mode) &&
          identity.entry.mode >= 0 &&
          (identity.entry.mode & 0o170000) === 0o040000 &&
          Number.isSafeInteger(identity.entry.birthtime) &&
          identity.entry.birthtime >= startedAtMillis &&
          identity.entry.birthtime <= endedAtMillis &&
          observed.outsideSample.length === 0 &&
          observed.checks.some(
            (check) =>
              check.field === "entry-present" &&
              check.observed === false &&
              check.error === undefined,
          ) &&
          observed.checks.every(
            (check) =>
              check.matches ||
              [
                "entry",
                "entry-present",
                "target-referent",
                "aliases/0/referent",
                "aliases/0/link",
              ].includes(check.field),
          );
        return {
          location,
          classification:
            preparationProof !== undefined
              ? "inherited-setup-verified"
              : unchanged
                ? "inherited-unchanged"
                : historicalScratch
                  ? "historical-runtime-cleanup-not-poststat-verifiable"
                  : "new-or-refreshed",
          preparationProof,
          ...observed,
          valid: unchanged || observed.matchesSample || historicalScratch,
        };
      });
      yield* Effect.try(() =>
        fs.writeFileSync(
          path.join(retained, "container-receipt-native-observations.json"),
          JSON.stringify(
            {
              observation:
                "Node native metadata and aliases in the actual sample. Exact unchanged before identities may retain expired copied proof. Inherited setup proof is carried only from independent preparation verification and the exact operation preimage; current native mismatch or absence remains recorded, not claimed post-stat verified. A new exact .axm/tmp creation history may be absent after cleanup only with verified live ancestors, absence and birthtime in the process interval; its removed entry identity is explicitly not post-stat verifiable.",
              processWindow: { startedAtMillis, endedAtMillis },
              observations,
            },
            null,
            2,
          ) + "\n",
        ),
      );
      if (observations.some((observation) => !observation.valid))
        return yield* fixtureFailure(
          "A new or refreshed container identity does not match the actual sample filesystem; raw receipts and independent native observations are retained.",
        );
      let projected: unknown = after;
      let projectedRows = 0;
      let projectedScalarBytes = 0;
      let projectedFieldCount = 0;
      let historicalFieldCount = 0;
      const projectedFields: Array<{ path: string; bytes: number; historical: boolean }> = [];
      const verifiedIdentities: VerifiedContainerReceiptIdentity[] = [];
      const identities = [
        ...after.entries.map((entry, index) => ({
          location: "entries/" + index,
          fields: ["entries", String(index), "identity"],
          identity: entry.identity,
        })),
        ...after.createdDirectories.map((identity, index) => ({
          location: "createdDirectories/" + index,
          fields: ["createdDirectories", String(index)],
          identity,
        })),
      ];
      for (const { location, fields, identity } of identities) {
        const observation = observations.find((entry) => entry.location === location);
        const historical =
          observation?.classification === "historical-runtime-cleanup-not-poststat-verifiable";
        const live =
          observation?.classification === "new-or-refreshed" &&
          observation.matchesSample &&
          observation.valid;
        const preparationProof = observation?.preparationProof;
        if (!historical && !live && preparationProof === undefined) continue;
        if (historical || live)
          verifiedIdentities.push({
            identity: JSON.stringify(identity),
            proof: historical ? "historical-runtime-cleanup" : "live",
          });
        const liveProof =
          preparationProof === undefined ? "live-verified" : "preparation-live-verified";
        for (const part of [
          { fields: ["owner", "identity"], value: identity.owner.identity, proof: liveProof },
          { fields: ["root", "identity"], value: identity.root.identity, proof: liveProof },
          ...identity.parents.map((parent, index) => ({
            fields: ["parents", String(index), "identity"],
            value: parent.identity,
            proof: liveProof,
          })),
          {
            fields: ["entry"],
            value: identity.entry,
            proof:
              preparationProof === "historical-runtime-cleanup"
                ? "preparation-historical-not-poststat-verified"
                : historical
                  ? "historical-not-poststat-verified"
                  : liveProof,
          },
        ])
          for (const field of ["inode", "birthtime"] as const) {
            const bytes = Buffer.byteLength(JSON.stringify(part.value[field]));
            const historical = part.proof.includes("historical");
            projectedScalarBytes += bytes;
            projectedFieldCount++;
            if (historical) historicalFieldCount++;
            projectedFields.push({
              path: [...fields, ...part.fields, field].join("/"),
              bytes,
              historical,
            });
            projected = projectComparisonField(
              projected,
              [...fields, ...part.fields, field],
              part.value[field],
              "<receipt-" + part.proof + "-" + field + ">",
            );
          }
        projectedRows++;
      }
      const comparison = JSON.stringify(
        normalizeObservation(projected, [
          fixture.workspace,
          fixture.home,
          template.workspace,
          template.home,
        ]),
      );
      if (projectedRows > 0)
        yield* Effect.try(() =>
          fs.writeFileSync(
            path.join(retained, "container-receipts-comparison.json"),
            comparison + "\n",
          ),
        );
      return {
        assertions: [
          "Raw before/after projection-container receipts retained before independent verification.",
          "New or refreshed identities match sample native metadata and aliases, except exact .axm/tmp cleanup history with verified live ancestors, absence and creation time; expired inherited identities are permitted only when unchanged from before.",
          "Only inode/birthtime of independently matched new/refreshed live identities, exact scratch history and exact setup-verified identities from the operation preimage are projected, with distinct current/preparation and live/historical tokens; unverified inherited proofs and all other receipt fields remain strict.",
        ],
        verifiedIdentities,
        ...(projectedRows === 0 ||
        captured.after.sha256 === undefined ||
        captured.after.bytes === undefined
          ? {}
          : {
              nativeReceiptSerialization: {
                path: ".axm/projection-containers.json" as const,
                rawSha256: captured.after.sha256,
                rawBytes: captured.after.bytes,
                comparisonSha256: digest(comparison),
                projectedScalarBytes,
                projectedFieldCount,
                historicalFieldCount,
                projectedFields,
                validation: "native-metadata-and-bounded-cleanup" as const,
              },
            }),
        fileComparisons:
          projectedRows === 0
            ? []
            : [
                {
                  container: "workspace" as const,
                  path: ".axm/projection-containers.json",
                  sha256: digest(comparison),
                  reason: JSON.stringify(containerReceiptComparison),
                },
              ],
      };
    });

export const prepareObservabilityFixtures = Effect.fnUntraced(function* (
  root: string,
  invoke: PrepareInvocation,
  options: { readonly proxyApi: string; readonly proxyPort: number },
) {
  const scenarios: ObservabilityScenario[] = [];
  const proxyOwner = path.join(root, "proxy-owner");
  const registryOrigin = "http://127.0.0.1:" + options.proxyPort;
  const selectProfile = (upstream: string, profile: "baseline" | "typical" | "slow") =>
    controlNetwork({ action: "stop", worktree: proxyOwner, api: options.proxyApi }).pipe(
      Effect.andThen(
        controlNetwork({
          action: "start",
          worktree: proxyOwner,
          api: options.proxyApi,
          upstream,
          port: options.proxyPort,
          profile,
        }),
      ),
    );
  yield* Effect.addFinalizer(() =>
    controlNetwork({ action: "stop", worktree: proxyOwner, api: options.proxyApi }).pipe(
      Effect.ignore,
    ),
  );

  const registryCases = new Set<string>([
    "registry/1/list/warm/baseline",
    "registry/1/view/cold/baseline",
    "registry/1/install/cold/baseline",
    "registry/1/update/warm/baseline",
    "registry/1/sync-restore/cold/baseline",
    ...observabilityRiskScenarios,
  ]);
  for (const count of [1, 10, 50]) {
    const fixture = yield* Effect.acquireRelease(
      Effect.sync(() => makeFileRegistry()),
      (registry) => Effect.sync(() => registry.cleanup()),
    );
    const registry = yield* Effect.acquireRelease(
      Effect.promise(() => startLifecycleRegistry(fixture.root, 100)),
      (server) => Effect.promise(() => server.close()),
    );
    yield* selectProfile(registry.url, "baseline");
    const names = Array.from(
      { length: count },
      (_, index) => "bench-" + String(index + 1).padStart(3, "0"),
    );
    for (const name of names)
      fixture.writeSkill(name, [{ version: "1.0.0", body: "Baseline " + name + "." }]);
    const configure = (directory: string, agent: "claude-code" | "codex") =>
      Effect.gen(function* () {
        const configured = emptyTemplate(path.join(root, "registry-" + count, directory));
        yield* invoke(configured, ["setup", "--yes", "--scope", "project", "--agent", agent]);
        settings(configured, {
          owner: "@acme",
          agents: [agent],
          defaultRegistry: "test",
          minimumReleaseAge: "0s",
          sources: [{ name: "test", type: "registry", location: registryOrigin }],
          skills: Object.fromEntries(names.map((name) => [name, "@acme/skills/" + name])),
        });
        return configured;
      });
    const configured = yield* configure("configured", "claude-code");
    const installed = copyTemplate(configured, path.join(root, "registry-" + count, "installed"));
    yield* invoke(installed, ["sync"]);
    const restore = copyTemplate(installed, path.join(root, "registry-" + count, "restore"));
    fs.rmSync(path.join(restore.workspace, "agent_extensions"), { recursive: true, force: true });
    for (const name of names)
      fixture.writeSkill(name, [
        { version: "1.0.0", body: "Baseline " + name + "." },
        { version: "2.0.0", body: "Updated " + name + "." },
      ]);
    const updated = copyTemplate(installed, path.join(root, "registry-" + count, "updated"));
    yield* invoke(updated, ["update"]);
    const install = copyTemplate(configured, path.join(root, "registry-" + count, "install"));
    fs.rmSync(install.home, { recursive: true });
    fs.cpSync(updated.home, install.home, { recursive: true, preserveTimestamps: true });
    const update = copyTemplate(installed, path.join(root, "registry-" + count, "update"));
    fs.rmSync(update.home, { recursive: true });
    fs.cpSync(updated.home, update.home, { recursive: true, preserveTimestamps: true });

    const cases = [
      { name: "list", command: "list", args: ["list"], template: installed },
      {
        name: "view",
        command: "view",
        args: ["view", "@acme/skills/bench-001"],
        template: installed,
      },
      {
        name: "install",
        command: "install",
        args: ["install", "@acme/skills/bench-001"],
        template: install,
      },
      { name: "sync-restore", command: "sync", args: ["sync"], template: restore },
      { name: "sync-noop", command: "sync", args: ["sync"], template: installed },
      { name: "update", command: "update", args: ["update"], template: update },
    ];
    for (const item of cases)
      for (const cache of ["cold", "warm"] as const)
        for (const network of ["baseline", "typical", "slow"] as const) {
          if (
            !registryCases.has("registry/" + count + "/" + item.name + "/" + cache + "/" + network)
          )
            continue;
          const template = copyTemplate(
            item.template,
            path.join(root, "registry-" + count, item.name + "-" + cache + "-" + network),
          );
          if (cache === "cold") clearArchiveCache(template.home);
          scenarios.push({
            id: "registry/" + count + "/" + item.name + "/" + cache + "/" + network,
            command: item.command,
            args: item.args,
            template,
            registry,
            ...(item.name === "sync-restore" ? { detailPhase: "acquisition" as const } : {}),
            condition: {
              source: "registry",
              extensions: count,
              cache,
              network,
              archiveBodyDelayMillis: 100,
            },
          });
        }

    // Additional routes use the same real accepted package, with independent copied state.
    if (count === 1) {
      for (const item of [
        { command: "show", args: ["show", "@acme/skills/bench-001"] },
        { command: "skills list", args: ["skills", "list"] },
        { command: "skills show", args: ["skills", "show", "bench-001"] },
        { command: "skills install", args: ["skills", "install", "@acme/skills/bench-001"] },
        { command: "skills update", args: ["skills", "update", "bench-001"] },
        { command: "skills uninstall", args: ["skills", "uninstall", "bench-001"] },
        { command: "uninstall", args: ["uninstall", "@acme/skills/bench-001"] },
        { command: "disable", args: ["disable", "@acme/skills/bench-001"] },
        { command: "skills disable", args: ["skills", "disable", "bench-001"] },
        { command: "lock export", args: ["lock", "export", "--format", "cyclonedx"] },
        { command: "cache status", args: ["cache", "status"] },
        { command: "cache verify", args: ["cache", "verify"] },
        { command: "cache prune", args: ["cache", "prune"] },
      ])
        scenarios.push({
          id: "installed/" + item.command.replaceAll(" ", "-"),
          ...item,
          template: installed,
          registry,
          condition: {
            source: "registry",
            extensions: count,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
        });
      for (const enabled of [false, true]) {
        const template = enabled
          ? yield* configure("adoption-native-refusal", "codex")
          : configured;
        let acquiredRelative = "";
        let acquiredDigest = "";
        let settingsDigest = "";
        let lockDigest = "";
        let nativePreparation:
          Effect.Success<ReturnType<typeof observeAdoptionNativePreparation>> | undefined;
        scenarios.push({
          id: "installed/adopt-" + (enabled ? "enabled-native-refusal" : "disabled"),
          command: "adopt",
          args: ["adopt", "@acme/skills/bench-001"],
          template,
          registry,
          ...(enabled ? { expectedExitCode: 10 } : {}),
          condition: {
            source: "registry",
            extensions: 1,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
          prepare: (fixture, prepare) =>
            Effect.gen(function* () {
              yield* prepare(fixture, ["sync"]);
              if (!enabled) yield* prepare(fixture, ["disable", "@acme/skills/bench-001"]);
              const manifests = fs
                .readdirSync(path.join(fixture.workspace, "agent_extensions"), { recursive: true })
                .filter(
                  (entry) => typeof entry === "string" && entry.endsWith("/bench-001/skill.json"),
                );
              const manifest = manifests[0];
              if (manifests.length !== 1 || typeof manifest !== "string")
                return yield* fixtureFailure(
                  "Adoption fixture requires one independently acquired package.",
                );
              acquiredRelative = path.join("agent_extensions", path.dirname(manifest));
              if (enabled)
                nativePreparation = yield* observeAdoptionNativePreparation(
                  fixture,
                  acquiredRelative,
                );
              acquiredDigest = snapshotDigest(
                snapshotTree(path.join(fixture.workspace, acquiredRelative), []),
              );
              settingsDigest = digest(fs.readFileSync(path.join(fixture.workspace, "axm.json")));
              lockDigest = digest(fs.readFileSync(path.join(fixture.workspace, "axm.lock")));
            }),
          verify: (observation) =>
            Effect.gen(function* () {
              const { fixture, stdout } = observation;
              if (enabled) {
                if (nativePreparation === undefined)
                  return yield* fixtureFailure(
                    "The enabled adoption native preparation proof is missing.",
                  );
                if (observation.phase === "preflight") {
                  const retained = path.join(
                    observation.artifacts,
                    "retained",
                    "adoption-native-preparation.json",
                  );
                  fs.mkdirSync(path.dirname(retained), { recursive: true });
                  fs.writeFileSync(retained, JSON.stringify(nativePreparation) + "\n", {
                    flag: "wx",
                  });
                }
              }
              const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
                stdout,
              );
              const document = yield* Schema.decodeUnknownEffect(
                Schema.Struct({
                  ok: Schema.Boolean,
                  mode: Schema.Literal("apply"),
                  outcome: Schema.Literals(["applied", "failed"]),
                  result: Schema.Struct({
                    contract: Schema.Literal("plan-result-v4"),
                    failure: Schema.optional(
                      Schema.Struct({ code: Schema.String, message: Schema.String }),
                    ),
                    recovery: Schema.optional(
                      Schema.Struct({
                        snapshotDir: Schema.String,
                        entries: Schema.Array(
                          Schema.Struct({
                            originalPath: Schema.String,
                            recoveryPath: Schema.String,
                            kind: Schema.Literal("snapshot"),
                          }),
                        ),
                      }),
                    ),
                  }),
                }),
              )(raw);
              const original = path.join(fixture.workspace, acquiredRelative);
              const authored = path.join(fixture.workspace, "skills", "bench-001");
              const require = (condition: boolean, message: string) =>
                condition ? Effect.void : Effect.fail(fixtureFailure(message));
              yield* require(snapshotDigest(snapshotTree(authored, [])) ===
                acquiredDigest, "Adoption did not preserve the independently recorded package bytes.");
              if (enabled) {
                yield* require(!document.ok &&
                  document.outcome === "failed" &&
                  document.result.failure?.code === "internal" &&
                  document.result.failure.message.startsWith(
                    "Preserved unowned skill artifact at ",
                  ), "Enabled native adoption no longer matches the recorded baseline refusal; investigate before comparing.");
                yield* require(!fs.existsSync(
                  original,
                ), "Recorded failed adoption must retain the moved bytes at the authored location.");
                yield* require(digest(fs.readFileSync(path.join(fixture.workspace, "axm.json"))) ===
                  settingsDigest &&
                  digest(fs.readFileSync(path.join(fixture.workspace, "axm.lock"))) ===
                    lockDigest, "Refused adoption did not restore settings and lockfile.");
                const nativeTarget = path.join(fixture.workspace, ".agents", "skills", "bench-001");
                yield* require(fs.lstatSync(nativeTarget).isSymbolicLink() &&
                  fs.readlinkSync(nativeTarget) ===
                    nativePreparation?.projections[0]
                      ?.target, "Refused adoption did not preserve its independently recorded native link.");
                const recovery = document.result.recovery;
                if (
                  recovery === undefined ||
                  path.dirname(recovery.snapshotDir) !== fs.realpathSync(os.tmpdir()) ||
                  !/^axm-rollback-[a-zA-Z0-9]{6}$/.test(path.basename(recovery.snapshotDir)) ||
                  !fs.lstatSync(recovery.snapshotDir).isDirectory() ||
                  recovery.entries.length !== 3
                )
                  return yield* fixtureFailure(
                    "Failed adoption must identify its exact retained recovery directory and three snapshot entries.",
                  );
                yield* require(JSON.stringify(fs.readdirSync(recovery.snapshotDir).sort()) ===
                  JSON.stringify([
                    "0.snap",
                    "1.snap",
                    "2.snap",
                  ]), "Recovery directory contains extra or missing snapshot artifacts.");
                const expectedOriginals = [
                  path.join(fixture.workspace, "axm.json"),
                  path.join(fixture.workspace, "axm.lock"),
                  original,
                ];
                let projected = projectComparisonField(
                  raw,
                  ["result", "recovery", "snapshotDir"],
                  recovery.snapshotDir,
                  "<verified-adoption-recovery>",
                );
                for (const [index, entry] of recovery.entries.entries()) {
                  yield* require(entry.originalPath === expectedOriginals[index] &&
                    entry.recoveryPath ===
                      path.join(
                        recovery.snapshotDir,
                        index + ".snap",
                      ), "Recovery entry does not match the original protected fixture resource.");
                  yield* require(index === 2
                    ? fs.lstatSync(entry.recoveryPath).isDirectory()
                    : fs
                        .lstatSync(entry.recoveryPath)
                        .isFile(), "Recovery snapshot type differs from its protected resource.");
                  yield* require(index === 2
                    ? snapshotDigest(snapshotTree(entry.recoveryPath, [])) === acquiredDigest
                    : digest(fs.readFileSync(entry.recoveryPath)) ===
                        (index === 0
                          ? settingsDigest
                          : lockDigest), "Retained recovery snapshot differs from independently recorded pre-operation bytes.");
                  projected = projectComparisonField(
                    projected,
                    ["result", "recovery", "entries", String(index), "recoveryPath"],
                    entry.recoveryPath,
                    "<verified-adoption-recovery>/" + index + ".snap",
                  );
                }
                const diagnostic = yield* verifyAdoptionFailureDiagnostic({
                  ...observation,
                  stdout: JSON.stringify(projected),
                });
                if (diagnostic.stdoutComparison === undefined)
                  return yield* fixtureFailure("Adoption diagnostic comparison is missing.");
                return {
                  ...diagnostic,
                  assertions: [
                    "Preparation independently verified Codex's single shared native symlink and exact acquired-source target before adoption.",
                    "Known enabled-native baseline failure retains moved authored bytes, restores settings/lock, and keeps independently verified original recovery snapshots.",
                    "The original acquired path remains absent; this records existing partial restoration and does not establish successful or atomic adoption.",
                    ...diagnostic.assertions,
                  ],
                  stdoutComparison: diagnostic.stdoutComparison,
                  fileComparisons: diagnostic.fileComparisons ?? [],
                  retainedArtifacts: [{ name: "adoption-recovery", source: recovery.snapshotDir }],
                };
              }
              const settings = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    skills: Schema.Struct({
                      "bench-001": Schema.Struct({
                        source: Schema.Literal("workspace"),
                        enabled: Schema.Literal(false),
                      }),
                    }),
                  }),
                ),
              )(fs.readFileSync(path.join(fixture.workspace, "axm.json"), "utf8"));
              yield* require(settings.skills["bench-001"].enabled === false &&
                document.ok &&
                document.outcome === "applied" &&
                !fs.existsSync(
                  original,
                ), "Disabled acquired adoption did not move the package and preserve its declared activation.");
              return {
                assertions: [
                  "Disabled acquired package moved into workspace authorship with identical independently recorded bytes and retained disabled activation.",
                ],
              };
            }),
        });
      }
      const disabled = copyTemplate(installed, path.join(root, "disabled"));
      yield* invoke(disabled, ["skills", "disable", "bench-001"]);
      for (const item of [
        { command: "enable", args: ["enable", "@acme/skills/bench-001"] },
        { command: "skills enable", args: ["skills", "enable", "bench-001"] },
      ])
        scenarios.push({
          id: "installed/" + item.command.replaceAll(" ", "-"),
          ...item,
          template: disabled,
          registry,
          condition: {
            source: "registry",
            extensions: count,
            cache: "warm",
            network: "baseline",
            archiveBodyDelayMillis: 100,
          },
        });
    }
  }

  const bare = emptyTemplate(path.join(root, "bare"));
  scenarios.push({
    id: "local/setup",
    command: "setup",
    args: ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
    template: bare,
    condition: localCondition,
  });
  const local = emptyTemplate(path.join(root, "local"));
  yield* invoke(local, ["setup", "--yes", "--scope", "project", "--agent", "claude-code"]);
  settings(local, {
    owner: "@acme",
    agents: ["claude-code"],
    sources: [{ name: "test", type: "registry", location: registryOrigin }],
    defaultRegistry: "test",
  });
  for (const command of [
    "",
    "skills",
    "mcps",
    "subagents",
    "rules",
    "hooks",
    "knowledge",
    "knowledge concepts",
    "packs",
    "visibility",
    "lock",
    "agents",
    "instructions",
    "diagnostics",
    "cache",
    "token",
  ])
    scenarios.push({
      id: "group/" + (command || "root").replaceAll(" ", "-"),
      command,
      args: command === "" ? ["--help"] : command.split(" "),
      template: local,
      condition: localCondition,
    });
  scenarios.push({
    id: "group/version-output",
    command: "",
    args: ["--version"],
    template: local,
    condition: localCondition,
  });
  for (const item of [
    { command: "help", args: ["help"] },
    { command: "schema", args: ["schema", "show"] },
    { command: "discover", args: ["discover"] },
    { command: "lint", args: ["lint"] },
    { command: "agents list", args: ["agents", "list"] },
    { command: "agents capabilities", args: ["agents", "capabilities", "claude-code"] },
    { command: "agents add", args: ["agents", "add", "cursor"] },
    { command: "agents remove", args: ["agents", "remove", "claude-code"] },
    { command: "instructions status", args: ["instructions", "status"] },
    { command: "instructions enable", args: ["instructions", "enable"] },
    { command: "instructions disable", args: ["instructions", "disable"] },
    { command: "logout", args: ["logout"] },
  ])
    scenarios.push({
      id: "local/" + item.command.replaceAll(" ", "-"),
      ...item,
      template: local,
      condition: localCondition,
    });
  scenarios.push({
    id: "local/token-show",
    command: "token show",
    args: ["token", "show", "--plain"],
    json: false,
    environment: { AXM_TOKEN: "synthetic-benchmark-token" },
    template: local,
    condition: localCondition,
  });

  // Produce a real retained failure once, then benchmark successful review/export.
  const diagnostic = copyTemplate(local, path.join(root, "diagnostic"));
  fs.writeFileSync(path.join(diagnostic.workspace, "axm.json"), "{\n");
  const failed = yield* invoke(diagnostic, ["list", "--scope", "project"], {
    expectedExitCode: "nonzero",
  });
  const failure = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        ok: Schema.Literal(false),
        diagnosticId: Schema.String,
      }),
    ),
  )(failed.stdout);
  const reviewed = yield* invoke(diagnostic, ["diagnostics", "show", failure.diagnosticId]);
  const review = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        ok: Schema.Literal(true),
        result: Schema.Struct({ sha256: Schema.String }),
      }),
    ),
  )(reviewed.stdout);
  scenarios.push(
    {
      id: "local/diagnostics-show",
      command: "diagnostics show",
      args: ["diagnostics", "show", failure.diagnosticId],
      template: diagnostic,
      condition: localCondition,
    },
    {
      id: "local/diagnostics-export",
      command: "diagnostics export",
      args: [
        "diagnostics",
        "export",
        failure.diagnosticId,
        "reviewed-diagnostic.json",
        "--review-sha256",
        review.result.sha256,
      ],
      template: diagnostic,
      condition: localCondition,
    },
  );

  for (const plural of ["skills"]) {
    scenarios.push({
      id: "authoring/" + plural + "-new",
      command: plural + " new",
      args: [plural, "new", "bench-authored", "--description", "Synthetic benchmark extension."],
      template: local,
      condition: { ...localCondition, source: "authored" },
    });
    const authored = copyTemplate(local, path.join(root, "authored-" + plural));
    yield* invoke(authored, [
      plural,
      "new",
      "bench-authored",
      "--description",
      "Synthetic benchmark extension.",
    ]);
    if (plural === "skills") {
      scenarios.push(
        {
          id: "authoring/version",
          command: "version",
          args: ["version", "@acme/skills/bench-authored", "patch"],
          template: authored,
          condition: { ...localCondition, source: "authored", extensions: 1 },
        },
        {
          id: "authoring/fork",
          command: "fork",
          args: ["fork", "workspace:@acme/skills/bench-authored", "@acme/skills/bench-fork"],
          template: authored,
          condition: { ...localCondition, source: "authored", extensions: 1 },
        },
      );
    }
  }

  const pathFixture = copyTemplate(local, path.join(root, "path"));
  writeSkillPackage(pathFixture.workspace, "bench-path", "Accepted path guidance.");
  settings(pathFixture, {
    owner: "@acme",
    agents: ["claude-code"],
    skills: { "bench-path": "./vendor/bench-path" },
  });
  const pathInstalled = copyTemplate(pathFixture, path.join(root, "path-installed"));
  yield* invoke(pathInstalled, ["sync"]);
  for (const [name, template] of [
    ["cold-sync", pathFixture],
    ["noop-sync", pathInstalled],
  ] as const)
    scenarios.push({
      id: "path/" + name,
      command: "sync",
      args: ["sync"],
      template,
      condition: { ...localCondition, source: "path", extensions: 1 },
    });

  const gitRoot = path.join(root, "git");
  fs.mkdirSync(gitRoot);
  const git = yield* Effect.acquireRelease(
    Effect.promise(() => startLifecycleGitSource(gitRoot)),
    (source) => Effect.promise(() => source.close()),
  );
  const gitConfigured = copyTemplate(local, path.join(root, "git-configured"));
  settings(gitConfigured, {
    owner: "@acme",
    agents: ["claude-code"],
    skills: { "bench-git": git.url },
  });
  const gitInstalled = copyTemplate(gitConfigured, path.join(root, "git-installed"));
  yield* invoke(gitInstalled, ["sync"]);
  const gitRestore = copyTemplate(gitInstalled, path.join(root, "git-restore"));
  fs.rmSync(path.join(gitRestore.workspace, "agent_extensions"), { recursive: true, force: true });
  git.advance();
  for (const [name, template, command] of [
    ["cold-sync", gitConfigured, "sync"],
    ["exact-restore", gitRestore, "sync"],
    ["noop-sync", gitInstalled, "sync"],
    ["update", gitInstalled, "update"],
  ] as const)
    scenarios.push({
      id: "git/" + name,
      command,
      args: [command],
      template,
      condition: {
        ...localCondition,
        source: "git",
        extensions: 1,
        cache: name === "cold-sync" ? "cold" : "warm",
        network: "baseline",
      },
    });

  // The source is a package collection, so unrelated workspace declarations must
  // not hide its distributable packages from repository discovery.
  const shared = emptyTemplate(path.join(root, "git-share"));
  for (const args of [
    ["init", "--quiet", "--initial-branch=main"],
    ["remote", "add", "origin", git.url],
    ["fetch", "--quiet", "origin", "main"],
    ["checkout", "--quiet", "-B", "main", "origin/main"],
  ])
    yield* Effect.try(() =>
      execFileSync("git", args, {
        cwd: shared.workspace,
        timeout: 30_000,
        env: { PATH: process.env["PATH"], HOME: shared.home, GIT_CONFIG_NOSYSTEM: "1" },
        stdio: "pipe",
      }),
    );
  scenarios.push({
    id: "git/share",
    command: "share",
    args: ["share"],
    template: shared,
    condition: { ...localCondition, source: "git", extensions: 1, network: "baseline" },
  });

  for (const prepare of [
    prepareTypedObservabilityFixtures,
    prepareAuthObservabilityFixtures,
    prepareMaintenanceObservabilityFixtures,
  ])
    scenarios.push(
      ...(yield* prepare({
        root: path.join(
          root,
          prepare === prepareTypedObservabilityFixtures
            ? "typed"
            : prepare === prepareAuthObservabilityFixtures
              ? "auth"
              : "maintenance",
        ),
        base: local,
        invoke,
        copy: copyTemplate,
      })),
    );

  return {
    scenarios,
    activate: (scenario: ObservabilityScenario) =>
      scenario.registry === undefined
        ? Effect.void
        : selectProfile(
            scenario.registry.url,
            scenario.condition.network === "not-applicable"
              ? "baseline"
              : scenario.condition.network,
          ).pipe(Effect.asVoid),
  };
});
