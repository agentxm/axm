import * as Result from "effect/Result";
import { acquiredPackageRelativePath } from "@agentxm/workspace-kernel/workspace-state";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
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
import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
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
  readonly localName?: string;
  readonly bind?: ReadonlyArray<string>;
  readonly bindEnv?: ReadonlyArray<string>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
  readonly nonInteractive?: boolean;
  readonly planName?: string;
}): InstallExtensionsRequest => {
  const selectors =
    args.selectors ?? (args.type === undefined ? {} : { [args.type]: args.names ?? [] });
  return {
    type: Option.fromUndefinedOr(args.type),
    subject: args.subject,
    selectors,
    // A request that names extensions takes those; one that names none takes all.
    all: args.all ?? Object.values(selectors).every((names) => names.length === 0),

    localName: Option.fromUndefinedOr(args.localName),
    bind: args.bind ?? [],
    bindEnv: args.bindEnv ?? [],
    ...(args.distributionId === undefined ? {} : { distributionId: args.distributionId }),
    ...(args.nativeOauth === undefined ? {} : { nativeOauth: args.nativeOauth }),
    nonInteractive: args.nonInteractive ?? true,
    planName: args.planName ?? "Install extensions",
    planDescription: Option.none(),
  };
};

/** Settle a request and preview it: nothing is written. */
export const previewInstall = (request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, previewPlanExecution).pipe(
      Effect.map((result) => result.resolution),
    );
  });

/** Settle a request and apply it. */
export const applyInstall = (request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution).pipe(
      Effect.map((result) => result.resolution),
    );
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
    readonly installedExecutables?: ReadonlyArray<string>;
  } = {},
): InstallWorld => {
  const owned = options.registry === undefined;
  const registry = options.registry ?? makeFileRegistry();
  const workspace = makeLifecycleFixture({
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    sources: "live",
    ...(options.installedExecutables === undefined
      ? {}
      : { installedExecutables: options.installedExecutables }),
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

/** Expected retained address for the fixture's actual Registry endpoint. */
export const fileRegistryPackagePath = (
  registry: FileRegistry,
  type: ExtensionTypePlural,
  name: string,
  owner = "@acme",
) =>
  `agent_extensions/${Result.getOrThrow(
    acquiredPackageRelativePath(
      {
        refType: "registry",
        owner: decodeHandleSync(owner),
        source: {
          type: "registry",
          name: registry.source.name,
          location: new URL(registry.url),
          owner: Option.none(),
        },
      },
      type,
      name,
    ),
  )}`;

/** Expected retained address for a selected package in the fixture Git server. */
export const gitPackagePath = (url: string, packageRoot = ".") =>
  `agent_extensions/${Result.getOrThrow(
    acquiredPackageRelativePath(
      {
        refType: "git-hosted",
        sourcePath: packageRoot,
        source: { type: "git", url: new URL(url), ref: Option.none(), subPath: Option.none() },
      },
      "skills",
      "fixture",
    ),
  )}`;
