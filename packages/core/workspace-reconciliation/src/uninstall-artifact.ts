import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  WorkspaceInvariantFacts,
  aggregateOwnershipUnits,
  observeAgentOutputs,
} from "@agentxm/workspace-projection";
import {
  acceptedCanonicalObservation,
  LockfileReader,
  WorkspaceMutations,
  type ExtensionTarget,
} from "@agentxm/workspace-state";
import type {
  JobStepArtifact,
  JobStepArtifactReference,
  JobStepArtifactTarget,
} from "@agentxm/workspace-operations";
import { proposeDesiredState, type DesiredStateProposal } from "./proposed-state.js";
import { WorkspaceSyncFailed } from "./errors.js";

/** Describe retirement from the same proposed authority that decides retention. */
export const prepareUninstallArtifact = (
  target: ExtensionTarget,
  proposal?: DesiredStateProposal,
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const locks = yield* LockfileReader;
    const state =
      proposal ??
      (yield* proposeDesiredState([{ kind: "remove", type: target.type, name: target.name }]));
    const before = state.before.nodes.find(
      (node) => node.type === target.type && node.name === target.name,
    );
    const after = state.after.nodes.find(
      (node) => node.type === target.type && node.name === target.name,
    );
    const sourceRemainsDesired =
      before !== undefined &&
      state.after.nodes.some(
        (node) => node.type === before.type && node.identity === before.identity,
      );
    const canonical = yield* acceptedCanonicalObservation({
      workspace: ws,
      type: target.type,
      name: target.name,
    });
    const prefix = ws.scope === "project" ? "" : ".axm/workspace/";
    const settingsPath = `${prefix}axm.json`;
    const lockPath = `${prefix}axm-lock.yaml`;
    const targets: JobStepArtifactTarget[] = [];
    const references: JobStepArtifactReference[] = [];
    if (before?.origins.some((origin) => origin.type === "settings"))
      targets.push({ path: settingsPath, change: "updated" });
    const locked = yield* locks.entry(
      target.type,
      target.type === "mcp-server" ? (before?.identity ?? target.name) : target.name,
    );
    if (Option.isSome(locked) && after === undefined && !sourceRemainsDesired)
      targets.push({ path: lockPath, change: "updated" });
    if (Option.isSome(canonical) && canonical.value.observation.path !== undefined) {
      const absolute = canonical.value.observation.path;
      const relative = path.relative(ws.baseDir, absolute);
      const present = yield* fs.exists(absolute).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceSyncFailed({
              category: "internal",
              detail: `Cannot inspect ${relative}`,
              cause,
            }),
        ),
      );
      if (!present)
        references.push({
          path: relative,
          state: "absent",
          reason: "canonical content is already absent",
        });
      else if (before?.identity.startsWith("workspace:"))
        references.push({ path: relative, state: "retained", reason: "workspace-authored source" });
      else if (after !== undefined || sourceRemainsDesired)
        references.push({
          path: relative,
          state: "retained",
          reason: "required by resulting desired state",
        });
      else if (canonical.value.observation.status === "usable")
        targets.push({ path: relative, change: "removed" });
      else
        references.push({
          path: relative,
          state: "unknown",
          reason: "canonical ownership or content could not be verified",
        });
    }
    const enabledNames = (type: "skill" | "subagent" | "mcp-server" | "hook") =>
      new Set(
        state.after.nodes
          .filter((node) => node.type === type && node.enabled)
          .map((node) => node.name),
      );
    const inventory = yield* observeAgentOutputs({
      workspaceRoot: ws.baseDir,
      scope: ws.scope,
      desiredAgentIds: new Set(yield* ws.getConfiguredAgents()),
      expectedNames: {
        skill: enabledNames("skill"),
        subagent: enabledNames("subagent"),
        "mcp-server": enabledNames("mcp-server"),
        hook: enabledNames("hook"),
      },
      skillOwnershipRoots:
        ws.layout.scope === "project"
          ? [ws.layout.acquiredRoot, ws.layout.authoredRoot("skill")]
          : [ws.layout.acquiredRoot],
      authoredSkills: { layout: ws.layout, entries: yield* ws.getConfiguredSkillEntries() },
    });
    for (const output of inventory.outputs.filter(
      (output) => output.extensionType === target.type && output.entryName === target.name,
    )) {
      if (target.type === "hook") continue;
      const relative = path.relative(
        ws.baseDir,
        target.type === "mcp-server" ? output.containerPath : output.path,
      );
      if (output.ownership === "unowned")
        references.push({
          path: relative,
          state: "retained",
          reason: "native output is not AXM-owned",
        });
      else if (after?.enabled === true)
        references.push({
          path: relative,
          state: "retained",
          reason: "required by resulting desired state",
        });
      else
        targets.push(
          target.type === "mcp-server"
            ? {
                path: relative,
                change: "updated",
                unitId: "mcp-server:native-config-entry",
                entryName: target.name,
                agentIds: output.claimantAgentIds,
              }
            : { path: relative, change: "removed", agentIds: output.claimantAgentIds },
        );
    }
    const facts = yield* (yield* WorkspaceInvariantFacts).projectionFacts;
    const affected = before?.enabled !== after?.enabled;
    const projections = affected
      ? facts.filter(
          (fact) =>
            aggregateOwnershipUnits.some(
              (unit) => unit.type === target.type && unit.unitId === fact.subject.unitId,
            ) &&
            (fact.observation.status !== "missing" || after?.enabled === true),
        )
      : [];
    for (const fact of projections) {
      if (
        fact.observation.reasonCode === "invalid-ownership" ||
        fact.observation.reasonCode === "unsupported-version"
      )
        continue;
      if (!targets.some((entry) => entry.path === fact.subject.path))
        targets.push({ path: fact.subject.path, change: "updated" });
    }
    return {
      path: targets[0]?.path ?? references[0]?.path ?? settingsPath,
      scope: ws.scope,
      change: targets.length === 0 ? "unchanged" : "updated",
      targets,
      references,
      managedRegions: projections.flatMap(({ subject }) =>
        subject.owner === undefined
          ? []
          : [{ unitId: subject.unitId, path: subject.path, owner: subject.owner }],
      ),
    } satisfies JobStepArtifact;
  });
