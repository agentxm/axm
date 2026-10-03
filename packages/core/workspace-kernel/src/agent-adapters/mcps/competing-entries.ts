/** Read competing native declarations without executing them or acquiring ownership. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as FileSystem from "effect/FileSystem";
import { McpConfigIoFailed } from "../errors.js";
import { NativeResolutionRoot } from "../../locations/index.js";
import type { McpConfigTarget } from "@agentxm/extension-model/unstable/agent-capabilities";
import { readNativeMcpConfig, readNativeMcpValues, decodeJsonMcpConfig } from "./native-config.js";

export interface CompetingMcpEntry {
  readonly name: string;
  readonly reason: string;
  readonly blocks: boolean;
}

export const readCompetingMcpEntries = (args: {
  readonly agentId: string;
  readonly target: McpConfigTarget;
  readonly locations: ReadonlyArray<{
    readonly path: string;
    readonly format: McpConfigTarget["format"];
    readonly serversPath: ReadonlyArray<string>;
  }>;
  readonly workspaceRoot: string;
  readonly userHome?: string | undefined;
  readonly claudeConfigRoot?: string | undefined;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const capturedRoot = yield* NativeResolutionRoot;
    const observable = (candidate: string) => {
      if (capturedRoot === undefined) return true;
      const relative = path.relative(capturedRoot, candidate);
      return (
        relative === "" ||
        (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
      );
    };
    const results: Array<CompetingMcpEntry> = [];
    if (args.agentId === "github-copilot-cli" && args.target.scope === "project") {
      const raw = yield* readNativeMcpConfig(args.target.path);
      if (Option.isSome(raw)) {
        const decoded = yield* decodeJsonMcpConfig(
          args.target.path,
          raw.value,
          ["mcpServers"],
          args.target.format,
        );
        if (decoded.servers === undefined && Object.keys(decoded.root).length > 0)
          results.push({
            name: "*",
            blocks: true,
            reason: `github-copilot-cli: bare-root configuration at ${args.target.path} cannot receive a nested mcpServers map without hiding existing entries. Convert the native file explicitly before projection; it remains untouched.`,
          });
      }
      const fs = yield* FileSystem.FileSystem;
      const exists = (file: string) =>
        fs.exists(file).pipe(
          Effect.mapError(
            (cause) =>
              new McpConfigIoFailed({
                detail: "Cannot inspect Copilot ancestor configuration boundary",
                cause,
              }),
          ),
        );
      let directory = args.workspaceRoot;
      const ancestors: Array<string> = [];
      while (!(yield* exists(path.join(directory, ".git")))) {
        const parent = path.dirname(directory);
        if (parent === directory || !observable(parent)) {
          ancestors.length = 0;
          break;
        }
        directory = parent;
        ancestors.push(directory);
      }
      for (const ancestorDirectory of ancestors) {
        for (const relative of [".mcp.json", ".github/mcp.json"]) {
          const configPath = path.join(ancestorDirectory, relative);
          const ancestor = yield* readNativeMcpConfig(configPath);
          if (Option.isNone(ancestor)) continue;
          const decoded = yield* decodeJsonMcpConfig(
            configPath,
            ancestor.value,
            ["mcpServers"],
            "json",
          );
          for (const name of Object.keys(decoded.servers ?? decoded.root))
            results.push({
              name,
              blocks: false,
              reason: `github-copilot-cli: ${args.target.path} takes precedence over inherited entry at ${configPath} when launched from this workspace. The ancestor entry remains untouched.`,
            });
        }
      }
    }
    for (const location of args.locations) {
      if (location.path === args.target.path || !observable(location.path)) continue;
      const raw = yield* readNativeMcpConfig(location.path);
      if (Option.isNone(raw)) continue;
      const values = yield* readNativeMcpValues({
        ...location,
        configPath: location.path,
        raw: raw.value,
      });
      // Copilot documents .mcp.json winning over .github/mcp.json at the same root.
      const lower =
        args.agentId === "github-copilot-cli" &&
        location.path === path.join(args.workspaceRoot, ".github/mcp.json");
      for (const name of Object.keys(values))
        results.push({
          name,
          blocks: !lower,
          reason: lower
            ? `${args.agentId}: ${args.target.path} takes precedence over the same-name entry at ${location.path}; the other entry remains untouched.`
            : `${args.agentId}: competing entry at ${location.path}; effective precedence is unverified. Resolve the duplicate before projecting to ${args.target.path}.`,
        });
    }
    if (
      args.agentId === "claude-code" &&
      args.target.scope === "project" &&
      args.userHome !== undefined
    ) {
      const configPath =
        args.claudeConfigRoot === undefined
          ? path.join(args.userHome, ".claude.json")
          : path.resolve(args.userHome, args.claudeConfigRoot, ".claude.json");
      if (!observable(configPath)) return results;
      const raw = yield* readNativeMcpConfig(configPath);
      if (Option.isSome(raw)) {
        const values = yield* readNativeMcpValues({
          format: "json",
          configPath,
          raw: raw.value,
          serversPath: ["projects", args.workspaceRoot, "mcpServers"],
        });
        for (const name of Object.keys(values))
          results.push({
            name,
            blocks: true,
            reason: `claude-code: local-scope entry at ${configPath} under projects[${JSON.stringify(args.workspaceRoot)}].mcpServers is the effective winner over ${args.target.path}. It remains untouched.`,
          });
      }
    }
    return results;
  });
