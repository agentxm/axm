/** Native managed regions carry exact source proof and insertion authority. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
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
import {
  commentStyleForTarget,
  type RegionName,
  inspectManagedRegion,
  renderManagedRegion,
  serializeMarker,
  NativeWriteAuthority,
  preflightNativeConfigReaders,
} from "../agent-adapters/index.js";

export interface NativeRegionSource {
  readonly name: string;
  readonly ref: string;
  readonly root: string;
  readonly scope: "project" | "user";
}

const isRegionName = (region: string): region is RegionName =>
  region === "rules" ||
  region === "knowledge" ||
  region === "instruction-aliases" ||
  region.startsWith("mcp-server:");

/** Exact owner-region content for transient retention; sibling regions are independent. */
export const nativeManagedRegionContent = (args: {
  readonly targetPath: string;
  readonly region: string;
  readonly raw: string;
}) =>
  Effect.gen(function* () {
    const style = commentStyleForTarget(args.targetPath);
    if (Option.isNone(style) || !isRegionName(args.region))
      return yield* new ProjectionIoFailed({
        path: args.targetPath,
        step: "inspect",
        cause: "retained-region-grammar-unavailable",
      });
    const region = inspectManagedRegion(args.raw, args.region, style.value);
    if (region.state !== "complete")
      return yield* new ProjectionIoFailed({
        path: args.targetPath,
        step: "inspect",
        cause: "retained-region-unavailable",
      });
    return args.raw
      .split(/(?<=\n)/u)
      .slice(region.start, region.end + 1)
      .join("")
      .replace(/\r?\n$/u, "");
  });

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
  /** Explicit transfer of the exact observed region; ordinary reconciliation never adopts. */
  readonly adoption?: { readonly expectedRaw: string };
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    const portableRoot = (root: string) => root.split(path.sep).join("/");
    const scopeRoot = portableRoot(path.relative(args.workspaceRoot, args.ownerRoot)) || ".";
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
      if (args.adoption !== undefined && existing !== args.adoption.expectedRaw)
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: "Instruction region changed after explicit adoption was planned",
        });
      const state = inspectManagedRegion(existing, args.region, style.value);
      if (args.adoption !== undefined && state.state !== "complete")
        return yield* new ManagedRegionViolation({
          displayPath: args.displayPath,
          reason: "Explicit adoption requires an existing complete region",
        });
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
          decoded.value.root === scopeRoot &&
          decoded.value.owners.length > 0 &&
          decoded.value.owners.every((prior) =>
            args.ownership.some(
              (owner) =>
                owner.name === prior.name &&
                owner.ref === prior.ref &&
                portableRoot(owner.root) === prior.root &&
                owner.scope === args.scope,
            ),
          );
        if (!owned && args.adoption !== undefined) {
          if (
            existing !== args.adoption.expectedRaw ||
            state.startMarker.ext !== args.owner ||
            args.rendered.length === 0 ||
            (Option.isSome(decoded) && decoded.value.scope !== args.scope)
          )
            return yield* new ManagedRegionViolation({
              displayPath: args.displayPath,
              reason: "Explicit region adoption no longer matches its observed scope and owner",
            });
          owned = true;
        }
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
        root: scopeRoot,
        owners: args.contributors
          .map(({ name, ref, root }) => ({ name, ref, root: portableRoot(root) }))
          .sort(
            (left, right) =>
              left.ref.localeCompare(right.ref) ||
              left.root.localeCompare(right.root) ||
              left.name.localeCompare(right.name),
          ),
      });
      const renderedUpdate = renderManagedRegion({
        content: existing,
        state,
        region: args.region,
        owner: args.owner,
        rendered: args.rendered,
        style: style.value,
        source,
        generation: args.generation,
      });
      let updated = renderedUpdate;
      if (args.adoption !== undefined && state.state === "complete") {
        let offset = 0;
        for (let index = 0; index < state.start; index += 1)
          offset = existing.indexOf("\n", offset) + 1;
        const newline = existing.indexOf("\n", offset);
        const end = newline < 0 ? existing.length : newline;
        const carriageReturn = existing[end - 1] === "\r" ? "\r" : "";
        updated =
          existing.slice(0, offset) +
          serializeMarker(
            {
              ...state.startMarker,
              src: source,
            },
            style.value,
          ) +
          carriageReturn +
          existing.slice(end);
      }
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
        ownership:
          owned || (args.dryRun !== true && args.rendered.length > 0)
            ? ("owned" as const)
            : ("absent" as const),
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
    const nativeLocation = {
      scope: args.scope,
      address: { kind: "region", path: physical, region: args.region },
      aliases: [alias],
      configuredConsumers: [],
      potentialReaders: [],
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
      availability: [],
    } satisfies NativeLocationOutcome;
    const refreshed = yield* refreshNativeRegionReaders([nativeLocation], args).pipe(
      Effect.mapError(
        (cause) => new ProjectionIoFailed({ path: cause.target, step: "inspect", cause }),
      ),
    );
    return { ...result, nativeLocation: refreshed[0] ?? nativeLocation };
  });

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
      referents: [
        ...locations
          .filter((location) => location.address.kind === "region")
          .flatMap((location) => location.aliases),
        ...readers.map((reader) => reader.path),
      ],
    });
    return yield* Effect.forEach(locations, (location) =>
      Effect.gen(function* () {
        if (location.address.kind !== "region") return location;
        const configuredConsumers = new Set<string>();
        const potentialReaders = new Set<string>();
        const aliases = new Set([location.address.path]);
        for (const alias of location.aliases) {
          const physical = yield* observed.referent(alias);
          if (physical === location.address.path) aliases.add(alias);
        }
        const uncertainConditions = new Map<string, string>();
        for (const reader of readers) {
          if (reader.scope !== location.scope) continue;
          const physical = yield* observed.referent(reader.path);
          if (physical !== location.address.path) continue;
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
