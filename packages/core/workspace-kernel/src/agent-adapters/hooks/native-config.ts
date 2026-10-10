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
  isDeclaredHookEntry,
  readDeclaredHookUnits,
  updateHooksJson,
  type HookNativeDeclaration,
} from "./managed-groups.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hooksForOwner = (
  hooks: Readonly<Record<string, unknown>>,
  owner: HookNativeDeclaration,
): Record<string, unknown> => {
  const selected: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const matching = groups.flatMap((group): ReadonlyArray<Record<string, unknown>> => {
      if (!isRecord(group)) return [];
      if (!Array.isArray(group["hooks"])) return isDeclaredHookEntry(group, [owner]) ? [group] : [];
      const entries = group["hooks"].filter((entry) => isDeclaredHookEntry(entry, [owner]));
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
  readonly declarations: ReadonlyArray<HookNativeDeclaration>;
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
      for (const source of args.declarations) {
        if (!path.isAbsolute(source.root))
          return yield* new HookConfigInvalid({
            detail: "Hook declaration requires an absolute canonical package root",
          });
        if (source.scope !== args.scope)
          return yield* new HookConfigInvalid({
            detail: "Hook declaration scope does not match its native target",
          });
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
        args.declarations,
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
      const observed = yield* readDeclaredHookUnits(
        physical,
        args.settingsKey,
        raw,
        args.declarations,
      );
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
      const expected = args.declarations.filter(
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
        yield* authority.protect(physical);
        yield* authority.createParentDirectories(physical);
        yield* fs.writeFileString(physical, planned).pipe(
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
          change: Option.isNone(before) ? "created" : "modified",
        });
        current = yield* read();
        if (Option.getOrElse(current, () => "") !== planned)
          return yield* new HookConfigInvalid({
            detail: `Hook configuration failed readback: ${physical}`,
          });
      }
      const changed = planned !== raw;
      const [firstRoot, ...otherRoots] = [
        ...new Set(args.declarations.map(({ root }) => root)),
      ].sort();
      const selected = firstRoot !== undefined;
      const finalPresent = args.dryRun === true ? expected.length > 0 : Option.isSome(current);
      return {
        changed,
        observedNames,
        declaredNames: observed.map((unit) => unit.name),
        expectedNames: expected.map((owner) => owner.name),
        nativeLocation: {
          scope: args.scope,
          address:
            firstRoot === undefined
              ? { kind: "key-path", path: physical, keys: [args.settingsKey] }
              : {
                  kind: "hook-registrations",
                  path: physical,
                  settingsKey: args.settingsKey,
                  scriptRoots: [firstRoot, ...otherRoots],
                },
          aliases: [...new Set([...args.aliases, ...readers.map(({ alias }) => alias)])].sort(),
          configuredConsumers: [...args.consumers].sort(),
          potentialReaders: [
            ...new Set(
              readers.filter((reader) => !reader.configured).map(({ agentId }) => agentId),
            ),
          ].sort(),
          policyReasons: [],
          ownership: selected ? "declared" : foreignOnly ? "unowned" : "absent",
          ...(selected ? { proof: "effective-native-declaration" } : {}),
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
