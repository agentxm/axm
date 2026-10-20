/**
 * Registry selection: which Registry an invocation's settings name.
 *
 * One snapshot of the applicable project and user settings, read once, and
 * one pure decision over it. The default is the project's `defaultRegistry`,
 * else the user's, else the built-in `agentxm`; an explicit selection is a
 * configured source name or an absolute http(s) origin. A default or name no
 * settings configure is a typed failure, never another Registry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";

import {
  isHttpRegistryEndpoint,
  parseRegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  RegistrySelectionFailed,
  RegistrySourceUnknown,
  type BoundRegistry,
  type RegistrySelectionFailure,
  type RegistrySelectionReason,
} from "@agentxm/registry-client";

import type { Settings, SourceHostConfig } from "../desired/settings/index.js";
import type { WorkspaceSettingsReadFailure } from "./contracts.js";
import { WorkspaceDocuments } from "./documents.js";
import { resolveUserWorkspaceLayout } from "./layout.js";
import { WorkspaceLocation } from "./location.js";

/** One settings document an invocation's Registry selection reads. */
interface SettingsDocumentSnapshot {
  readonly path: string;
  /** The decoded document; empty when the file is absent. */
  readonly settings: Settings;
}

/** The project and user settings that decide Registry selection, read once. */
export interface SourceConfigurationSnapshot {
  readonly project: SettingsDocumentSnapshot;
  readonly user: SettingsDocumentSnapshot;
  readonly builtInSources: ReadonlyArray<SourceHostConfig>;
}

/** The default Registry name and the scope whose settings chose it. */
export interface DefaultRegistrySelection {
  readonly name: string;
  readonly scope: "project" | "user" | "built-in";
}

/** The built-in Registry every workspace can name. */
export const BUILT_IN_REGISTRY_NAME = "agentxm";

/** `defaultRegistry`: project settings, then user settings, then the built-in Registry. */
export const defaultRegistrySelection = (
  project: Pick<Settings, "defaultRegistry">,
  user: Pick<Settings, "defaultRegistry">,
): DefaultRegistrySelection =>
  project.defaultRegistry !== undefined
    ? { name: project.defaultRegistry, scope: "project" }
    : user.defaultRegistry !== undefined
      ? { name: user.defaultRegistry, scope: "user" }
      : { name: BUILT_IN_REGISTRY_NAME, scope: "built-in" };

/** Read the applicable project and user settings of a project-scoped workspace. */
export const readSourceConfigurationSnapshot: Effect.Effect<
  SourceConfigurationSnapshot,
  WorkspaceSettingsReadFailure,
  WorkspaceLocation | WorkspaceDocuments | Path.Path
> = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const documents = yield* WorkspaceDocuments;
  const userLayout = yield* resolveUserWorkspaceLayout(location.userHome);
  return {
    project: { path: location.settingsPath, settings: yield* documents.settings("project") },
    user: { path: userLayout.settingsPath, settings: yield* documents.settings("user") },
    builtInSources: location.builtInSources,
  } satisfies SourceConfigurationSnapshot;
});

/**
 * Three-layer merge: project sources, then user-scope sources, then built-in
 * sources. Name-based deduplication: earlier layers win, and a built-in name
 * is reserved, so no settings layer redefines it. Selection, the settings
 * reader, and desired-state collection all merge through here.
 */
export const mergeSources = (
  projectSources: ReadonlyArray<SourceHostConfig>,
  globalSources: ReadonlyArray<SourceHostConfig>,
  builtInSources: ReadonlyArray<SourceHostConfig>,
): ReadonlyArray<SourceHostConfig> => {
  const builtInNames = new Set(builtInSources.map((source) => source.name));
  const filteredProject = projectSources.filter((source) => !builtInNames.has(source.name));
  const projectNames = new Set(filteredProject.map((source) => source.name));
  const filteredGlobal = globalSources.filter(
    (source) => !builtInNames.has(source.name) && !projectNames.has(source.name),
  );
  const projectGlobalNames = new Set([...projectNames, ...filteredGlobal.map((s) => s.name)]);
  return [
    ...filteredProject,
    ...filteredGlobal,
    ...builtInSources.filter((s) => !projectGlobalNames.has(s.name)),
  ];
};

