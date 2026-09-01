/** Reports alignment between desired external Skills and accepted resolutions. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions/registry-source";
import { type Lockfile } from "../../../lockfile/schema.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { versionSatisfiesRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { DesiredExtensionNode } from "../../../workspace/desired-state-graph.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { lockfileDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/skills-lockfile-aligned";

const finding = (message: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file: path },
});

const externalSkills = (nodes: ReadonlyArray<DesiredExtensionNode>) =>
  nodes.filter(
    (node) =>
      node.type === "skill" && node.source !== undefined && !isWorkspaceSourceLocator(node.source),
  );

const collectFindings = (
  nodes: ReadonlyArray<DesiredExtensionNode>,
  lockfile: Lockfile,
  lockfilePath: string,
): ReadonlyArray<AdvisoryFinding> => {
  const desired = externalSkills(nodes);
  const desiredNames = new Set(desired.map((node) => node.name));
  const findings: Array<AdvisoryFinding> = [];

  for (const node of desired) {
    if (node.source === undefined) continue;
    const accepted = lockfile.skills[node.name];
    if (accepted === undefined) {
      findings.push(
        finding(
          `Skill '${node.name}' has desired external content but no accepted resolution.`,
          lockfilePath,
        ),
      );
      continue;
    }
    if (accepted.type !== "registry") continue;
    const parsed = parseRegistrySourceRef(node.source);
    const constraint = parsed?.versionRange;
    if (constraint !== undefined && !versionSatisfiesRange(accepted.resolvedVersion, constraint)) {
      findings.push(
        finding(
          `Skill '${node.name}' accepts Registry version ${accepted.resolvedVersion}, which does not satisfy desired constraint ${constraint}.`,
          lockfilePath,
        ),
      );
    }
  }

  for (const name of Object.keys(lockfile.skills)) {
    if (!desiredNames.has(name)) {
      findings.push(
        finding(`Skill '${name}' has an accepted resolution but is not desired.`, lockfilePath),
      );
    }
  }
  return findings;
};

export const skillsLockfileAlignedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired external Skills and accepted resolutions stay aligned.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graph = yield* Effect.result(context.health.desiredState);
      const lockfile = yield* Effect.result(context.workspace.state.lockfile);
      if (
        Result.isFailure(graph) ||
        Result.isFailure(lockfile) ||
        Option.isNone(lockfile.success)
      ) {
        return [];
      }
      return collectFindings(
        graph.success.nodes,
        lockfile.success.value,
        lockfileDisplayPath(context.subject.scope),
      );
    }),
};
