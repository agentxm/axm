/** Configured consumers constrain writes; other catalog readers remain potential readers. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Equal from "effect/Equal";
import * as Path from "effect/Path";
import {
  AGENTS,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  resolveNativeReferent,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
} from "../locations/index.js";
import { McpConfigInvalid } from "./errors.js";
import {
  hasNativeHookIntroductions,
  interpretNativeHookChanges,
} from "./hooks/reader-semantics.js";
import { readManagedHookUnits } from "./hooks/managed-groups.js";
import { interpretNativeMcpEntry } from "./mcps/reader-semantics.js";
import { parseNativeConfigRoot } from "./native-config-syntax.js";

export interface NativeConfigReader {
  readonly agentId: string;
  readonly kind: "hook" | "mcp-server" | "permissions";
  readonly alias: string;
  readonly format: NativeConfigReadLocation["format"];
  readonly configured: boolean;
  readonly settingsKey?: string;
}

const valueAtPath = (
  root: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): unknown => {
  let value: unknown = root;
  for (const key of keys) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = Object.entries(value).find(([name]) => name === key)?.[1];
  }
  return value;
};

const grammarFamily = (format: NativeConfigReadLocation["format"] | "text") =>
  format === "yaml" || format === "toml" || format === "text" ? format : "json";

export const preflightNativeConfigReaders = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly physicalPath: string;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly writerFormat: NativeConfigReadLocation["format"] | "text";
  readonly raw: string;
  readonly proposedRaw?: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const readers: NativeConfigReader[] = [];
    const referents = new Map<string, Option.Option<string>>();
    const entrySemantics = new Map<string, unknown>();
    for (const agent of AGENTS) {
      const configured = args.configuredAgentIds.includes(agent.id);
      const declarations: Array<{
        readonly kind: NativeConfigReader["kind"];
        readonly file: NativeConfigReadLocation;
      }> = [];
      const mcp = agent.capabilities["mcp-server"].native;
      if ("locations" in mcp)
        for (const file of mcp.locations) declarations.push({ kind: "mcp-server", file });
      const hook = agent.capabilities.hook.native;
      if ("locations" in hook)
        for (const file of hook.locations) declarations.push({ kind: "hook", file });
      const permissions = agent.permissions.native;
      if ("locations" in permissions)
        for (const file of permissions.locations) declarations.push({ kind: "permissions", file });
      for (const declaration of declarations) {
        const location = resolveNativeReadLocation(
          path,
          agent.id,
          declaration.file,
          args,
          args.nativeDirectoryInputs,
        );
        if (location === undefined) continue;
        const alias = location.path;
        let resolved = referents.get(alias);
        if (resolved === undefined) {
          resolved = yield* resolveNativeReferent(alias).pipe(Effect.option);
          referents.set(alias, resolved);
        }
        if (Option.isNone(resolved) || resolved.value !== args.physicalPath) continue;
        const reader = {
          agentId: agent.id,
          kind: declaration.kind,
          alias,
          format: declaration.file.format,
          configured,
          ...(declaration.file.keyPath === undefined || declaration.file.keyPath.length !== 1
            ? {}
            : { settingsKey: declaration.file.keyPath[0] }),
        };
        if (!configured) {
          readers.push(reader);
          continue;
        }
        if (
          args.proposedRaw === undefined &&
          grammarFamily(reader.format) !== grammarFamily(args.writerFormat)
        )
          return yield* new McpConfigInvalid({
            detail: `Native location ${args.physicalPath} cannot share ${args.writerFormat} output with ${agent.id}'s ${reader.format} reader`,
          });
        const parsed: Array<Readonly<Record<string, unknown>>> = [];
        for (const raw of args.proposedRaw === undefined
          ? [args.raw]
          : [args.raw, args.proposedRaw]) {
          const root = yield* parseNativeConfigRoot({
            format: reader.format,
            configPath: alias,
            raw,
          });
          parsed.push(root);
          if (reader.kind === "hook" && reader.settingsKey !== undefined)
            yield* readManagedHookUnits(alias, reader.settingsKey, raw, []).pipe(
              Effect.mapError(
                (cause) =>
                  new McpConfigInvalid({
                    detail: `Native Hook reader ${agent.id} cannot parse ${alias}`,
                    cause,
                  }),
              ),
            );
          if (reader.kind === "mcp-server" && declaration.file.keyPath !== undefined) {
            const value = valueAtPath(root, declaration.file.keyPath);
            if (
              value !== undefined &&
              (typeof value !== "object" || value === null || Array.isArray(value))
            )
              return yield* new McpConfigInvalid({
                detail: `Native MCP reader ${agent.id} requires object ${declaration.file.keyPath.join(".")} in ${alias}`,
              });
          }
        }
        if (
          reader.kind === "hook" &&
          declaration.file.keyPath !== undefined &&
          args.proposedRaw !== undefined
        ) {
          const before = valueAtPath(parsed[0] ?? {}, declaration.file.keyPath);
          const after = valueAtPath(parsed[1] ?? {}, declaration.file.keyPath);
          const beforeEvents =
            typeof before === "object" && before !== null && !Array.isArray(before)
              ? Object.entries(before)
              : [];
          const afterEvents =
            typeof after === "object" && after !== null && !Array.isArray(after)
              ? Object.entries(after)
              : [];
          for (const [name, groups] of afterEvents) {
            const priorGroups = beforeEvents.find(([priorName]) => priorName === name)?.[1];
            if (
              Equal.equals(priorGroups, groups) ||
              !hasNativeHookIntroductions(priorGroups, groups)
            )
              continue;
            const event =
              "events" in hook
                ? hook.events.find(({ nativeName }) => nativeName === name)
                : undefined;
            const dialect = "entryDialect" in hook ? hook.entryDialect : null;
            if (event === undefined || dialect === null || !("tools" in hook))
              return yield* new McpConfigInvalid({
                detail: `Native Hook reader ${agent.id} has no verified semantics for modified ${name} in ${alias}`,
              });
            const interpreted = interpretNativeHookChanges({
              before: priorGroups,
              after: groups,
              event,
              tools: hook.tools,
              dialect,
            });
            if (Option.isNone(interpreted))
              return yield* new McpConfigInvalid({
                detail: `Native Hook reader ${agent.id} cannot interpret modified ${name} in ${alias}`,
              });
            const key = JSON.stringify(["hook", ...declaration.file.keyPath, name]);
            const prior = entrySemantics.get(key);
            if (prior !== undefined && !Equal.equals(prior, interpreted.value))
              return yield* new McpConfigInvalid({
                detail: `Native Hook readers disagree on the meaning of ${name} in ${alias}`,
              });
            entrySemantics.set(key, interpreted.value);
          }
        }
        if (
          reader.kind === "mcp-server" &&
          declaration.file.keyPath !== undefined &&
          args.proposedRaw !== undefined
        ) {
          const before = valueAtPath(parsed[0] ?? {}, declaration.file.keyPath);
          const after = valueAtPath(parsed[1] ?? {}, declaration.file.keyPath);
          const beforeEntries =
            typeof before === "object" && before !== null && !Array.isArray(before)
              ? Object.entries(before)
              : [];
          const afterEntries =
            typeof after === "object" && after !== null && !Array.isArray(after)
              ? Object.entries(after)
              : [];
          const recipe = "entryDialect" in mcp ? mcp.entryDialect : null;
          for (const [name, entry] of afterEntries) {
            if (Equal.equals(beforeEntries.find(([priorName]) => priorName === name)?.[1], entry))
              continue;
            if (recipe === null || !("transports" in mcp))
              return yield* new McpConfigInvalid({
                detail: `Native MCP reader ${agent.id} has no verified entry dialect for modified ${declaration.file.keyPath.join(".")}.${name} in ${alias}`,
              });
            const interpreted = interpretNativeMcpEntry({
              entry,
              config: recipe,
              transports: mcp.transports,
              ...(!("mcpEnvExpansion" in mcp) || mcp.mcpEnvExpansion === undefined
                ? {}
                : { envExpansion: mcp.mcpEnvExpansion }),
            });
            if (Option.isNone(interpreted))
              return yield* new McpConfigInvalid({
                detail: `Native MCP reader ${agent.id} cannot interpret modified ${declaration.file.keyPath.join(".")}.${name} in ${alias}`,
              });
            const key = JSON.stringify(["mcp-server", ...declaration.file.keyPath, name]);
            const prior = entrySemantics.get(key);
            if (prior !== undefined && !Equal.equals(prior, interpreted.value))
              return yield* new McpConfigInvalid({
                detail: `Native MCP readers disagree on the meaning of ${declaration.file.keyPath.join(".")}.${name} in ${alias}`,
              });
            entrySemantics.set(key, interpreted.value);
          }
        }
        readers.push(reader);
      }
    }
    return readers;
  });
