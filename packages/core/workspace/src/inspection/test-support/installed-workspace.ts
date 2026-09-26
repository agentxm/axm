/**
 * A real workspace with a real Registry behind it, so an inspection
 * specification can arrange an installation by performing one.
 *
 * What `show` reports about an installed extension is only worth asserting if
 * the installation actually happened: a hand-written lockfile entry proves the
 * fixture agrees with itself, not that a shown extension reports the source
 * and version it was installed from. So the Registry here is the real
 * file-backed layout the production local client reads, the resolution is
 * `@agentxm/workspace/resolution`'s, and the installation is the
 * materialization capability's own install recipe over the production skill
 * manager. Only the process boundary stands in — a temporary directory and a
 * Registry on disk instead of one over the network.
 *
 * Inspection is a feature, so it reaches capabilities (materialization,
 * resolution, workspace state and projection) and the source integration; it
 * never reaches a peer feature to arrange its own subject.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../../transitions/settlement/live.js";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { AgentPresenceProbeLive } from "../../projection/agent-adapters/live.js";
import {
  PackManager,
  SkillManager,
  type ExtensionManagerFailure,
} from "../../materialization/index.js";
import { buildInstallOperation } from "../../reconciliation/index.js";
import { PackManagerLive, SkillManagerLive } from "../../materialization/live.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  ReleaseAgePosture,
  resolveConfiguredPack,
  resolveConfiguredSkill,
} from "../../resolution/index.js";
import { AxmSkillCandidateGateLive, RegistryResolutionPolicyLive } from "../../resolution/live.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { SourceHostProvidersLive } from "../../resolution/sources/live.js";
import { CredentialStore } from "@agentxm/registry-access/credentials";
import { CredentialStoreTest } from "@agentxm/registry-access/testing";
import { RegistryClientFactoryLive, RegistryUrl } from "@agentxm/registry-client";
import type { FileRegistry } from "@agentxm/registry-client/testing";
import { StepFailure } from "../../transitions/planning/index.js";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
} from "../../projection/live.js";
import { ConfiguredAgentOutcomesProviderTest } from "../../desired-state/testing.js";
import { FootprintRecorderTest } from "../../transitions/planning/testing.js";
import { layer as workspaceStateLayer } from "../../desired-state/live.js";

export interface InstalledWorkspaceOptions {
  readonly agents?: ReadonlyArray<string>;
  readonly sources?: ReadonlyArray<FileRegistry["source"]>;
}

/**
 * A temporary project workspace wired to the production services, so an
 * installation performed here is the installation the product performs.
 */
export const makeInstalledWorkspace = (options: InstalledWorkspaceOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-inspection-ws-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-inspection-wsh-")));
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify(
      {
        agents: options.agents ?? ["claude-code"],
        ...(options.sources === undefined ? {} : { sources: options.sources }),
      },
      null,
      2,
    )}\n`,
  );

  // Registry credentials are never read against a Registry on disk; the empty
  // store keeps the lookup answerable without reaching a real keychain.
  const credentials: Layer.Layer<CredentialStore> = CredentialStoreTest();
  const environment = Layer.mergeAll(
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
    Layer.succeed(RegistryUrl, "https://inspection-registry.example.test"),
    Layer.succeed(ReleaseAgePosture, "enforce" as const),
    credentials,
  );
  const platform = Layer.provideMerge(
    WorkspaceFileWriteLocksLive,
    Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer),
  );
  const presence = Layer.provideMerge(AgentPresenceProbeLive, platform);
  const state = Layer.provideMerge(
    Layer.provideMerge(
      workspaceStateLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
      presence,
    ),
    environment,
  );
  const agents = Layer.provideMerge(CodingAgentRepositoryLive, state);
  const projection = Layer.provideMerge(
    Layer.mergeAll(NativeWriteAuthorityLive, WorkspaceCatalogLive),
    agents,
  );
  const policy = Layer.provideMerge(
    Layer.mergeAll(
      AxmSkillCandidateGateLive,
      RegistryResolutionPolicyLive,
      Layer.provide(RegistryClientFactoryLive, Layer.mergeAll(platform, environment)),
    ),
    projection,
  );
  const sources = Layer.provideMerge(SourceHostProvidersLive, policy);
  const managers = Layer.provideMerge(Layer.mergeAll(SkillManagerLive, PackManagerLive), sources);
  const composed = Layer.provideMerge(
    Layer.mergeAll(ConfiguredAgentOutcomesProviderTest, FootprintRecorderTest),
    managers,
  );

  return {
    root,
    home,
    /** Read a workspace-relative file, or `undefined` when it is absent. */
    read: (relativePath: string): string | undefined => {
      const file = nodePath.join(root, relativePath);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    },
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.scoped(effect.pipe(Effect.provide(composed))),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

/** A manager failure the fixture could not classify is still a step failure. */
const toStepFailure = (failure: ExtensionManagerFailure): StepFailure =>
  failure instanceof StepFailure
    ? failure
    : new StepFailure({
        category: "internal",
        detail: `Fixture install failed with ${failure._tag}`,
        cause: failure,
      });

/**
 * Install one skill from a configured Registry source, exactly as the
 * lifecycle command does: resolve the requested locator to an accepted ref,
 * then run the materialization capability's install recipe over the
 * production skill manager. The settings source and the accepted version the
 * workspace ends up with are the installation's, never the fixture's.
 */
export const installRegistrySkill = Effect.fn("InspectionFixture.installRegistrySkill")(
  function* (args: { readonly name: string; readonly source: string }) {
    const manager = yield* SkillManager;
    const releaseAge = yield* makeConfiguredReleaseAgeEvaluation();
    const resolved = yield* resolveConfiguredSkill(args.name, args.source, releaseAge);
    const step = buildInstallOperation(manager, {
      ref: resolved.ref,
      declaration: { name: args.name, versionRange: Option.map(resolved.versionRange, String) },
      toStepFailure,
    });
    // A planned install step is ready or warned; an error step would mean the
    // recipe refused before the transaction, and the fixture must surface that
    // rather than silently arrange nothing.
    if (step.readiness === "error") {
      return yield* new StepFailure({ category: "internal", detail: step.errorMessage });
    }
    return yield* step.run;
  },
);

/**
 * Install one pack the same way, over the production pack manager. A pack's
 * owner, accepted version and recorded source are what an inventory reports
 * about it, so an inventory example arranges them by installing rather than by
 * writing a lockfile entry that restates the expectation.
 */
export const installRegistryPack = Effect.fn("InspectionFixture.installRegistryPack")(
  function* (args: { readonly name: string; readonly source: string }) {
    const manager = yield* PackManager;
    const releaseAge = yield* makeConfiguredReleaseAgeEvaluation();
    const resolved = yield* resolveConfiguredPack(args.name, args.source, releaseAge);
    const step = buildInstallOperation(manager, {
      ref: resolved.ref,
      declaration: { name: args.name, versionRange: Option.map(resolved.versionRange, String) },
      toStepFailure,
    });
    if (step.readiness === "error") {
      return yield* new StepFailure({ category: "internal", detail: step.errorMessage });
    }
    return yield* step.run;
  },
);
