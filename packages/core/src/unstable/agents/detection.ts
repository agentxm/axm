/**
 * Agent detection functions for identifying installed AI coding agents.
 *
 * Detection is effectful and separated from the pure descriptor registry.
 * Uses FileSystem service for testability.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { makeAppError } from "../app-error/index.js";
import { UNIVERSAL_SKILLS_DIR_SEGMENT } from "../extensions/universal-skills-dir.js";
import { envOption } from "../utils/index.js";
import { getConfigHome, getHome } from "./constants.js";
import { AGENTS } from "./registry.js";
import type {
  AgentDescriptor,
  AgentDetectionMarker,
  AgentScopeDetectionDescriptor,
} from "./types.js";

// -----------------------------------------------------------------------------
// Detection Functions
// -----------------------------------------------------------------------------

const wrapDetectionError = (message: string) => (error: unknown) =>
  makeAppError({
    code: "internal",
    detail: message,
    cause: error,
  });

export interface AgentExecutableResolverService {
  readonly exists: (name: string) => Effect.Effect<boolean>;
}

export class AgentExecutableResolver extends ServiceMap.Service<
  AgentExecutableResolver,
  AgentExecutableResolverService
>()("@agentxm/client-core/unstable/agents/detection/AgentExecutableResolver") {}

const hasPathSeparator = (command: string): boolean =>
  command.includes("/") || command.includes("\\");

const getExecutableCandidates = (command: string, pathExt: string): ReadonlyArray<string> => {
  if (process.platform !== "win32") return [command];

  const lower = command.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".cmd")) return [command];

  const extensions = pathExt
    .split(";")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
};

const makeAgentExecutableResolver = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const p = yield* Path.Path;

  return {
    exists: (command: string) =>
      Effect.gen(function* () {
        if (command.trim().length === 0) return false;

        const pathExtOpt = yield* envOption("PATHEXT");
        const pathExt = Option.getOrElse(pathExtOpt, () => ".EXE;.CMD;.BAT;.COM");
        const candidates = getExecutableCandidates(command, pathExt);

        if (p.isAbsolute(command) || hasPathSeparator(command)) {
          const checks = yield* Effect.forEach(
            candidates,
            (candidate) => fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false))),
            { concurrency: "unbounded" },
          );
          return checks.some(Boolean);
        }

        const rawPathOpt = yield* envOption("PATH");
        const rawPath = Option.getOrElse(rawPathOpt, () => "");
        if (rawPath.trim().length === 0) return false;

        const delimiter = process.platform === "win32" ? ";" : ":";
        const dirs = rawPath
          .split(delimiter)
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0);

        const checks = yield* Effect.forEach(
          dirs,
          (dir) =>
            Effect.forEach(
              candidates,
              (candidate) =>
                fs.exists(p.join(dir, candidate)).pipe(Effect.catch(() => Effect.succeed(false))),
              { concurrency: "unbounded" },
            ).pipe(Effect.map((results) => results.some(Boolean))),
          { concurrency: "unbounded" },
        );

        return checks.some(Boolean);
      }),
  } satisfies AgentExecutableResolverService;
});

export const AgentExecutableResolverLive = Layer.effect(
  AgentExecutableResolver,
  makeAgentExecutableResolver,
);

const firstPathSegment = (dir: string): string | undefined => {
  const segment = dir.split("/")[0];
  return segment === undefined || segment.length === 0 ? undefined : segment;
};

const detectionSegments = (agent: AgentDescriptor): ReadonlyArray<string> =>
  Array.from(
    new Set(
      [
        firstPathSegment(agent.skills.dir),
        firstPathSegment(agent.commands?.dir ?? ""),
        firstPathSegment(agent.subagents?.dir ?? ""),
      ].filter(
        (segment): segment is string =>
          segment !== undefined && segment !== UNIVERSAL_SKILLS_DIR_SEGMENT,
      ),
    ),
  );

const markerKey = (marker: AgentDetectionMarker): string =>
  marker.kind === "executable" ? `executable:${marker.name}` : `${marker.kind}:${marker.path}`;

const fallbackScopeDetection = (agent: AgentDescriptor): AgentScopeDetectionDescriptor => ({
  markers: detectionSegments(agent).map((path) => ({
    kind: "dir",
    path,
    signal: "definitive",
    note: null,
  })),
});

const detectLegacySegmentsInRootRaw = (agent: AgentDescriptor, rootDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const results = yield* Effect.all(
      detectionSegments(agent).map((dir) => fs.exists(p.join(rootDir, dir))),
      {
        concurrency: "unbounded",
      },
    );

    return results.some((exists) => exists);
  });

const detectAgentInRootRaw = (agent: AgentDescriptor, rootDir: string) =>
  detectScopeRaw(agent.detection?.project ?? fallbackScopeDetection(agent), rootDir, "project");

const resolveUserDetectionPath = (marker: string) =>
  Effect.gen(function* () {
    const p = yield* Path.Path;
    if (marker === "$XDG_CONFIG_HOME") return yield* getConfigHome;
    if (marker.startsWith("$XDG_CONFIG_HOME/")) {
      const configHome = yield* getConfigHome;
      return p.join(configHome, marker.slice("$XDG_CONFIG_HOME/".length));
    }

    const home = yield* getHome;
    if (marker === "~") return home;
    if (marker.startsWith("~/")) return p.join(home, marker.slice("~/".length));
    return p.join(home, marker);
  });

const resolveProjectPath = (marker: string, rootDir: string) =>
  Effect.gen(function* () {
    const p = yield* Path.Path;
    return p.join(rootDir, marker);
  });

const resolvePathMarker = (
  marker: Extract<AgentDetectionMarker, { readonly kind: "dir" | "file" }>,
  rootDir: string,
  scope: "project" | "user",
) =>
  scope === "project"
    ? resolveProjectPath(marker.path, rootDir)
    : resolveUserDetectionPath(marker.path);

const resolveMarker = (marker: AgentDetectionMarker, rootDir: string, scope: "project" | "user") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (marker.kind === "executable") {
      const resolverOption = yield* Effect.serviceOption(AgentExecutableResolver);
      if (Option.isSome(resolverOption)) {
        return yield* resolverOption.value.exists(marker.name);
      }
      const resolver = yield* makeAgentExecutableResolver;
      return yield* resolver.exists(marker.name);
    }

    const resolvedPath = yield* resolvePathMarker(marker, rootDir, scope);
    return yield* fs.exists(resolvedPath);
  });

const isScopeDetected = (
  markers: ReadonlyArray<{ readonly marker: AgentDetectionMarker; readonly resolved: boolean }>,
): boolean => {
  const resolvedMarkers = markers.filter((entry) => entry.resolved);
  if (resolvedMarkers.some((entry) => entry.marker.signal === "definitive")) return true;

  const corroborating = new Set(
    resolvedMarkers
      .filter(
        (entry) => entry.marker.signal === "supporting" || entry.marker.signal === "ambiguous",
      )
      .map((entry) => markerKey(entry.marker)),
  );

  return corroborating.size >= 2;
};

const detectScopeRaw = (
  detection: AgentScopeDetectionDescriptor,
  rootDir: string,
  scope: "project" | "user",
) =>
  Effect.gen(function* () {
    const results = yield* Effect.forEach(
      detection.markers,
      (marker) =>
        resolveMarker(marker, rootDir, scope).pipe(
          Effect.map((resolved) => ({
            marker,
            resolved,
          })),
        ),
      { concurrency: "unbounded" },
    );

    return isScopeDetected(results);
  });

/**
 * Check whether an agent can be detected from a single filesystem root.
 *
 * Uses the first segment of the agent's skills, commands, and subagents
 * descriptors.
 */
