/** Reports whether accepted external-resolution state is readable and present when required. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { isWorkspaceSourceLocator } from "../../../sources/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { lockfileDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/lockfile-valid";

const isExternalSource = (source: string): boolean =>
  source !== "inline" && !isWorkspaceSourceLocator(source);

const finding = (message: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file: path },
});

export const lockfileValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description:
    "Accepted external-resolution state is current, readable, and present when required.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const lockfileResult = yield* Effect.result(context.workspace.state.lockfile);
      const lockfilePath = lockfileDisplayPath(context.subject.scope);
      if (Result.isFailure(lockfileResult)) {
        if (lockfileResult.failure._tag === "LockfileDecodeError") {
          return lockfileResult.failure.issues.map((issue) =>
            finding(
              `The accepted external-resolution lockfile does not match the current schema: ${issue}`,
              lockfilePath,
            ),
          );
        }
        return [
          finding(
            `The accepted external-resolution lockfile is unreadable: ${lockfileResult.failure._tag}`,
            lockfilePath,
          ),
        ];
      }
      if (Option.isSome(lockfileResult.success)) return [];

      if (context.health !== undefined) {
        const graph = yield* Effect.result(context.health.desiredState);
        if (
          Result.isSuccess(graph) &&
          graph.success.nodes.some((node) => isExternalSource(node.source))
        ) {
          return [
            finding(
              "Accepted external-resolution state is missing for desired external content.",
              lockfilePath,
            ),
          ];
        }
        return [];
      }

      const settings = yield* Effect.result(context.workspace.state.settings);
      if (Result.isFailure(settings) || Option.isNone(settings.success)) return [];
      const declarations = [
        ...Object.values(settings.success.value.skills ?? {}),
        ...Object.values(settings.success.value.packs ?? {}),
        ...Object.values(settings.success.value.subagents ?? {}),
        ...Object.values(settings.success.value.mcpServers ?? {}),
        ...Object.values(settings.success.value.rules ?? {}),
        ...Object.values(settings.success.value.hooks ?? {}),
        ...Object.values(settings.success.value.knowledge ?? {}),
      ];
      return declarations.some((entry) => isExternalSource(entry.source))
        ? [
            finding(
              "Accepted external-resolution state is missing for desired external content.",
              lockfilePath,
            ),
          ]
        : [];
    }),
};
