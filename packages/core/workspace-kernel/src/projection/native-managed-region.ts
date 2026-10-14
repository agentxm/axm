/**
 * Native managed regions: AXM writes a named region only in the instruction
 * target planned by the selected scope's settings, records its generation
 * currency, and keeps insertion authority for exact withdrawal.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  resolveNativeReadLocation,
  captureNativeLocationSet,
  assertNoPhysicalOverlap,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  type NativeLocationOutcome,
  type NativeDirectoryInputs,
} from "../locations/index.js";
import {
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "./errors.js";
import { projectionIsCurrent, projectionOutputDigest } from "./generation.js";
import {
  fenceSyntaxForTarget,
  inspectManagedRegion,
  isRegionName,
  renderManagedRegion,
  verifyRenderedRegion,
  NativeWriteAuthority,
  preflightNativeConfigReaders,
  type RegionName,
} from "../agent-adapters/index.js";
import {
  type ProjectionDigest,
  type ProjectionKind,
  type ProjectionRowChange,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
} from "../workspace-state/index.js";

export interface NativeRegionSource {
  readonly name: string;
  readonly ref: string;
  readonly root: string;
  readonly scope: "project" | "user";
}

/** How a region about to be rewritten compares with what AXM last wrote. */
export type ProjectionLastWrite = "matches" | "modified" | "unrecorded";

/** Exact region content for transient retention; sibling regions are independent. */
export const nativeManagedRegionContent = (args: {
  readonly targetPath: string;
  readonly region: string;
  readonly raw: string;
}) =>
  Effect.gen(function* () {
    const syntax = fenceSyntaxForTarget(args.targetPath);
    const region =
      Option.isNone(syntax) || !isRegionName(args.region)
        ? undefined
        : inspectManagedRegion(args.raw, args.region, syntax.value);
    if (region?.state !== "complete")
      return yield* new ProjectionIoFailed({
        path: args.targetPath,
        step: "inspect",
        cause: "retained-region-unavailable",
      });
    return args.raw.slice(region.open.start, region.close.end);
  });

/**
 * The body of a named region as it stands in a target file, for comparison
 * with AXM's last write. A target without fence syntax or without the region
 * yields none; a malformed region is a violation.
 */
export const observedNativeManagedRegionBody = (args: {
  readonly displayPath: string;
  readonly region: RegionName;
  readonly raw: string;
}): Effect.Effect<Option.Option<string>, ManagedRegionViolation> =>
  Effect.gen(function* () {
    const syntax = fenceSyntaxForTarget(args.displayPath);
    if (Option.isNone(syntax)) return Option.none();
    const state = inspectManagedRegion(args.raw, args.region, syntax.value);
    switch (state.state) {
      case "absent":
        return Option.none();
      case "complete":
        return Option.some(state.body);
      case "malformed":
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: state.message,
          reasonCode: state.reasonCode,
          region: state.region,
          problem: state.problem,
        });
    }
  });

export interface NativeManagedRegionArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly ownerRoot: string;
  readonly scope: "project" | "user";
  /** Physical planned instruction target. */
  readonly targetPath: string;
  /** Scope-relative planned instruction target; the projection row key. */
  readonly displayPath: ProjectionUnitPath;
  readonly region: "rules" | "knowledge";
  /** The region's whole body; empty withdraws the region. */
  readonly body: string;
  readonly gen: ProjectionDigest;
  readonly recorded: Option.Option<RecordedProjectionRow>;
  readonly contributors: ReadonlyArray<NativeRegionSource>;
  readonly ownership: ReadonlyArray<NativeRegionSource>;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly eligible: boolean;
  readonly dryRun?: boolean;
  /** Explicit record of the exact observed region as current; writes no file. */
  readonly adoption?: { readonly expectedRaw: string };
}

export interface NativeManagedRegionResult {
  /** The region is not current: apply rewrites it (or withdraws it) and records its row. */
  readonly changed: boolean;
  /** The region was complete in the planned target before this reconciliation. */
  readonly present: boolean;
  readonly existed: boolean;
  readonly removedFile: boolean;
  /** Only when a complete region is about to be rewritten or removed. */
  readonly lastWrite: Option.Option<ProjectionLastWrite>;
  /** `None` leaves the row untouched. Callers stage it only when applying. */
  readonly rowChange: Option.Option<ProjectionRowChange>;
  readonly nativeLocation: NativeLocationOutcome;
}

