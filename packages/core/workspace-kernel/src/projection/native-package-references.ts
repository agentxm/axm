/** Read-only guard against deleting code still referenced by native registrations. */
import {
  AGENTS,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import { parse as parseShell } from "shell-quote";
import {
  invalidNativeConfig,
  isDeclaredHookEntry,
  parseNativeConfigRoot,
} from "../agent-adapters/index.js";
import { resolveNativeReadLocation, type NativeDirectoryInputs } from "../locations/index.js";
import { ProjectionIoFailed } from "./errors.js";
import { isLexicallyWithin } from "@agentxm/host-primitives";

interface NativePackageReferenceRequest {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly packageRoot: string;
  /** Preview only: subtract the explicit lifecycle operation's selected registrations. */
  readonly withdrawal?: {
    readonly type: string;
    readonly name: string;
    readonly agentIds: ReadonlyArray<string>;
  };
}

export interface NativePackageReferenceEvidence {
  readonly path: string;
  readonly evidence: "structured-reference" | "possible-reference";
  readonly readers: ReadonlyArray<string>;
  /** Present only when structured configuration establishes an exact registration. */
  readonly keys?: ReadonlyArray<string>;
}

class NativePackageReferenceReadView extends Context.Service<
  NativePackageReferenceReadView,
  {
    readonly read: FileSystem.FileSystem["readFileString"];
    readonly documents: Map<string, ReturnType<typeof parseNativeConfigRoot>>;
  }
>()("@agentxm/workspace-kernel/projection/NativePackageReferenceReadView") {}

/** Share captured physical configuration bytes for exactly one passive query. */
export const withNativePackageReferenceReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cells = new Map<string, ReturnType<FileSystem.FileSystem["readFileString"]>>();
    const read: FileSystem.FileSystem["readFileString"] = (file) =>
      Effect.gen(function* () {
        const prior = cells.get(file);
        if (prior !== undefined) return yield* prior;
        const captured = yield* Effect.cached(fs.readFileString(file));
        const concurrent = cells.get(file);
        if (concurrent !== undefined) return yield* concurrent;
        cells.set(file, captured);
        return yield* captured;
      });
    return yield* Effect.provideService(effect, NativePackageReferenceReadView, {
      read,
      documents: new Map(),
    });
  });

