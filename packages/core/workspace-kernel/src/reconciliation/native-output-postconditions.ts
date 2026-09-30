/** Final owner readback for native units a closure claims to realize or retain. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { nativeUnitKey, type NativeLocationOutcome } from "../locations/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  resolveConfiguredExtensionObservations,
  type ExtensionTarget,
} from "../workspace-state/index.js";
import { observeInstructionProjection, resolveInstructionsConfig } from "../projection/index.js";
import { WorkspaceSyncFailed } from "./errors.js";

const observeNativeOutputs = (subjects?: ReadonlyArray<ExtensionTarget>) =>
  Effect.gen(function* () {
    const provider = yield* ConfiguredAgentOutcomesProvider;
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const graph = yield* (yield* DesiredStateReader).graph();
    const agentIds = yield* settings.configuredAgents;
    const nodes = graph.nodes.filter(
      (node) =>
        node.enabled &&
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
export const captureRequiredNativeOutputs = (subjects: ReadonlyArray<ExtensionTarget>) =>
  observeNativeOutputs(subjects).pipe(
    Effect.map((units) =>
      units.filter(
        (unit) =>
          unit.ownership === "owned" &&
          (unit.configuredConsumers.length > 0 || unit.policyReasons.length > 0),
      ),
    ),
  );

export const validateNativeOutputPostconditions = (
  evidence: ReadonlyArray<NativeLocationOutcome>,
  expected: ReadonlyArray<NativeLocationOutcome> = [],
) =>
  Effect.gen(function* () {
    const retired = new Set(expected.filter((unit) => unit.state === "removed").map(nativeUnitKey));
    const required = [...expected, ...evidence].filter(
      (unit) =>
        !retired.has(nativeUnitKey(unit)) &&
        unit.state !== "removed" &&
        (unit.ownership === "owned" || unit.state === "created" || unit.state === "updated") &&
        (unit.configuredConsumers.length > 0 || unit.policyReasons.length > 0),
    );
    if (required.length === 0) return;
    const observed = yield* observeNativeOutputs();
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
      if (actual?.ownership !== "owned" || actual.state !== "unchanged")
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
