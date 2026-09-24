/**
 * The Pack members the desired-state graph binds for a subject, as a rule
 * reads them. A context without desired-state health, or whose graph cannot
 * be read, has no members to report on; the rules that own that failure
 * report it.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { packMemberBindings, type PackMemberBinding } from "../../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../../workspace-context.js";

export const desiredPackMemberBindings = (
  context: WorkspaceRuleContext,
  type: InstallableExtensionType,
): Effect.Effect<ReadonlyArray<PackMemberBinding>> =>
  Effect.gen(function* () {
    if (context.health === undefined) return [];
    const graph = yield* Effect.result(context.health.desiredState);
    return Result.isFailure(graph)
      ? []
      : packMemberBindings(graph.success, context.subject.scope, type);
  });
