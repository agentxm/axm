/** One physically resolved hook container, edited only under exact selected-scope authority. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  assertNativeMutationWithinRoots,
  assertNoPhysicalOverlap,
  nativeAuthorityRoots,
  type NativeLocationOutcome,
  type NativeDirectoryInputs,
} from "../../locations/index.js";
import { HookConfigInvalid, HookIoFailed } from "../errors.js";
import { NativeWriteAuthority } from "../native-write-authority.js";
import { preflightNativeConfigReaders } from "../native-config-readers.js";
import { parseNativeConfigRoot } from "../native-config-syntax.js";
import {
  isOwnedHookEntry,
  readManagedHookUnits,
  updateHooksJson,
  type HookOwnership,
} from "./managed-groups.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hooksForOwner = (
  hooks: Readonly<Record<string, unknown>>,
  owner: HookOwnership,
): Record<string, unknown> => {
  const selected: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const matching = groups.flatMap((group): ReadonlyArray<Record<string, unknown>> => {
      if (!isRecord(group)) return [];
      if (!Array.isArray(group["hooks"])) return isOwnedHookEntry(group, [owner]) ? [group] : [];
      const entries = group["hooks"].filter((entry) => isOwnedHookEntry(entry, [owner]));
      return entries.length === 0 ? [] : [{ ...group, hooks: entries }];
    });
    if (matching.length > 0) selected[event] = matching;
  }
  return selected;
};

export interface NativeHookConfigArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly ownerRoot: string;
  readonly scope: "project" | "user";
  readonly path: string;
  readonly aliases: ReadonlyArray<string>;
  readonly consumers: ReadonlyArray<string>;
  readonly configuredAgentIds?: ReadonlyArray<string>;
  readonly settingsKey: string;
  readonly format: "json" | "jsonc";
  readonly configVersion?: 1;
  readonly rendered: Readonly<Record<string, unknown>>;
  readonly ownership: ReadonlyArray<HookOwnership>;
  /** Captured intent/route transition authority, never inferred from missing native bytes. */
  readonly nativeInsertionEligibleNames: ReadonlySet<string>;
  readonly dryRun?: boolean;
}

