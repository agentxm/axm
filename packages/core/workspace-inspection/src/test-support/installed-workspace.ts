/**
 * A real workspace with a real Registry behind it, so an inspection
 * specification can arrange an installation by performing one.
 *
 * What `show` reports about an installed extension is only worth asserting if
 * the installation actually happened: a hand-written lockfile entry proves the
 * fixture agrees with itself, not that a shown extension reports the source
 * and version it was installed from. So the Registry here is the real
 * file-backed layout the production local client reads, the resolution is
 * `@agentxm/extension-resolution`'s, and the installation is the
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

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { strToU8, zipSync } from "fflate";

import { AgentPresenceProbeLive } from "@agentxm/agent-integration/live";
import {
  PackManager,
  SkillManager,
  type ExtensionManagerFailure,
} from "@agentxm/extension-materialization";
import { buildInstallOperation } from "@agentxm/workspace-reconciliation";
import { PackManagerLive, SkillManagerLive } from "@agentxm/extension-materialization/live";
import {
  decideNamedRegistryVersion,
  makeConfiguredReleaseAgeEvaluation,
  namedRegistryCandidates,
  ReleaseAgePosture,
  resolveConfiguredPack,
  resolveConfiguredSkill,
  resolveVersionEntryWithReleaseAge,
} from "@agentxm/extension-resolution";
import { AxmSkillCandidateGateLive } from "@agentxm/extension-resolution/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { RegistryResolutionPolicy } from "@agentxm/extension-sources";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { CredentialStore } from "@agentxm/registry-auth";
import { CredentialStoreTest } from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { StepFailure } from "@agentxm/workspace-operations";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-projection/live";
import { ConfiguredAgentOutcomesProviderTest } from "@agentxm/workspace-state/testing";
import { layer as workspaceStateLayer } from "@agentxm/workspace-state/live";

/** The owner every fixture Registry publishes under. */
const OWNER = "@acme";

/**
 * Publication instants predate the deterministic minimum release age by
 * decades, so every published version is immediately eligible for selection
 * and release-age policy never decides the outcome of an inspection example.
 */
const PUBLISHED_AT = "1960-01-01T00:00:00Z";

/**
 * ZIP stores a local-time DOS timestamp and admits only 1980-2099, so a
 * fixture archive needs a fixed instant that lands inside that window in every
 * timezone. Midsummer 1980 UTC is more than a day from either boundary, so the
 * encoded year is 1980 wherever the suite runs. (`1980-07-01T00:00:00Z`.)
 */
const ARCHIVE_MTIME = 331_257_600_000;

/** One published version of a fixture skill. */
export interface PublishedSkillVersion {
  readonly version: string;
  /** Body text of the skill document, so versions are observably distinct. */
  readonly body: string;
}

/** One published version of a fixture pack. */
export interface PublishedPackVersion {
  readonly version: string;
  /** Pack membership, as the manifest declares it. */
  readonly dependencies?: Readonly<Record<string, string>>;
}

export interface FileRegistry {
  /** Absolute Registry root directory. */
  readonly root: string;
  /** The settings `sources` entry that names this Registry. */
  readonly source: {
    readonly name: string;
    readonly type: "registry";
    readonly location: string;
  };
  /** Publishes the complete version list for one skill. */
  readonly publishSkill: (name: string, versions: ReadonlyArray<PublishedSkillVersion>) => void;
  /** Publishes the complete version list for one pack. */
  readonly publishPack: (name: string, versions: ReadonlyArray<PublishedPackVersion>) => void;
  readonly cleanup: () => void;
}

const versionParts = (version: string): ReadonlyArray<number> =>
  (version.split("-")[0] ?? version).split(".").map((part) => Number.parseInt(part, 10));

/** The Registry index lists versions newest-first; callers may pass any order. */
const newestFirst = <T extends { readonly version: string }>(
  entries: ReadonlyArray<T>,
): ReadonlyArray<T> =>
  [...entries].sort((left, right) => {
    const a = versionParts(left.version);
    const b = versionParts(right.version);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const difference = (b[index] ?? 0) - (a[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });

/**
 * A Registry on disk in the layout the production local client reads: a
 * per-extension index beside version archives with real integrity hashes.
 */
export const makeFileRegistry = (sourceName = "agentxm"): FileRegistry => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-inspection-reg-")));
  const writeArchive = (
    directory: string,
    version: string,
    entries: Readonly<Record<string, string>>,
  ): Uint8Array => {
    fs.mkdirSync(directory, { recursive: true });
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([relative, content]) => [relative, strToU8(content)]),
      ),
      { mtime: ARCHIVE_MTIME },
    );
    fs.writeFileSync(nodePath.join(directory, `${version}.zip`), archive);
    return archive;
  };
  /**
   * Publish every version of one extension: an archive per version beside the
   * index that lists them, each entry carrying the archive's real hash.
   */
  const publish = (
    type: "skill" | "pack",
    plural: string,
    name: string,
    versions: ReadonlyArray<{
      readonly version: string;
      readonly files: Readonly<Record<string, string>>;
    }>,
  ): void => {
    const directory = nodePath.join(root, "extensions", OWNER, plural, name);
    const entries = versions.map(({ version, files }) => {
      const archive = writeArchive(directory, version, files);
      return {
        version,
        published: PUBLISHED_AT,
        integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      };
    });
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      nodePath.join(directory, "index.json"),
      `${JSON.stringify(
        {
          owner: OWNER,
          type,
          name,
          publisherBindingId: "hbnd_inspection_fixture",
          deprecation: null,
          versions: newestFirst(entries),
        },
        null,
        2,
      )}\n`,
    );
  };

  return {
    root,
    source: { name: sourceName, type: "registry", location: pathToFileURL(root).href },
    publishSkill: (name, versions) => {
      publish(
        "skill",
        "skills",
        name,
        versions.map(({ version, body }) => ({
          version,
          files: {
            "skill.json": `${JSON.stringify(
              { owner: OWNER, type: "skill", name, version, description: `The ${name} skill.` },
              null,
              2,
            )}\n`,
            "src/SKILL.md": `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n\n${body}\n`,
          },
        })),
      );
    },
    publishPack: (name, versions) => {
      publish(
        "pack",
        "packs",
        name,
        versions.map(({ version, dependencies }) => ({
          version,
          files: {
            "pack.json": `${JSON.stringify(
              {
                owner: OWNER,
                type: "pack",
                name,
                version,
                description: `The ${name} pack.`,
                dependencies: dependencies ?? {},
              },
              null,
              2,
            )}\n`,
          },
        })),
      );
    },
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

/** Registry version policy the production managers carry. */
const RegistryResolutionPolicyTest = Layer.succeed(RegistryResolutionPolicy, {
  selectVersion: resolveVersionEntryWithReleaseAge,
  decideNamedVersion: decideNamedRegistryVersion,
  namedCandidates: namedRegistryCandidates,
});

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
  const platform = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);
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
    Layer.mergeAll(AxmSkillCandidateGateLive, RegistryResolutionPolicyTest),
    projection,
  );
  const sources = Layer.provideMerge(SourceHostProvidersLive, policy);
  const managers = Layer.provideMerge(Layer.mergeAll(SkillManagerLive, PackManagerLive), sources);
  const composed = Layer.provideMerge(ConfiguredAgentOutcomesProviderTest, managers);

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
