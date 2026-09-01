import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import type { InstructionStatusItem } from "@agentxm/extension-workspace";

const RULE_ID = "workspace/instructions-target-current";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

const targetHealth = new Set(["missing-target", "drift"]);

/**
 * A projected target whose desired state is fully determined by its source:
 * absent, or an AXM-owned copy that drifted. Anything unowned at the same
 * path — authored content, a foreign or dangling symlink — is a collision,
 * reported by `workspace/instructions-target-unowned`, never as regenerable
 * drift. A missing source is reported by `workspace/instructions-source-present`.
 */
const isTargetFinding = (item: InstructionStatusItem): boolean =>
  (item.mechanism === "symlink" || item.mechanism === "copy") &&
  targetHealth.has(item.health) &&
  item.ownership !== "unowned";

const messageFor = (item: InstructionStatusItem): string =>
  item.health === "missing-target"
    ? `The ${item.agentName} instruction file is missing.`
    : `The AXM-managed ${item.agentName} instruction copy differs from the source file.`;

export const instructionsTargetCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agent instruction target files are current.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const snapshot = yield* context.instructions.snapshot;
      if (Option.isNone(snapshot)) return EMPTY_LINT_FINDINGS;

      const findings: Array<LintFinding> = [];
      for (const item of snapshot.value.status.items) {
        if (!isTargetFinding(item)) continue;
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message: messageFor(item),
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
};
