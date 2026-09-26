/**
 * Driving the install use case from the features' tests and specifications.
 *
 * Every helper builds the same request the application builds and resolves it
 * through the same two calls, so a specification observes the use case rather
 * than a rehearsal of it.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { makeFileRegistry, type FileRegistry } from "@agentxm/registry-client/testing";
import { previewPlanExecution } from "../operations/index.js";
import { preapprovedPlanExecution } from "../transitions/planning/testing.js";
import {
  InstallExtensions,
  type InstallExtensionsRequest,
  type InstallSubject,
} from "../lifecycle/index.js";
import { makeLifecycleFixture, type LifecycleFixture } from "../lifecycle/testing.js";

/** The request every route builds, with the parts a given example leaves out. */
export const installRequest = (args: {
  readonly type?: InstallableExtensionType;
  readonly subject: InstallSubject;
  readonly names?: ReadonlyArray<string>;
  readonly selectors?: InstallExtensionsRequest["selectors"];
  readonly all?: boolean;
  readonly reinstall?: boolean;
  readonly localName?: string;
  readonly env?: ReadonlyArray<string>;
  readonly nonInteractive?: boolean;
  readonly planName?: string;
}): InstallExtensionsRequest => ({
  type: Option.fromUndefinedOr(args.type),
  subject: args.subject,
  selectors: args.selectors ?? (args.type === undefined ? {} : { [args.type]: args.names ?? [] }),
  all: args.all ?? true,
  reinstall: args.reinstall ?? false,
  localName: Option.fromUndefinedOr(args.localName),
  env: args.env ?? [],
  nonInteractive: args.nonInteractive ?? true,
  planName: args.planName ?? "Install extensions",
  planDescription: Option.none(),
});

/** Settle a request and preview it: nothing is written. */
export const previewInstall = (request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, previewPlanExecution);
  });

/** Settle a request and apply it. */
export const applyInstall = (request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
  });

/** A workspace that can resolve real sources, with a Registry to publish into. */
export interface InstallWorld {
  readonly workspace: LifecycleFixture;
  readonly registry: FileRegistry;
  readonly cleanup: () => void;
}

/**
 * A project workspace with an owner, one configured agent, and a `file://`
 * Registry declared as its only source.
 */
export const makeInstallWorld = (
  options: {
    readonly settings?: Readonly<Record<string, unknown>>;
    readonly scope?: "project" | "user";
    /** Reuse a Registry another workspace already published into. */
    readonly registry?: FileRegistry;
  } = {},
): InstallWorld => {
  const owned = options.registry === undefined;
  const registry = options.registry ?? makeFileRegistry();
  const workspace = makeLifecycleFixture({
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    sources: "live",
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      defaultRegistry: "test",
      sources: [registry.source],
      ...options.settings,
    },
  });
  return {
    workspace,
    registry,
    cleanup: () => {
      workspace.cleanup();
      if (owned) registry.cleanup();
    },
  };
};