export const detectAgentInRoot = (agent: AgentDescriptor, rootDir: string) =>
  detectAgentInRootRaw(agent, rootDir).pipe(
    Effect.mapError(wrapDetectionError(`Failed to detect ${agent.name}`)),
  );

/**
 * Check if a specific agent is installed by checking project-level and
 * user-scope roots.
 *
 * Returns `true` if any supported location exists.
 *
 * @param agent - The agent descriptor to check
 * @param projectDir - The project directory to check for agent config
 * @returns Effect that resolves to boolean indicating detection status
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgent = (agent: AgentDescriptor, projectDir: string) =>
  Effect.gen(function* () {
    const home = yield* getHome;

    const results = yield* Effect.all(
      [
        detectAgentInRootRaw(agent, projectDir),
        agent.detection === undefined
          ? detectLegacySegmentsInRootRaw(agent, home)
          : detectScopeRaw(agent.detection.user, home, "user"),
      ],
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  }).pipe(Effect.mapError(wrapDetectionError(`Failed to detect ${agent.name}`)));

/**
 * Detect all installed agents from a single filesystem root.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgentsInRoot = (rootDir: string) =>
  Effect.filter(Object.values(AGENTS), (agent) => detectAgentInRootRaw(agent, rootDir), {
    concurrency: "unbounded",
  }).pipe(Effect.mapError(wrapDetectionError(`Failed to detect installed agents in ${rootDir}`)));

/**
 * Detect all installed agents concurrently.
 *
 * Checks all registered agents and returns descriptors for those
 * that appear to be installed on the system.
 *
 * @param projectDir - The project directory to check for agent config
 * @returns Effect that resolves to array of detected agent descriptors
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectAgents = (projectDir: string) =>
  Effect.filter(Object.values(AGENTS), (agent) => detectAgent(agent, projectDir), {
    concurrency: "unbounded",
  });
