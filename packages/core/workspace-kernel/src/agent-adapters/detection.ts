/**
 * Agent detection functions for identifying installed AI coding agents.
 *
 * Detection is effectful and separated from the pure descriptor registry.
 * Uses FileSystem service for testability.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { ConfigError } from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { envOption, osHomeDirectory } from "@agentxm/host-primitives";
import { AgentDetectionFailed } from "./errors.js";
import { getConfigHome } from "./constants.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type {
  AgentDescriptor,
  AgentDetectionMarker,
  AgentScopeDetectionDescriptor,
} from "@agentxm/extension-model/unstable/agents/types";

// -----------------------------------------------------------------------------
// Detection Functions
// -----------------------------------------------------------------------------

const wrapDetectionError = (message: string) => (error: unknown) =>
  error instanceof ConfigError
    ? error
    : new AgentDetectionFailed({ detail: message, cause: error });

export interface AgentExecutableResolverService {
  readonly exists: (name: string) => Effect.Effect<boolean, ConfigError>;
}

export class AgentExecutableResolver extends ServiceMap.Service<
  AgentExecutableResolver,
  AgentExecutableResolverService
>()("@agentxm/workspace-kernel/agent-adapters/detection/AgentExecutableResolver") {}

/** Workstation roots observed by detection, independent of AXM's storage home. */
export class AgentDetectionRoots extends ServiceMap.Service<
  AgentDetectionRoots,
  { readonly home: string; readonly configHome: string }
>()("@agentxm/workspace-kernel/agent-adapters/detection/AgentDetectionRoots") {}

const detectionHome = Effect.gen(function* () {
  const roots = yield* Effect.serviceOption(AgentDetectionRoots);
  return Option.isSome(roots) ? roots.value.home : yield* osHomeDirectory;
});
const detectionConfigHome = Effect.gen(function* () {
  const roots = yield* Effect.serviceOption(AgentDetectionRoots);
  return Option.isSome(roots) ? roots.value.configHome : yield* getConfigHome;
});

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
          for (const candidate of candidates) {
            if (yield* fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false)))) {
              return true;
            }
          }
          return false;
        }

        const rawPathOpt = yield* envOption("PATH");
        const rawPath = Option.getOrElse(rawPathOpt, () => "");
        if (rawPath.trim().length === 0) return false;

        const delimiter = process.platform === "win32" ? ";" : ":";
        const dirs = rawPath
          .split(delimiter)
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0);

        // PATH is ordered. Stop after the first matching executable instead of
        // multiplying filesystem probes across every directory and variant.
        for (const dir of dirs) {
          for (const candidate of candidates) {
            if (
              yield* fs
                .exists(p.join(dir, candidate))
                .pipe(Effect.catch(() => Effect.succeed(false)))
            ) {
              return true;
            }
          }
        }
        return false;
      }),
  } satisfies AgentExecutableResolverService;
});

export const AgentExecutableResolverLive = Layer.effect(
  AgentExecutableResolver,
  makeAgentExecutableResolver,
);

const markerKey = (marker: AgentDetectionMarker): string =>
  marker.kind === "executable" ? `executable:${marker.name}` : `${marker.kind}:${marker.path}`;

const resolveUserDetectionPath = (marker: string) =>
  Effect.gen(function* () {
    const p = yield* Path.Path;
    if (marker === "$XDG_CONFIG_HOME") return yield* detectionConfigHome;
    if (marker.startsWith("$XDG_CONFIG_HOME/")) {
      const configHome = yield* detectionConfigHome;
      return p.join(configHome, marker.slice("$XDG_CONFIG_HOME/".length));
    }

    const home = yield* detectionHome;
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

type PathMarker = Extract<AgentDetectionMarker, { readonly kind: "dir" | "file" }>;

const probePathMarker = (marker: PathMarker, rootDir: string, scope: "project" | "user") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const resolvedPath = yield* resolvePathMarker(marker, rootDir, scope);
    return yield* fs.exists(resolvedPath);
  });

/** Probes one path marker; a detection pass may share probes among agents. */
type PathMarkerProbe = typeof probePathMarker;

