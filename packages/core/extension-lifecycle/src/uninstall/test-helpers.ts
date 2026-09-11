/**
 * Driving the removal use case from this package's own tests and
 * specifications.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import { UninstallExtensions, type UninstallExtensionsRequest } from "./uninstall-extensions.js";

/** The request every removal route builds. */
export const uninstallRequest = (args: {
  readonly type?: InstallableExtensionType;
  readonly selector: string;
}): UninstallExtensionsRequest => ({
  type: Option.fromUndefinedOr(args.type),
  selector: args.selector,
});

/** Settle a removal and preview it: nothing is written. */
export const previewUninstall = (request: UninstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* UninstallExtensions.prepare(request);
    return yield* UninstallExtensions.previewOrApply(candidate, previewPlanExecution);
  });

/** Settle a removal and apply it. */
export const applyUninstall = (request: UninstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* UninstallExtensions.prepare(request);
    return yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
  });