/** Passive references distinguish exact structured paths from conservative text evidence. */
export const inspectNativePackageReferences = (args: NativePackageReferenceRequest) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const shared = yield* Effect.serviceOption(NativePackageReferenceReadView);
    const read = Option.isSome(shared) ? shared.value.read : fs.readFileString;
    const localReads = new Map<string, string>();
    const documents = Option.isSome(shared)
      ? shared.value.documents
      : new Map<string, ReturnType<typeof parseNativeConfigRoot>>();
    const root = path.resolve(args.packageRoot);
    const relativeRoot = path.relative(args.workspaceRoot, root);
    const beneath = (value: string) =>
      isLexicallyWithin(path, root, path.resolve(args.workspaceRoot, value));
    const candidates = (value: unknown): ReadonlyArray<string> => {
      if (Array.isArray(value)) return value.flatMap(candidates);
      if (typeof value === "object" && value !== null)
        return Object.values(value).flatMap(candidates);
      if (typeof value !== "string") return [];
      try {
        return [
          value,
          ...parseShell(value, () => "__AXM_UNRESOLVED__").flatMap((token) =>
            typeof token === "string" ? [token] : [],
          ),
        ];
      } catch {
        return [value];
      }
    };
    const references = (value: unknown) =>
      Effect.gen(function* () {
        for (const candidate of new Set(candidates(value))) {
          // Absolute and workspace-relative package paths also occur inside shell expressions.
          // This is conservative deletion refusal, never registration selection.
          if (
            beneath(candidate) ||
            candidate.includes(`${root}${path.sep}`) ||
            (relativeRoot !== "" && candidate.includes(`${relativeRoot}${path.sep}`))
          )
            return true;
          const absolute = path.resolve(args.workspaceRoot, candidate);
          if (yield* fs.exists(absolute)) {
            if (beneath(yield* fs.realPath(absolute))) return true;
          }
        }
        return false;
      });
    const routes = AGENTS.flatMap((agent) =>
      ["mcp-server", "hook"].flatMap((kind) => {
        const native =
          kind === "hook"
            ? agent.capabilities.hook.native
            : agent.capabilities["mcp-server"].native;
        if (!("locations" in native)) return [];
        const declarations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
        return declarations
          .filter((declaration) => declaration.scope === args.scope)
          .flatMap((declaration) => {
            const resolved = resolveNativeReadLocation(
              path,
              agent.id,
              declaration,
              args,
              args.nativeDirectoryInputs,
            );
            return resolved === undefined
              ? []
              : [{ agentId: agent.id, kind, declaration, resolved }];
          });
      }),
    );
    const present = yield* Effect.forEach(routes, (route) =>
      Effect.gen(function* () {
        if (!(yield* fs.exists(route.resolved.path))) return [];
        const physical = yield* fs.realPath(route.resolved.path);
        return [
          {
            ...route,
            physical,
            key: JSON.stringify([route.kind, physical, route.declaration.keyPath ?? []]),
          },
        ];
      }),
    );
    const selected = new Set(
      present
        .flat()
        .filter((route) => args.withdrawal?.agentIds.includes(route.agentId))
        .map(({ key }) => key),
    );
    const found = new Map<string, NativePackageReferenceEvidence>();
    const record = (key: string, value: NativePackageReferenceEvidence) => {
      const prior = found.get(key);
      found.set(key, {
        ...value,
        readers: [...new Set([...(prior?.readers ?? []), ...value.readers])].sort(),
      });
    };
    for (const { agentId, kind, declaration, resolved, physical, key } of present.flat()) {
      const raw = localReads.get(physical) ?? (yield* read(physical));
      localReads.set(physical, raw);
      const documentKey = JSON.stringify([physical, declaration.format]);
      let parsed = documents.get(documentKey);
      if (parsed === undefined) {
        const captured = yield* Effect.cached(
          parseNativeConfigRoot({
            format: declaration.format,
            raw,
            onFailure: invalidNativeConfig(declaration.format, resolved.path),
          }),
        );
        parsed = documents.get(documentKey) ?? captured;
        documents.set(documentKey, parsed);
      }
      const document = yield* parsed;
      let value: unknown = document;
      for (const key of declaration.keyPath ?? []) {
        value = Predicate.isObject(value)
          ? Object.entries(value).find(([name]) => name === key)?.[1]
          : undefined;
      }
      if (args.withdrawal !== undefined && selected.has(key) && Predicate.isObject(value)) {
        if (kind === "mcp-server" && args.withdrawal.type === "mcp-server")
          value = Object.fromEntries(
            Object.entries(value).filter(([name]) => name !== args.withdrawal?.name),
          );
        if (kind === "hook" && args.withdrawal.type === "hook" && Predicate.isObject(value)) {
          const selectors = [
            { name: args.withdrawal.name, ref: "preview", scope: args.scope, root },
          ];
          value = Object.fromEntries(
            Object.entries(value).map(([event, groups]) => [
              event,
              !Array.isArray(groups)
                ? groups
                : groups.flatMap((group) => {
                    if (!Predicate.isObject(group)) return [group];
                    const hooks = Object.entries(group).find(([key]) => key === "hooks")?.[1];
                    if (!Array.isArray(hooks))
                      return isDeclaredHookEntry(group, selectors) ? [] : [group];
                    return [
                      {
                        ...group,
                        hooks: hooks.filter((entry) => !isDeclaredHookEntry(entry, selectors)),
                      },
                    ];
                  }),
            ]),
          );
        }
      }
      let possible: unknown = value;
      if (kind === "mcp-server" && Predicate.isObject(value)) {
        const uncertain: Array<readonly [string, unknown]> = [];
        for (const [name, registration] of Object.entries(value)) {
          if (!Predicate.isObject(registration)) {
            uncertain.push([name, registration]);
            continue;
          }
          const command = Object.entries(registration).find(([key]) => key === "command")?.[1];
          const argumentsValue = Object.entries(registration).find(([key]) => key === "args")?.[1];
          const values = [command, ...(Array.isArray(argumentsValue) ? argumentsValue : [])];
          // These native fields hold individual process arguments, not shell source.
          // Substrings, expansion syntax, and arbitrary object text remain possible only.
          const exact = values.some(
            (value) =>
              typeof value === "string" &&
              !/[\s$%~;&|<>`]/u.test(value) &&
              (path.isAbsolute(value) || value.includes(path.sep)) &&
              beneath(value),
          );
          if (!exact) {
            uncertain.push([name, registration]);
            continue;
          }
          const keys = [...(declaration.keyPath ?? []), name];
          record(JSON.stringify([resolved.path, keys]), {
            path: resolved.path,
            evidence: "structured-reference",
            keys,
            readers: [agentId],
          });
        }
        possible = Object.fromEntries(uncertain);
      }
      if (yield* references(possible))
        record(JSON.stringify([resolved.path]), {
          path: resolved.path,
          evidence: "possible-reference",
          readers: [agentId],
        });
    }
    return [...found.values()].sort((left, right) => left.path.localeCompare(right.path));
  }).pipe(
    Effect.mapError(
      (cause) => new ProjectionIoFailed({ path: args.packageRoot, step: "inspect", cause }),
    ),
  );

/** This guard grants no mutation authority; uncertain references prevent package deletion. */
export const nativePackageReferences = (args: NativePackageReferenceRequest) =>
  Effect.map(inspectNativePackageReferences(args), (references) =>
    [...new Set(references.map((reference) => reference.path))].sort(),
  );