const resolveMarker = (
  marker: AgentDetectionMarker,
  rootDir: string,
  scope: "project" | "user",
  probePath: PathMarkerProbe,
) =>
  Effect.gen(function* () {
    if (marker.kind === "executable") {
      const resolverOption = yield* Effect.serviceOption(AgentExecutableResolver);
      if (Option.isSome(resolverOption)) {
        return yield* resolverOption.value.exists(marker.name);
      }
      const resolver = yield* makeAgentExecutableResolver;
      return yield* resolver.exists(marker.name);
    }

    return yield* probePath(marker, rootDir, scope);
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
  probePath: PathMarkerProbe = probePathMarker,
) =>
  Effect.gen(function* () {
    const results = yield* Effect.forEach(
      detection.markers,
      (marker) =>
        resolveMarker(marker, rootDir, scope, probePath).pipe(
          Effect.map((resolved) => ({
            marker,
            resolved,
          })),
        ),
      // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed marker list for one agent descriptor
      { concurrency: "unbounded" },
    );

    return isScopeDetected(results);
  });

export interface AgentScopeDetection {
  readonly agent: AgentDescriptor;
  readonly project: boolean;
  readonly user: boolean;
}

const detectAgentScopesWith = (
  agent: AgentDescriptor,
  projectDir: string,
  probePath: PathMarkerProbe,
) =>
  Effect.gen(function* () {
    const home = yield* detectionHome;
    const [project, user] = yield* Effect.all(
      [
        detectScopeRaw(agent.detection.project, projectDir, "project", probePath),
        detectScopeRaw(agent.detection.user, home, "user", probePath),
      ],
      // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed two-way join of project and user scopes
      { concurrency: "unbounded" },
    );
    return { agent, project, user } satisfies AgentScopeDetection;
  }).pipe(Effect.mapError(wrapDetectionError(`Failed to detect ${agent.name}`)));

/** Detect project and user evidence independently for one agent. */
export const detectAgentScopes = (agent: AgentDescriptor, projectDir: string) =>
  detectAgentScopesWith(agent, projectDir, probePathMarker);

/**
 * Share, within one detection pass, the probe of each path marker that
 * several agents declare. A path marker resolves from its scope and declared
 * path alone (project markers against the pass's project directory, user
 * markers against the detection roots), so equal declarations name the same
 * path. The first agent to need such a marker resolves and probes it, and
 * every declaring agent receives that outcome; other markers are probed
 * directly. The probes live only as long as the returned function.
 */
const makeSharedPathMarkerProbe = (agents: ReadonlyArray<AgentDescriptor>, projectDir: string) =>
  Effect.gen(function* () {
    const markerId = (marker: PathMarker, scope: "project" | "user") => `${scope}:${marker.path}`;
    const declared = new Map<string, number>();
    for (const agent of agents) {
      for (const scope of ["project", "user"] as const) {
        for (const marker of agent.detection[scope].markers) {
          if (marker.kind === "executable") continue;
          const id = markerId(marker, scope);
          declared.set(id, (declared.get(id) ?? 0) + 1);
        }
      }
    }

    const shared = new Map<string, ReturnType<PathMarkerProbe>>();
    for (const agent of agents) {
      for (const scope of ["project", "user"] as const) {
        for (const marker of agent.detection[scope].markers) {
          if (marker.kind === "executable") continue;
          const id = markerId(marker, scope);
          if ((declared.get(id) ?? 0) < 2 || shared.has(id)) continue;
          shared.set(id, yield* Effect.cached(probePathMarker(marker, projectDir, scope)));
        }
      }
    }

    const probe: PathMarkerProbe = (marker, rootDir, scope) => {
      // Project markers resolve against the root they are probed in; only
      // probes of the pass's own project directory are shared.
      const cell =
        scope === "project" && rootDir !== projectDir
          ? undefined
          : shared.get(markerId(marker, scope));
      return cell ?? probePathMarker(marker, rootDir, scope);
    };
    return probe;
  });

/** Detect all agents while retaining the scope that supplied each signal. */
export const detectAgentScopeResults = (projectDir: string) =>
  Effect.gen(function* () {
    const agents = Object.values(AGENT_DESCRIPTORS);
    const probePath = yield* makeSharedPathMarkerProbe(agents, projectDir);
    const detections = yield* Effect.forEach(
      agents,
      (agent) => detectAgentScopesWith(agent, projectDir, probePath),
      {
        // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed agent descriptor catalog
        concurrency: "unbounded",
      },
    );
    return detections.filter(({ project, user }) => project || user);
  });

/** Detect agents whose structured evidence satisfies one selected scope. */
export const detectAgentsForScope = (projectDir: string, scope: "project" | "user") =>
  detectAgentScopeResults(projectDir).pipe(
    Effect.map((detections) =>
      detections.flatMap((detection) => (detection[scope] ? [detection.agent] : [])),
    ),
  );
