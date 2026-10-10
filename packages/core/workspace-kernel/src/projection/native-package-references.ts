/** Read-only guard against deleting code still referenced by native registrations. */
import {
  AGENTS,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { parse as parseShell } from "shell-quote";
import { isDeclaredHookEntry, parseNativeConfigRoot } from "../agent-adapters/index.js";
import { resolveNativeReadLocation, type NativeDirectoryInputs } from "../locations/index.js";
import { ProjectionIoFailed } from "./errors.js";

/** This guard grants no mutation authority; uncertain references prevent package deletion. */
export const nativePackageReferences = (args: {
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
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(args.packageRoot);
    const relativeRoot = path.relative(args.workspaceRoot, root);
    const beneath = (value: string) => {
      const relative = path.relative(root, path.resolve(args.workspaceRoot, value));
      return (
        relative === "" ||
        (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
      );
    };
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
    const found = new Set<string>();
    for (const { kind, declaration, resolved, key } of present.flat()) {
      const document = yield* parseNativeConfigRoot({
        format: declaration.format,
        configPath: resolved.path,
        raw: yield* fs.readFileString(resolved.path),
      });
      let value: unknown = document;
      for (const key of declaration.keyPath ?? []) {
        value =
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? Object.entries(value).find(([name]) => name === key)?.[1]
            : undefined;
      }
      if (
        args.withdrawal !== undefined &&
        selected.has(key) &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        if (kind === "mcp-server" && args.withdrawal.type === "mcp-server")
          value = Object.fromEntries(
            Object.entries(value).filter(([name]) => name !== args.withdrawal?.name),
          );
        if (
          kind === "hook" &&
          args.withdrawal.type === "hook" &&
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const selectors = [
            { name: args.withdrawal.name, ref: "preview", scope: args.scope, root },
          ];
          value = Object.fromEntries(
            Object.entries(value).map(([event, groups]) => [
              event,
              !Array.isArray(groups)
                ? groups
                : groups.flatMap((group) => {
                    if (typeof group !== "object" || group === null || Array.isArray(group))
                      return [group];
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
      if (yield* references(value)) found.add(resolved.path);
    }
    return [...found].sort();
  }).pipe(
    Effect.mapError(
      (cause) => new ProjectionIoFailed({ path: args.packageRoot, step: "inspect", cause }),
    ),
  );
