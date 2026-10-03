/** Fresh proof that an install would preserve both accepted intent and physical output. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { DistributionDescriptorSchema } from "@agentxm/extension-model/unstable/extensions/refs/ref-base";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions";
import { kernelFailureToStepFailure } from "../failure-rendering.js";
import { sourceRefContentKey } from "../../acquisition/index.js";
import {
  acceptedLockedResolutionRef,
  computePackManifestContentIdentity,
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  LockfileReader,
  observeDesiredCanonical,
  SettingsReader,
  WorkspaceLocation,
  withWorkspaceReadView,
  type ConfiguredExtensionObservation,
} from "../../workspace-state/index.js";

const sameDistribution = Schema.toEquivalence(Schema.UndefinedOr(DistributionDescriptorSchema));

export const observeSatisfiedInstall = (args: {
  readonly ref: ExtensionRef;
  readonly force?: boolean;
  readonly declaration?: { readonly name: string; readonly versionRange: Option.Option<string> };
}) =>
  withWorkspaceReadView(
    Effect.gen(function* () {
      // Local paths are mutable; their materializer must validate source reuse.
      // Authored content and connection configuration have separate contracts.
      if (
        args.force === true ||
        args.ref.refType === "workspace" ||
        args.ref.refType === "local" ||
        args.ref.type === "mcp-server"
      )
        return Option.none<ConfiguredExtensionObservation>();
      const name = extensionRefName(args.ref);
      const desired = yield* DesiredStateReader;
      const evaluation = yield* desired.evaluate();
      const node = evaluation.graph.nodes.find(
        (node) => node.type === args.ref.type && node.name === name,
      );
      if (
        node === undefined ||
        !node.enabled ||
        node.source === undefined ||
        node.identity.authority === "workspace" ||
        node.identity.authority === "bundled"
      )
        return Option.none();
      if (
        args.declaration !== undefined &&
        (args.declaration.name !== name ||
          !node.origins.some(
            (origin) => origin.type === "settings" && origin.source === node.source,
          ) ||
          Option.getOrUndefined(args.declaration.versionRange) !==
            parseRegistrySourceRef(node.source)?.versionRange)
      )
        return Option.none();
      const accepted = yield* acceptedLockedResolutionRef({ type: node.type, name });
      if (
        Option.isNone(accepted) ||
        sourceRefContentKey(accepted.value) !== sourceRefContentKey(args.ref)
      )
        return Option.none();
      if (
        !sameDistribution(
          "distribution" in accepted.value ? accepted.value.distribution : undefined,
          "distribution" in args.ref ? args.ref.distribution : undefined,
        )
      )
        return Option.none();
      if (args.ref.type === "pack") {
        if (accepted.value.type !== "pack") return Option.none();
        const manifestIdentity = (ref: PackRef) =>
          computePackManifestContentIdentity({
            owner: ref.owner,
            type: "pack",
            name: ref.pack.name,
            version: ref.version,
            dependencies: ref.pack.dependencies,
          });
        if (manifestIdentity(accepted.value) !== manifestIdentity(args.ref)) return Option.none();
      }
      const canonical = yield* observeDesiredCanonical(node);
      if (canonical.observation.status !== "usable") return Option.none();
      if (node.type === "pack")
        return Option.some<ConfiguredExtensionObservation>({
          agentOutcomes: [],
          nativeLocations: [],
        });
      const providers = yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider);
      if (Option.isNone(providers)) return Option.none();
      const observe = providers.value.byExtensionType[node.type];
      if (observe === undefined) return Option.none();
      const location = yield* WorkspaceLocation;
      const settings = yield* SettingsReader;
      const locks = yield* LockfileReader;
      const observation = (yield* observe({
        readers: { settings, locks, desired },
        type: node.type,
        state: "current",
        scope: location.scope,
        agentIds: evaluation.inputs.settings.agents ?? [],
        rows: [{ name, targetState: "enabled", installed: true }],
      })).get(name);
      if (
        observation === undefined ||
        observation.nativeLocations.length === 0 ||
        !observation.agentOutcomes.every((outcome) => outcome.outcome === "current") ||
        !observation.nativeLocations.every(
          (unit) =>
            (unit.state === "unchanged" && unit.ownership === "owned") ||
            (unit.state === "absent" &&
              unit.configuredConsumers.length === 0 &&
              !unit.policyReasons.includes("workspace-shared-skills")),
        )
      )
        return Option.none();
      return Option.some(observation);
    }),
  ).pipe(Effect.mapError(kernelFailureToStepFailure));