export const reconcileNativeHookConfig = (args: NativeHookConfigArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const authority = yield* NativeWriteAuthority;
    const path = yield* Path.Path;
    const roots = nativeAuthorityRoots(
      path,
      { workspaceRoot: args.workspaceRoot, scope: args.scope },
      args.nativeDirectoryInputs,
    );
    const { address } = yield* assertNativeMutationWithinRoots(
      roots,
      args.path,
      "content",
      args.ownerRoot,
    );
    const physical = address.referentPath ?? address.entryPath;
    const run = Effect.gen(function* () {
      for (const alias of [args.path, ...args.aliases]) {
        const { address: resolved } = yield* assertNativeMutationWithinRoots(
          roots,
          alias,
          "content",
          args.ownerRoot,
        );
        if ((resolved.referentPath ?? resolved.entryPath) !== physical)
          return yield* new HookConfigInvalid({ detail: "Hook alias changed after planning" });
      }
      for (const source of args.ownership) {
        yield* assertNoPhysicalOverlap(path.resolve(args.workspaceRoot, source.root), physical);
      }
      const read = () =>
        fs.readFileString(physical).pipe(
          Effect.map(Option.some),
          Effect.catch((cause) =>
            cause.reason._tag === "NotFound"
              ? Effect.succeedNone
              : Effect.fail(
                  new HookIoFailed({
                    detail: `Cannot read hooks configuration: ${physical}`,
                    cause,
                  }),
                ),
          ),
        );
      const before = yield* read();
      const raw = Option.getOrElse(before, () => "");
      // Whole-file parsing and complete desired content are validated before any unit writes.
      const planned = yield* updateHooksJson(
        physical,
        args.settingsKey,
        raw,
        { ...args.rendered },
        args.ownership,
        args.format,
        args.configVersion,
      );
      const readers = yield* preflightNativeConfigReaders({
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        physicalPath: physical,
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        configuredAgentIds: args.configuredAgentIds ?? args.consumers,
        writerFormat: args.format,
        raw,
        proposedRaw: planned,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new HookConfigInvalid({
              detail: `Native readers cannot share Hook configuration: ${physical}`,
              cause,
            }),
        ),
      );
      const observed = yield* readManagedHookUnits(physical, args.settingsKey, raw, args.ownership);
      const foreignOnly =
        observed.length === 0 &&
        (yield* parseNativeConfigRoot({ format: args.format, configPath: physical, raw }).pipe(
          Effect.mapError(
            (cause) =>
              new HookConfigInvalid({
                detail: `Cannot inspect Hook configuration ${physical}`,
                cause,
              }),
          ),
        ))[args.settingsKey] !== undefined;
      const expected = args.ownership.filter(
        (owner) => Object.keys(hooksForOwner(args.rendered, owner)).length > 0,
      );
      const observedNames: string[] = [];
      for (const owner of expected) {
        if (
          observed.some((unit) => unit.name === owner.name) &&
          (yield* updateHooksJson(
            physical,
            args.settingsKey,
            raw,
            hooksForOwner(args.rendered, owner),
            [owner],
            args.format,
            args.configVersion,
          )) === raw
        ) {
          observedNames.push(owner.name);
        }
      }
      let current = before;
      if (args.dryRun !== true && planned !== raw) {
        const unitFor = (owner: HookOwnership) =>
          JSON.stringify(["hook", args.settingsKey, owner.scope, owner.ref, owner.root]);
        const withdrawn = args.ownership.filter(
          (owner) => !expected.includes(owner) && observed.some(({ name }) => name === owner.name),
        );
        const batchInverse =
          withdrawn.length > 1
            ? yield* authority.resolveInsertions({
                path: physical,
                aliases: args.aliases,
                units: withdrawn.map(unitFor),
                raw,
              })
            : Option.none();
        let batchRestored = false;
        if (Option.isSome(batchInverse)) {
          const first = withdrawn[0];
          if (first !== undefined) {
            const receipt = { path: physical, aliases: args.aliases, unit: unitFor(first) };
            if (batchInverse.value.kind === "remove-file") {
              batchRestored = yield* authority.retireInsertion({ ...receipt, raw, empty: true });
              if (batchRestored) current = Option.none();
            } else {
              const capture = yield* authority.captureInsertion({
                ...receipt,
                beforeRaw: before,
                eligible: false,
              });
              yield* authority.protect(physical);
              yield* fs.writeFileString(physical, batchInverse.value.text).pipe(
                Effect.mapError(
                  (cause) =>
                    new HookIoFailed({
                      detail: `Cannot restore hooks baseline: ${physical}`,
                      cause,
                    }),
                ),
              );
              yield* authority.record({ path: physical, change: "modified" });
              yield* authority.recordInsertion({
                capture,
                afterRaw: batchInverse.value.text,
                createdDirectories: [],
              });
              for (const owner of withdrawn)
                yield* authority.forgetInsertion({ ...receipt, unit: unitFor(owner) });
              current = Option.some(batchInverse.value.text);
              batchRestored = true;
            }
          }
        }
        for (const owner of args.ownership.filter(
          (owner) => !batchRestored || !withdrawn.includes(owner),
        )) {
          const ownerHooks = hooksForOwner(args.rendered, owner);
          const oldRaw = Option.getOrElse(current, () => "");
          let next = yield* updateHooksJson(
            physical,
            args.settingsKey,
            oldRaw,
            ownerHooks,
            [owner],
            args.format,
            args.configVersion,
          );
          if (next === oldRaw) continue;
          const unit = unitFor(owner);
          const receipt = { path: physical, aliases: args.aliases, unit };
          const withdrawing = Object.keys(ownerHooks).length === 0;
          const inverse = withdrawing
            ? yield* authority.resolveInsertion({ ...receipt, raw: oldRaw })
            : Option.none();
          if (Option.isSome(inverse) && inverse.value.kind === "remove-file") {
            if (yield* authority.retireInsertion({ ...receipt, raw: oldRaw, empty: true })) {
              current = Option.none();
              continue;
            }
          }
          if (Option.isSome(inverse) && inverse.value.kind === "restore-text")
            next = inverse.value.text;
          const capture = yield* authority.captureInsertion({
            ...receipt,
            beforeRaw: current,
            eligible: !withdrawing && args.nativeInsertionEligibleNames.has(owner.name),
          });
          yield* authority.protect(physical);
          const createdDirectories = yield* authority.createParentDirectories(physical);
          yield* fs.writeFileString(physical, next).pipe(
            Effect.mapError(
              (cause) =>
                new HookIoFailed({
                  detail: `Cannot write hooks configuration: ${physical}`,
                  cause,
                }),
            ),
          );
          yield* authority.record({
            path: physical,
            change: Option.isNone(current) ? "created" : "modified",
          });
          yield* authority.recordInsertion({ capture, afterRaw: next, createdDirectories });
          if (withdrawing) yield* authority.forgetInsertion(receipt);
          current = Option.some(next);
        }
        const after = yield* read();
        const remaining = yield* updateHooksJson(
          physical,
          args.settingsKey,
          Option.getOrElse(after, () => ""),
          { ...args.rendered },
          args.ownership,
          args.format,
          args.configVersion,
        );
        if (remaining !== Option.getOrElse(after, () => ""))
          return yield* new HookConfigInvalid({
            detail: `Hook configuration failed readback: ${physical}`,
          });
        current = after;
      }
      const changed = planned !== raw;
      const owned = observed.length > 0 || (args.dryRun !== true && expected.length > 0);
      const finalPresent = args.dryRun === true ? expected.length > 0 : Option.isSome(current);
      return {
        changed,
        observedNames,
        ownedNames: observed.map((unit) => unit.name),
        expectedNames: expected.map((owner) => owner.name),
        nativeLocation: {
          scope: args.scope,
          address: { kind: "key-path", path: physical, keys: [args.settingsKey] },
          aliases: [...new Set([...args.aliases, ...readers.map(({ alias }) => alias)])].sort(),
          configuredConsumers: [...args.consumers].sort(),
          potentialReaders: [
            ...new Set(
              readers.filter((reader) => !reader.configured).map(({ agentId }) => agentId),
            ),
          ].sort(),
          policyReasons: [],
          ownership: owned ? "owned" : foreignOnly ? "unowned" : "absent",
          ...(owned ? { proof: "exact-hook-identity-scope-and-source-root" } : {}),
          state: !changed
            ? expected.length > 0
              ? "unchanged"
              : foreignOnly
                ? "retained"
                : "absent"
            : expected.length === 0
              ? "removed"
              : Option.isNone(before)
                ? "created"
                : "updated",
          mechanism: "structured-entry",
          availability: args.consumers.map((agentId) => ({
            agentId,
            state:
              expected.length > 0 && (args.dryRun === true || finalPresent)
                ? "unverified"
                : "unavailable",
            reason:
              "Native Hook readback verifies content; running-agent configuration selection is not observed.",
          })),
        } satisfies NativeLocationOutcome,
      };
    });
    return yield* args.dryRun === true ? run : authority.withExclusiveWrite(physical, run);
  });
