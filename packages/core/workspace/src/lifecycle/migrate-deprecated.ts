/** Explicit replacement or removal of one installed, deprecated Registry extension. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RegistryClientFactory } from "@agentxm/registry-client";
import type { BundledAxmSkillAsset } from "../skills/lifecycle/install/bundled.js";
import type { PackUninstallRequirements } from "../packs/lifecycle/uninstall/plan.js";
import {
  buildReconciliationClosure,
  workspaceFailureToStepFailure,
} from "../reconciliation/index.js";
import {
  DesiredStateReader,
  WorkspaceLocation,
  acceptedResolutionRef,
} from "../desired-state/index.js";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type PlanExecution,
} from "../transitions/planning/index.js";
import { installRefused } from "./install/vocabulary.js";
import type { InstallStepRequirements } from "./install/vocabulary.js";
import { InstallExtensions } from "./install/install-extensions.js";
import { UninstallExtensions } from "./uninstall/uninstall-extensions.js";
import { resolveRootUninstallIntent } from "./uninstall/root-intent.js";

export const prepareDeprecatedMigration = Effect.fn("MigrateDeprecated.prepare")(function* (
  fqn: string,
) {
  const source = yield* resolveRootUninstallIntent(fqn);
  const desired = yield* DesiredStateReader;
  const node = (yield* desired.graph()).nodes.find(
    (entry) => entry.type === source.type && entry.name === source.name,
  );
  if (node === undefined) {
    return yield* installRefused({
      category: "not_found",
      detail: `${fqn} is not installed in this workspace`,
    });
  }
  const memberPacks = node.origins.flatMap((origin) =>
    origin.type === "pack" ? [origin.pack.fqn] : [],
  );
  if (memberPacks.length > 0) {
    return yield* installRefused({
      category: "conflict",
      detail: `${fqn} is installed through ${memberPacks.join(", ")}; ask the pack publisher to update its dependency`,
    });
  }
  const accepted = yield* acceptedResolutionRef({
    type: source.type,
    name: source.name,
    desired: node,
  });
  if (
    Option.isNone(accepted) ||
    accepted.value.refType !== "registry" ||
    accepted.value.owner !== source.owner
  ) {
    return yield* installRefused({
      category: "conflict",
      detail: `${fqn} is not an accepted Registry extension in this workspace`,
    });
  }
  const factory = yield* RegistryClientFactory;
  const client = yield* factory.forLocation(accepted.value.source.location);
  const index = yield* client.getExtensionIndex({
    owner: accepted.value.owner,
    type: accepted.value.type,
    name: accepted.value.name,
  });
  if (Option.isNone(index) || index.value.deprecation === null) {
    return yield* installRefused({
      category: "conflict",
      detail: `${fqn} is no longer deprecated in the Registry`,
    });
  }
  const deprecation = index.value.deprecation;
  if (deprecation.reason === "unmaintained" || deprecation.reason === "other") {
    return yield* installRefused({
      category: "validation",
      detail: `${fqn} is deprecated as ${deprecation.reason}; review the publisher notes and choose a successor manually`,
    });
  }
  const replacement = deprecation.reason === "superseded" ? deprecation.replacement : undefined;
  if (deprecation.reason === "superseded" && replacement?.status !== "available") {
    return yield* installRefused({
      category: "conflict",
      detail: `${fqn} cannot be migrated because its replacement is unavailable or concealed`,
    });
  }
  const replacementFqn = replacement?.status === "available" ? replacement.fqn : undefined;
  const install =
    replacementFqn === undefined
      ? undefined
      : yield* InstallExtensions.prepare({
          type: Option.none(),
          subject: { kind: "source", source: replacementFqn },
          selectors: {},
          all: false,
          reinstall: false,
          localName: Option.none(),
          env: [],
          nonInteractive: true,
          planName: `Install ${replacementFqn}`,
          planDescription: Option.none(),
        });
  const uninstall = yield* UninstallExtensions.prepare({ type: Option.none(), selector: fqn });
  const location = yield* WorkspaceLocation;
  const steps = [
    ...(install?.execution.plan.jobs.flatMap((job) => job.steps) ?? []),
    ...uninstall.execution.plan.jobs.flatMap((job) => job.steps),
  ];
  const closure = yield* buildReconciliationClosure<
    never,
    InstallStepRequirements | BundledAxmSkillAsset | PackUninstallRequirements
  >({
    toStepFailure: workspaceFailureToStepFailure,
    label: fqn,
    message:
      replacementFqn === undefined
        ? `Removed obsolete ${fqn}`
        : `Migrated ${fqn} to ${replacementFqn}`,
    artifact: { path: fqn, scope: location.scope, change: "updated" },
    children: steps.map((step) => ({ step, coverage: "eligible" as const })),
    validate: Effect.void,
  });
  const plan = {
    _tag: "Plan" as const,
    name: `Migrate ${fqn}`,
    description: Option.some(
      replacementFqn === undefined
        ? `Remove obsolete ${fqn}`
        : `Install ${replacementFqn} at ${location.scope} scope and remove ${fqn}; source-specific configuration is not copied`,
    ),
    presentation: operationPresentation({
      imperative: "migrate",
      past: "Migrated",
      gerund: "Migrating",
    }),
    jobs: [{ concurrency: 1, steps: [closure] }],
    riskConditions: [
      ...(install?.execution.plan.riskConditions ?? []),
      ...(uninstall.execution.plan.riskConditions ?? []),
    ],
  };
  return {
    source: fqn,
    reason: deprecation.reason,
    ...(replacementFqn === undefined ? {} : { replacement: replacementFqn }),
    execution: yield* prepareExecutionCandidate(plan, {
      configuredAgentOperations: [
        ...(install?.execution.configuredAgentOperations ?? []),
        ...uninstall.execution.configuredAgentOperations,
      ],
    }),
  };
});

export const MigrateDeprecated = {
  prepare: prepareDeprecatedMigration,
  previewOrApply: (
    candidate: Effect.Success<ReturnType<typeof prepareDeprecatedMigration>>,
    execution: PlanExecution,
  ) => resolveExecutionCandidate(candidate.execution, execution),
} as const;
