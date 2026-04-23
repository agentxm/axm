/**
 * `workspace/skills-managed` — installed skill directories are managed by the
 * axm workspace.
 *
 * A skill artifact is unmanaged iff the workspace classifier classifies the
 * detected skill name as `lifecycle: "unmanaged"`. The rule emits one advisory
 * finding per unmanaged artifact location reported by the classifier.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import type { AgentDescriptor } from "../../../agents/types.js";
import { classifyExtensions } from "../../../workspace/classifier.js";
import { deriveSourceMetaForSkills } from "../../../workspace/source-metadata.js";
import { decodeLockfile, decodeSettings } from "./helpers/decode.js";

const RULE_ID = "workspace/skills-managed";
const EMPTY_ADVISORY_FINDINGS: ReadonlyArray<AdvisoryFinding> = [];

const unmanagedFinding = (name: string, location: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present here, but it is not managed by this workspace. ` +
    `To keep it, run \`axm skills install <source>\` with the intended source for '${name}'. ` +
    `To remove it, run \`axm prune\` or \`axm skills prune ${name}\`.`,
  location: { file: location },
});

export const skillsManagedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  // Keep the public description short and invariant-focused; the module docs
  // carry the narrower artifact-level implementation detail.
  description: "Skills are managed by the workspace.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const knownAgents = yield* context.workspace.knownAgents;
      const declaredAgents: ReadonlyArray<AgentDescriptor> = knownAgents.filter((agent) =>
        declaredAgentIds.has(agent.id),
      );

      const locationsByName = new Map<string, Array<string>>();
      for (const agent of declaredAgents) {
        const listResult = yield* Effect.result(context.workspace.list(agent.skills.dir));
        if (Result.isFailure(listResult)) {
          continue;
        }
        for (const artifact of listResult.success) {
          const location = `${agent.skills.dir}/${artifact}`;
          const existing = locationsByName.get(artifact);
          if (existing === undefined) {
            locationsByName.set(artifact, [location]);
            continue;
          }
          if (!existing.includes(location)) {
            existing.push(location);
          }
        }
      }

      const detectedEntries = [...locationsByName.entries()].map(([name, locations]) => ({
        name,
        locations,
      }));
      if (detectedEntries.length === 0) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      const lockSkills: Readonly<Record<string, { type: string }>> = Result.isSuccess(
        lockfileResult,
      )
        ? Option.match(lockfileResult.success, {
            onNone: () => ({}),
            onSome: (raw) =>
              Option.match(decodeLockfile(raw), {
                onNone: () => ({}),
                onSome: (lock) => lock.skills,
              }),
          })
        : {};

      const classifiedResult = yield* Effect.result(
        classifyExtensions({
          type: "skill",
          configured: settings.value.skills ?? {},
          lockedNames: Object.keys(lockSkills),
          detectedEntries,
          ignoredPatterns: settings.value.ignored?.skills ?? [],
          sourceMetaByName: deriveSourceMetaForSkills(
            settings.value,
            lockSkills,
            detectedEntries.map((entry) => entry.name),
          ),
        }),
      );
      if (Result.isFailure(classifiedResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      return classifiedResult.success.flatMap((entry) =>
        entry.lifecycle === "unmanaged"
          ? entry.locations.map((location) => unmanagedFinding(entry.name, location))
          : [],
      );
    }),
};
