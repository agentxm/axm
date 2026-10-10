/** Final owner readback for native units a closure claims to realize or retain. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  combineNativeLocationOutcomes,
  nativeUnitKey,
  type NativeLocationOutcome,
} from "../locations/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  resolveConfiguredExtensionObservations,
  type ExtensionTarget,
} from "../workspace-state/index.js";
import {
  captureNativeRetentionWitnesses,
  validateNativeRetentionWitnesses,
  type NativeRetentionWitness,
  observeInstructionProjection,
  resolveInstructionsConfig,
} from "../projection/index.js";
import { WorkspaceSyncFailed } from "./errors.js";

const observeNativeOutputs = (
  subjects?: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">>,
  configuredAgents?: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const provider = yield* ConfiguredAgentOutcomesProvider;
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const graph = yield* (yield* DesiredStateReader).graph();
    const agentIds = configuredAgents ?? (yield* settings.configuredAgents);
    const nodes = graph.nodes.filter(
      (node) =>
        (node.enabled || node.type === "mcp-server") &&
        node.type !== "pack" &&
        (subjects === undefined ||
          subjects.some((subject) => subject.type === node.type && subject.name === node.name)),
    );
    const observed: NativeLocationOutcome[] = [];
    for (const type of new Set(nodes.map((node) => node.type))) {
      const rows = yield* records.rows(type);
      const names = new Set(nodes.filter((node) => node.type === type).map((node) => node.name));
      const observations = yield* resolveConfiguredExtensionObservations(provider, {
        type,
        state: "current",
        scope: location.scope,
        agentIds,
        rows: rows
          .filter((row) => names.has(row.name))
          .map((row) => ({
            name: row.name,
            targetState: "enabled",
            installed: row.installed,
            paths: row.paths,
            observedAgentIds: row.agents,
          })),
      });
      for (const [name, facts] of observations) {
        if (
          subjects !== undefined &&
          facts.agentOutcomes.some(
            (outcome) => outcome.reasonCode === "native-observation-unavailable",
          )
        )
          return yield* new WorkspaceSyncFailed({
            category: "conflict",
            detail: `Cannot verify native outputs for ${type} ${name}`,
          });
        observed.push(...facts.nativeLocations);
      }
    }
    return observed;
  });

/** Capture required existing units before mutation; foreign optional entries are excluded. */
export const captureRequiredNativeOutputs = (
  subjects: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">>,
  options?: {
    readonly configuredAgents?: ReadonlyArray<string>;
    readonly planned?: ReadonlyArray<NativeLocationOutcome>;
  },
) =>
  Effect.gen(function* () {
    const units = yield* observeNativeOutputs(subjects, options?.configuredAgents);
    if (options?.configuredAgents !== undefined) {
      const settings = yield* SettingsReader;
      const location = yield* WorkspaceLocation;
      const config = yield* settings.instructionsConfig;
      if (Option.isSome(config) && config.value !== false) {
        const instructions = yield* observeInstructionProjection({
          workspaceRoot: location.baseDir,
          scope: location.scope,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          configuredAgents: options.configuredAgents,
          config: resolveInstructionsConfig(config.value),
        });
        units.push(...instructions.nativeLocations);
      }
    }
    const mutations = (options?.planned ?? []).filter(
      (unit) => unit.state === "created" || unit.state === "updated" || unit.state === "removed",
    );
    const changedKeys = new Set(mutations.map(nativeUnitKey));
    // An intentional alias retirement changes a route to a retained region,
    // not the region's bytes. Exclude only explicitly planned entry routes.
    const changedRoutes = new Set(
      mutations
        .filter((unit) => unit.address.kind === "entry")
        .flatMap((unit) => [unit.address.path, ...unit.aliases]),
    );
    return units.flatMap((unit): NativeLocationOutcome[] => {
      const configuredConsumers =
        options?.configuredAgents === undefined
          ? unit.configuredConsumers
          : unit.configuredConsumers.filter((agent) => options.configuredAgents?.includes(agent));
      const requiredPolicy = unit.policyReasons.some(
        (reason) => reason !== "instruction-propagation",
      );
      if (
        (unit.ownership !== "owned" && unit.ownership !== "declared") ||
        changedKeys.has(nativeUnitKey(unit)) ||
        (configuredConsumers.length === 0 && !requiredPolicy)
      )
        return [];
      return [
        {
          ...unit,
          configuredConsumers,
          aliases: unit.aliases.filter((alias) => !changedRoutes.has(alias)),
        },
      ];
    });
  });

/** Run inside the transition before its first write, then carry this evidence to validation. */
export const captureNativeOutputRetention = (expected: ReadonlyArray<NativeLocationOutcome>) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    return yield* captureNativeRetentionWitnesses(combineNativeLocationOutcomes(expected), {
      workspaceRoot: location.baseDir,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
    });
  }).pipe(
    Effect.mapError(
      (cause) =>
        new WorkspaceSyncFailed({
          category: "conflict",
          detail: "Cannot capture retained native content before reconciliation",
          cause,
        }),
    ),
  );

export const validateNativeOutputPostconditions = (
  evidence: ReadonlyArray<NativeLocationOutcome>,
  expected: ReadonlyArray<NativeLocationOutcome> = [],
  retained: ReadonlyArray<NativeRetentionWitness> = [],
  subjects?: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">>,
) =>
  Effect.gen(function* () {
    if (retained.length > 0) {
      const location = yield* WorkspaceLocation;
      yield* validateNativeRetentionWitnesses(retained, {
        workspaceRoot: location.baseDir,
        nativeDirectoryInputs: location.nativeDirectoryInputs,
      });
    }
    const retired = new Set(expected.filter((unit) => unit.state === "removed").map(nativeUnitKey));
    const required = [...expected, ...evidence].filter(
      (unit) =>
        !retired.has(nativeUnitKey(unit)) &&
        unit.state !== "removed" &&
        unit.state !== "retained" &&
        (unit.ownership === "owned" ||
          unit.ownership === "declared" ||
          unit.state === "created" ||
          unit.state === "updated") &&
        (unit.configuredConsumers.length > 0 || unit.policyReasons.length > 0),
    );
    if (required.length === 0) return;
    const observed = yield* observeNativeOutputs(subjects);
    if (required.some((unit) => unit.policyReasons.includes("instruction-propagation"))) {
      const settings = yield* SettingsReader;
      const location = yield* WorkspaceLocation;
      const agentIds = yield* settings.configuredAgents;
      const config = yield* settings.instructionsConfig;
      if (Option.isSome(config) && config.value !== false) {
        const instructions = yield* observeInstructionProjection({
          workspaceRoot: location.baseDir,
          scope: location.scope,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          configuredAgents: agentIds,
          config: resolveInstructionsConfig(config.value),
        });
        observed.push(...instructions.nativeLocations);
      }
    }
    const current = new Map(observed.map((unit) => [nativeUnitKey(unit), unit]));
    for (const expected of required) {
      const actual = current.get(nativeUnitKey(expected));
      if (
        (actual?.ownership !== "owned" && actual?.ownership !== "declared") ||
        actual.state !== "unchanged"
      )
        return yield* new WorkspaceSyncFailed({
          category: "conflict",
          detail: `Required native output does not match desired content after reconciliation: ${expected.address.path}`,
        });
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof WorkspaceSyncFailed
        ? cause
        : new WorkspaceSyncFailed({
            category: "conflict",
            detail: "Cannot verify final native output postconditions",
            cause,
          }),
    ),
  );