/** The merged Registry source of one name, and the settings document that configured it. */
const configuredRegistry = (
  snapshot: SourceConfigurationSnapshot,
  name: string,
):
  | { readonly source: SourceHostConfig; readonly settingsPath: Option.Option<string> }
  | undefined => {
  const projectSources = snapshot.project.settings.sources ?? [];
  const userSources = snapshot.user.settings.sources ?? [];
  const source = mergeSources(projectSources, userSources, snapshot.builtInSources).find(
    (candidate) => candidate.name === name,
  );
  if (source === undefined) return undefined;
  const settingsPath = projectSources.includes(source)
    ? Option.some(snapshot.project.path)
    : userSources.includes(source)
      ? Option.some(snapshot.user.path)
      : Option.none<string>();
  return { source, settingsPath };
};

const defaultReason = (scope: DefaultRegistrySelection["scope"]): RegistrySelectionReason =>
  scope === "project" ? "project-default" : scope === "user" ? "user-default" : "built-in";

/** The settings-selected default Registry. */
const selectDefaultRegistry = (
  snapshot: SourceConfigurationSnapshot,
): Result.Result<BoundRegistry, RegistrySelectionFailure> => {
  const selection = defaultRegistrySelection(snapshot.project.settings, snapshot.user.settings);
  const settingsPath =
    selection.scope === "project"
      ? Option.some(snapshot.project.path)
      : selection.scope === "user"
        ? Option.some(snapshot.user.path)
        : Option.none<string>();
  const configured = configuredRegistry(snapshot, selection.name);
  return configured === undefined
    ? Result.fail(
        new RegistrySourceUnknown({ name: selection.name, scope: selection.scope, settingsPath }),
      )
    : Result.succeed({
        name: selection.name,
        endpoint: configured.source.location,
        reason: defaultReason(selection.scope),
        settingsPath,
      });
};

/**
 * The Registry a selection names: a configured source name, an absolute
 * http(s) origin, or — with no selection — the default. The default must be
 * valid even when an explicit selection names another Registry: settings that
 * cannot select a default cannot be trusted to select anything.
 */
export const selectRegistry = (
  snapshot: SourceConfigurationSnapshot,
  selector: Option.Option<string>,
): Result.Result<BoundRegistry, RegistrySelectionFailure> =>
  Result.flatMap(
    selectDefaultRegistry(snapshot),
    (defaultBound): Result.Result<BoundRegistry, RegistrySelectionFailure> => {
      if (Option.isNone(selector)) return Result.succeed(defaultBound);
      const requested = selector.value;
      if (URL.canParse(requested)) {
        const endpoint = parseRegistryEndpoint(requested);
        if (Result.isFailure(endpoint)) {
          return Result.fail(
            new RegistrySelectionFailed({
              detail: `--registry must name a configured Registry source or an http(s) origin. ${endpoint.failure.message}`,
              cause: endpoint.failure,
            }),
          );
        }
        if (!isHttpRegistryEndpoint(endpoint.success)) {
          return Result.fail(
            new RegistrySelectionFailed({
              detail:
                "--registry must name a configured Registry source or an http(s) origin; configure a file Registry as a source and name it.",
              cause: endpoint.success,
            }),
          );
        }
        return Result.succeed({
          name: endpoint.success.href,
          endpoint: endpoint.success,
          reason: "explicit-url",
          settingsPath: Option.none(),
        });
      }
      const configured = configuredRegistry(snapshot, requested);
      return configured === undefined
        ? Result.fail(
            new RegistrySourceUnknown({
              name: requested,
              scope: "explicit",
              settingsPath: Option.none(),
            }),
          )
        : Result.succeed({
            name: requested,
            endpoint: configured.source.location,
            reason: "named-source",
            settingsPath: configured.settingsPath,
          });
    },
  );
