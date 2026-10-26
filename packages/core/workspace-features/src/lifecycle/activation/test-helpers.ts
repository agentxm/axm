/**
 * Driving the activation use case from this package's own tests and
 * specifications, over a workspace that holds one authored extension of the
 * requested type in the requested activation state.
 *
 * Every seeded extension is workspace-authored so that activation is exercised
 * without a source fetch: enabling something the workspace already holds is
 * exactly what activation means, and a fixture that reached the network would
 * be describing installation instead.
 */

import * as nodePath from "node:path";

import * as Effect from "effect/Effect";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  applyPlanExecution,
  deriveOperationOutcome,
  previewPlanExecution,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import {
  DEFAULT_AUTHORED_DIRECTORIES,
  SETTINGS_ENTRY_KEYS,
} from "@agentxm/workspace-kernel/workspace-state";

import { writeMinimalPackage } from "../../testing/local-packages.js";
import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import { EnableExtension, DisableExtension } from "./set-activation.js";

interface ActivationRequest {
  readonly type: ExtensionType;
  readonly name: string;
  readonly enabled: boolean;
}

/** The settings value that declares a workspace-authored entry's activation. */
const settingsEntry = (enabled: boolean) => ({ source: "workspace", enabled });

/**
 * A workspace holding one authored extension of `type`, declared with the
 * given activation state and materialized for one configured agent.
 */
export const workspaceWithAuthoredExtension = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly enabled: boolean;
}): LifecycleFixture => {
  const fixture = makeLifecycleFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      [SETTINGS_ENTRY_KEYS[args.type]]: {
        [args.name]: {
          ...settingsEntry(args.enabled),
          ...(args.type === "mcp-server"
            ? {
                distribution: {
                  kind: "package",
                  registryType: "npm",
                  identifier: `@acme/${args.name}`,
                  transport: "stdio",
                },
              }
            : {}),
        },
      },
    },
  });
  writeMinimalPackage(
    nodePath.join(fixture.root, DEFAULT_AUTHORED_DIRECTORIES[args.type], args.name),
    args.type,
    { name: args.name },
  );
  return fixture;
};

/**
 * A workspace with a configured agent and no extension of any type, so a
 * request can name a subject the workspace does not hold.
 */
export const workspaceWithoutExtensions = (): LifecycleFixture =>
  makeLifecycleFixture({ settings: { owner: "@acme", agents: ["claude-code"] } });

const run = (
  request: ActivationRequest,
  mode: "apply" | "preview",
  acceptExecutionChanges = false,
) =>
  Effect.gen(function* () {
    const candidate = yield* request.enabled
      ? EnableExtension.prepare(request)
      : DisableExtension.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* DisableExtension.previewOrApply(
      candidate,
      mode === "preview"
        ? previewPlanExecution
        : acceptExecutionChanges
          ? applyPlanExecution({
              approval: "preapproved",
              acceptedPolicies: new Set(["accept-execution-changes"]),
              recovery: { command: ["enable"], arguments: [] },
            })
          : preapprovedPlanExecution,
    );
    return {
      _tag: "Resolved" as const,
      candidate,
      resolution,
      outcome: deriveOperationOutcome(resolution),
    };
  });

export const previewActivation = (request: ActivationRequest) => run(request, "preview");

export const applyActivation = (request: ActivationRequest) => run(request, "apply");

export const applyActivationAcceptingExecutionChanges = (request: ActivationRequest) =>
  run(request, "apply", true);
