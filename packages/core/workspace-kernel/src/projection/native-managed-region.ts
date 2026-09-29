/** Native managed regions carry exact source proof and insertion authority. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  resolveNativeReadLocation,
  resolveNativeReferent,
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
import {
  commentStyleForTarget,
  type RegionName,
  inspectManagedRegion,
  renderManagedRegion,
  NativeWriteAuthority,
  preflightNativeConfigReaders,
} from "../agent-adapters/index.js";

export interface NativeRegionSource {
  readonly name: string;
  readonly ref: string;
  readonly root: string;
  readonly scope: "project" | "user";
}

const sourceProof = Schema.Struct({
  scope: Schema.Literals(["project", "user"]),
  root: Schema.String,
  owners: Schema.Array(
    Schema.Struct({ name: Schema.String, ref: Schema.String, root: Schema.String }),
  ),
});

export const reconcileNativeManagedRegion = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly ownerRoot: string;
  readonly scope: "project" | "user";
  readonly targetPath: string;
  readonly displayPath: string;
  readonly owner: string;
  readonly region: RegionName;
  readonly rendered: string;
  readonly generation: string;
  readonly contributors: ReadonlyArray<NativeRegionSource>;
  readonly ownership: ReadonlyArray<NativeRegionSource>;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly eligible: boolean;
  readonly dryRun?: boolean;
}) =>
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
      args.rendered.length > 0 &&
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
    const style = commentStyleForTarget(args.displayPath);
    if (Option.isNone(style))
      return yield* new ProjectionTargetUnsupported({
        detail: `Managed region cannot use comment markers in ${args.displayPath}`,
      });
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
      const state = inspectManagedRegion(existing, args.region, style.value);
      if (state.state === "malformed" || state.state === "unsupported-version")
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: state.message,
          reasonCode: state.reasonCode,
        });
      let owned = false;
      if (state.state === "complete") {
        const decoded = yield* Effect.try({
          try: (): unknown => JSON.parse(state.startMarker.src ?? "null"),
          catch: (cause) => cause,
        }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(sourceProof)), Effect.option);
        owned =
          state.startMarker.ext === args.owner &&
          Option.isSome(decoded) &&
          decoded.value.scope === args.scope &&
          decoded.value.root === args.ownerRoot &&
          decoded.value.owners.length > 0 &&
          decoded.value.owners.every((prior) =>
            args.ownership.some(
              (owner) =>
                owner.name === prior.name &&
                owner.ref === prior.ref &&
                owner.root === prior.root &&
                owner.scope === args.scope,
            ),
          );
        if (!owned) {
          if (args.rendered.length > 0)
            return yield* new ManagedRegionViolation({
              displayPath: args.displayPath,
              reason: "Managed region source ownership conflicts",
            });
          return {
            changed: false,
            existing,
            updated: existing,
            observedRegion: Option.none<string>(),
            existed: Option.isSome(before),
            removedFile: false,
            ownership: "unowned" as const,
          };
        }
      }
      const source = JSON.stringify({
        scope: args.scope,
        root: args.ownerRoot,
        owners: args.contributors
          .map(({ name, ref, root }) => ({ name, ref, root }))
          .sort(
            (left, right) =>
              left.ref.localeCompare(right.ref) ||
              left.root.localeCompare(right.root) ||
              left.name.localeCompare(right.name),
          ),
      });
      const updated = renderManagedRegion({
        content: existing,
        state,
        region: args.region,
        owner: args.owner,
        rendered: args.rendered,
        style: style.value,
        source,
        generation: args.generation,
      });
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
        changed: updated !== existing,
        existing,
        updated,
        observedRegion:
          owned && state.state === "complete" ? Option.some(state.body) : Option.none<string>(),
        existed: Option.isSome(before),
        removedFile: false,
        ownership: owned || args.rendered.length > 0 ? ("owned" as const) : ("absent" as const),
      };
      if (args.dryRun === true || !result.changed) return result;
      const receipt = {
        path: physical,
        aliases: [alias],
        unit: JSON.stringify([args.region, args.scope, args.ownerRoot, args.owner]),
      };
      const withdrawing = args.rendered.length === 0;
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
        eligible: !withdrawing && !owned && args.eligible,
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
    const configuredConsumers = new Set<string>();
    const potentialReaders = new Set<string>();
    const aliases = new Set([alias]);
    const referents = new Map<string, Option.Option<string>>();
    for (const agent of AGENTS) {
      const native = agent.instructions.native;
      if (!("locations" in native)) continue;
      for (const declaration of native.locations) {
        const resolved = resolveNativeReadLocation(
          path,
          agent.id,
          declaration,
          args,
          args.nativeDirectoryInputs,
        );
        if (resolved === undefined) continue;
        const referent =
          referents.get(resolved.path) ??
          (yield* resolveNativeReferent(resolved.path).pipe(Effect.option));
        referents.set(resolved.path, referent);
        if (Option.isNone(referent) || referent.value !== physical) continue;
        aliases.add(resolved.path);
        (args.configuredAgentIds.includes(agent.id) ? configuredConsumers : potentialReaders).add(
          agent.id,
        );
      }
    }
    return {
      ...result,
      nativeLocation: {
        scope: args.scope,
        address: { kind: "region", path: physical, region: args.region },
        aliases: [...aliases].sort(),
        configuredConsumers: [...configuredConsumers].sort(),
        potentialReaders: [...potentialReaders].sort(),
        policyReasons: [],
        ownership: result.ownership,
        ...(result.ownership === "owned" ? { proof: "exact-scoped-managed-region-sources" } : {}),
        state:
          result.ownership === "unowned"
            ? "retained"
            : !result.changed
              ? args.rendered.length > 0
                ? "unchanged"
                : "absent"
              : args.rendered.length === 0
                ? "removed"
                : Option.isSome(result.observedRegion)
                  ? "updated"
                  : "created",
        mechanism: "managed-region",
        availability: [...configuredConsumers].sort().map((agentId) => ({
          agentId,
          state: args.rendered.length > 0 ? "unverified" : "unavailable",
          reason:
            "Native region readback verifies content; running-agent configuration selection is not observed.",
        })),
      } satisfies NativeLocationOutcome,
    };
  });