const regionKind = (region: "rules" | "knowledge"): ProjectionKind => region;

/**
 * Reconcile one named region in the planned instruction target. Authority is
 * the planned target itself: callers pass only the target their settings
 * plan, so a same-named fence in any other file is never read or written.
 */
export const reconcileNativeManagedRegion = (args: NativeManagedRegionArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    const roots = nativeAuthorityRoots(
      path,
      { workspaceRoot: args.workspaceRoot, scope: args.scope },
      args.nativeDirectoryInputs,
    );
    if (
      args.body.length > 0 &&
      (args.contributors.length === 0 ||
        args.contributors.some(
          (contributor) =>
            !args.ownership.some(
              (owner) =>
                owner.name === contributor.name &&
                owner.ref === contributor.ref &&
                owner.root === contributor.root &&
                owner.scope === contributor.scope &&
                owner.scope === args.scope,
            ),
        ))
    ) {
      return yield* new ManagedRegionViolation({
        displayPath: args.displayPath,
        reason: "Region contributors lack accepted source authority",
      });
    }
    const { address } = yield* assertNativeMutationWithinRoots(
      roots,
      args.targetPath,
      "content",
      args.ownerRoot,
    ).pipe(
      Effect.mapError(
        (cause) => new ProjectionIoFailed({ path: args.targetPath, step: "inspect", cause }),
      ),
    );
    const physical = address.referentPath ?? address.entryPath;
    const alias = path.resolve(args.workspaceRoot, args.displayPath);
    const syntax = fenceSyntaxForTarget(args.displayPath);
    if (Option.isNone(syntax))
      return yield* new ProjectionTargetUnsupported({
        detail: `Managed region cannot use comment fences in ${args.displayPath}`,
      });
    const kind = regionKind(args.region);
    const run = Effect.gen(function* () {
      for (const route of [args.targetPath, alias]) {
        const { address: current } = yield* assertNativeMutationWithinRoots(
          roots,
          route,
          "content",
          args.ownerRoot,
        ).pipe(
          Effect.mapError(
            (cause) => new ProjectionIoFailed({ path: route, step: "inspect", cause }),
          ),
        );
        if ((current.referentPath ?? current.entryPath) !== physical)
          return yield* new ManagedRegionViolation({
            displayPath: args.displayPath,
            reason: "Native region alias changed after planning",
          });
      }
      for (const source of args.ownership) {
        yield* assertNoPhysicalOverlap(
          path.resolve(args.workspaceRoot, source.root),
          physical,
        ).pipe(
          Effect.mapError(
            (cause) => new ProjectionIoFailed({ path: physical, step: "inspect", cause }),
          ),
        );
      }
      const before = yield* fs.readFileString(physical).pipe(
        Effect.map(Option.some),
        Effect.catch((cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeedNone
            : Effect.fail(new ProjectionIoFailed({ path: physical, step: "read", cause })),
        ),
      );
      const existing = Option.getOrElse(before, () => "");
      if (args.adoption !== undefined && existing !== args.adoption.expectedRaw)
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: "Instruction region changed after explicit adoption was planned",
        });
      const state = inspectManagedRegion(existing, args.region, syntax.value);
      if (state.state === "malformed")
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: state.message,
          reasonCode: state.reasonCode,
          region: state.region,
          problem: state.problem,
        });
      const present = state.state === "complete";
      const unchanged = {
        changed: false,
        present,
        existed: Option.isSome(before),
        removedFile: false,
        lastWrite: Option.none<ProjectionLastWrite>(),
      };
      if (args.adoption !== undefined) {
        if (state.state !== "complete")
          return yield* new ManagedRegionViolation({
            displayPath: args.displayPath,
            reason: "Explicit adoption requires an existing complete region",
          });
        return {
          ...unchanged,
          rowChange: Option.some<ProjectionRowChange>({
            kind,
            path: args.displayPath,
            row: { gen: args.gen, output: projectionOutputDigest(state.body) },
          }),
        };
      }
      const withdrawing = args.body.length === 0;
      if (withdrawing && state.state === "absent")
        return {
          ...unchanged,
          rowChange: Option.map(args.recorded, (): ProjectionRowChange => ({
            kind,
            path: args.displayPath,
            row: undefined,
          })),
        };
      if (!withdrawing && projectionIsCurrent(args.recorded, args.gen, present))
        return { ...unchanged, rowChange: Option.none<ProjectionRowChange>() };
      const rendered = renderManagedRegion({
        content: existing,
        state,
        region: args.region,
        syntax: syntax.value,
        body: args.body,
      });
      const updated = Option.match(rendered, {
        onNone: () => existing,
        onSome: ({ content }) => content,
      });
      const written = verifyRenderedRegion({
        before: existing,
        after: updated,
        region: args.region,
        syntax: syntax.value,
        withdrawn: withdrawing,
      });
      if (Result.isFailure(written))
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: `${written.failure}; the region is generated from ${
            args.contributors.map(({ ref }) => ref).join(", ") || "no contributors"
          }`,
        });
      // A body already equal to the new render also matches, so a merged
      // lockfile whose `output` lags never reports an unedited region as modified.
      const lastWrite =
        state.state === "complete"
          ? Option.some<ProjectionLastWrite>(
              Option.match(args.recorded, {
                onNone: () => "unrecorded",
                onSome: ({ row }) =>
                  projectionOutputDigest(state.body) === row.output ||
                  (written.success.state === "complete" && written.success.body === state.body)
                    ? "matches"
                    : "modified",
              }),
            )
          : Option.none<ProjectionLastWrite>();
      const rowChange: ProjectionRowChange = {
        kind,
        path: args.displayPath,
        row:
          written.success.state === "complete"
            ? { gen: args.gen, output: projectionOutputDigest(written.success.body) }
            : undefined,
      };
      yield* preflightNativeConfigReaders({
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        physicalPath: physical,
        configuredAgentIds: args.configuredAgentIds,
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        writerFormat: "text",
        raw: existing,
        proposedRaw: updated,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ManagedRegionViolation({ displayPath: args.displayPath, reason: cause.detail }),
        ),
      );
      const result = {
        changed: true,
        present,
        existed: Option.isSome(before),
        removedFile: false,
        lastWrite,
        rowChange: Option.some(rowChange),
      };
      if (args.dryRun === true || updated === existing) return result;
      const receipt = {
        path: physical,
        aliases: [alias],
        unit: JSON.stringify([args.region, args.scope, args.ownerRoot]),
      };
      const inverse = withdrawing
        ? yield* authority.resolveInsertion({ ...receipt, raw: existing })
        : Option.none();
      if (
        withdrawing &&
        (updated.length === 0 ||
          (Option.isSome(inverse) && inverse.value.kind === "remove-file")) &&
        (yield* authority.retireInsertion({ ...receipt, raw: existing, empty: true }))
      )
        return { ...result, removedFile: true };
      const next =
        Option.isSome(inverse) && inverse.value.kind === "restore-text"
          ? inverse.value.text
          : updated;
      const capture = yield* authority.captureInsertion({
        ...receipt,
        beforeRaw: before,
        eligible: !withdrawing && !present && args.eligible,
      });
      yield* authority.protect(physical);
      const createdDirectories = yield* authority.createParentDirectories(physical);
      yield* fs
        .writeFileString(physical, next)
        .pipe(
          Effect.mapError(
            (cause) => new ProjectionIoFailed({ path: physical, step: "reconcile", cause }),
          ),
        );
      yield* authority.record({
        path: physical,
        change: Option.isNone(before) ? "created" : "modified",
      });
      yield* authority.recordInsertion({ capture, afterRaw: next, createdDirectories });
      if (withdrawing) yield* authority.forgetInsertion(receipt);
      const observed = yield* fs
        .readFileString(physical)
        .pipe(
          Effect.mapError(
            (cause) => new ProjectionIoFailed({ path: physical, step: "read", cause }),
          ),
        );
      if (observed !== next)
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: "Native region readback changed",
        });
      return result;
    });
    const result = yield* args.dryRun === true ? run : authority.withExclusiveWrite(physical, run);
    const withdrawing = args.body.length === 0;
    const owned = result.present || (args.dryRun !== true && !withdrawing);
    const nativeLocation = {
      scope: args.scope,
      address: { kind: "region", path: physical, region: args.region },
      aliases: [alias],
      configuredConsumers: [],
      potentialReaders: [],
      policyReasons: [],
      ownership: owned ? "owned" : "absent",
      ...(owned ? { proof: "planned-instruction-target" } : {}),
      state: !result.changed
        ? withdrawing
          ? "absent"
          : "unchanged"
        : withdrawing
          ? "removed"
          : result.present
            ? "updated"
            : "created",
      mechanism: "managed-region",
      availability: [],
    } satisfies NativeLocationOutcome;
    const refreshed = yield* refreshNativeRegionReaders([nativeLocation], args).pipe(
      Effect.mapError(
        (cause) => new ProjectionIoFailed({ path: cause.target, step: "inspect", cause }),
      ),
    );
    return {
      ...result,
      nativeLocation: refreshed[0] ?? nativeLocation,
    } satisfies NativeManagedRegionResult;
  });

/**
 * Row withdrawals for every recorded region row of `kind` whose key is not the
 * planned target. A retarget leaves the old file's bytes alone: AXM has no
 * authority in a file the settings no longer plan.
 */
export const retargetedRegionRows = (
  kind: "rules" | "knowledge",
  rows: ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>,
  planned: ProjectionUnitPath,
): ReadonlyArray<ProjectionRowChange> =>
  [...rows.keys()].filter((key) => key !== planned).map((path) => ({ kind, path, row: undefined }));

export interface NativeRegionReaderContext {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly configuredAgentIds: ReadonlyArray<string>;
}

/** Reobserve catalog routes after all dependent aliases have settled. */
export const refreshNativeRegionReaders = (
  locations: ReadonlyArray<NativeLocationOutcome>,
  context: NativeRegionReaderContext,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const readers = [
      ...new Set(
        locations
          .filter((location) => location.address.kind === "region")
          .map((location) => location.scope),
      ),
    ].flatMap((scope) =>
      AGENTS.flatMap((agent) => {
        const native = agent.instructions.native;
        if (!("locations" in native)) return [];
        return native.locations.flatMap((declaration) => {
          const resolved = resolveNativeReadLocation(
            path,
            agent.id,
            declaration,
            { workspaceRoot: context.workspaceRoot, scope },
            context.nativeDirectoryInputs,
            { includeConditional: true },
          );
          return resolved === undefined
            ? []
            : [{ agentId: agent.id, scope, declaration, path: resolved.path }];
        });
      }),
    );
    const observed = yield* captureNativeLocationSet({
      entries: [
        ...locations
          .filter((location) => location.address.kind === "region")
          .flatMap((location) => location.aliases),
        ...readers.map((reader) => reader.path),
      ],
    });
    // A dangling link is observed state, not a failed observation: it reads the
    // region only when it addresses the region's path, which may not exist yet.
    const regionRoute = (route: string) =>
      observed
        .entry(route)
        .pipe(
          Effect.map(
            (entry) =>
              entry.referentPath ??
              (entry.linkTarget === undefined
                ? undefined
                : path.resolve(path.dirname(entry.entryPath), entry.linkTarget)),
          ),
        );
    return yield* Effect.forEach(locations, (location) =>
      Effect.gen(function* () {
        if (location.address.kind !== "region") return location;
        const configuredConsumers = new Set<string>();
        const potentialReaders = new Set<string>();
        const aliases = new Set([location.address.path]);
        for (const alias of location.aliases) {
          if ((yield* regionRoute(alias)) === location.address.path) aliases.add(alias);
        }
        const uncertainConditions = new Map<string, string>();
        for (const reader of readers) {
          if (reader.scope !== location.scope) continue;
          if ((yield* regionRoute(reader.path)) !== location.address.path) continue;
          aliases.add(reader.path);
          if (reader.declaration.applicability.kind === "conditional") {
            potentialReaders.add(reader.agentId);
            uncertainConditions.set(reader.agentId, reader.declaration.applicability.condition);
          } else {
            (context.configuredAgentIds.includes(reader.agentId)
              ? configuredConsumers
              : potentialReaders
            ).add(reader.agentId);
          }
        }
        const consumers = [...configuredConsumers].sort();
        const potential = [...potentialReaders].filter((id) => !configuredConsumers.has(id)).sort();
        return {
          ...location,
          aliases: [...aliases].sort(),
          configuredConsumers: consumers,
          potentialReaders: potential,
          availability: [...new Set([...consumers, ...uncertainConditions.keys()])]
            .sort()
            .map((agentId) => ({
              agentId,
              state:
                location.state === "absent" || location.state === "removed"
                  ? ("unavailable" as const)
                  : ("unverified" as const),
              reason: uncertainConditions.has(agentId)
                ? `Native reader applicability is unverified: ${uncertainConditions.get(agentId)}`
                : "Final native routes were observed after reconciliation; running-agent selection remains unverified.",
            })),
        } satisfies NativeLocationOutcome;
      }),
    );
  });
