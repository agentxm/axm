/**
 * Restoring a Pack's accepted members whose canonical trees are missing
 * fetches each accepted Git commit once per member expansion, however many
 * members it holds; every member still checks its own accepted tree against
 * that fetch, and different commits are fetched separately.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { fromFileLocation } from "@agentxm/host-primitives";

import {
  SourceHostProviders,
  SourceNotResolvable,
  createGitSourceHostProvider,
  type SourceHostProvidersService,
} from "../sources/index.js";
import {
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type Lockfile,
} from "../workspace-state/index.js";
import {
  WorkspaceReadTest,
  exactVersion,
  extensionName,
  handle,
  treeIntegrityOfSync,
} from "../workspace-state/testing.js";
import { decodeVersionRangeSync } from "@agentxm/extension-model/unstable/version-constraints";
import { acceptedPackDependencyResolver } from "./accepted-pack-dependency-resolver.js";
import { resolvePackDependenciesWithReleaseAge } from "./pack-dependency-resolution.js";

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  execFileSync("git", ["-c", "user.name=AXM", "-c", "user.email=axm@example.test", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const writeSkill = (repository: string, name: string, description = `The ${name} skill`) => {
  write(
    path.join(repository, "skills", name, "skill.json"),
    `${JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" })}\n`,
  );
  write(
    path.join(repository, "skills", name, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n`,
  );
};

/** Members decide nothing by release age here. */
const evaluation = {
  minimumReleaseAge: Duration.hours(24),
  evaluatedAt: DateTime.makeUnsafe("2026-08-12T00:00:00Z"),
  mode: "enforce" as const,
};

const gitProvider = createGitSourceHostProvider();

/** Source providers whose fetch is the production Git fetch over the layer's filesystem. */
const gitFetching = Layer.effect(
  SourceHostProviders,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const service: SourceHostProvidersService = {
      resolveNamedRegistry: () =>
        Effect.fail(new SourceNotResolvable({ category: "not_found", detail: "no registry" })),
      find: () => Effect.succeed([]),
      fetch: (ref) =>
        ref.refType === "git-hosted" && ref.source.type === "git"
          ? gitProvider
              .fetch(ref.source, ref)
              .pipe(
                Effect.provideService(FileSystem.FileSystem, fileSystem),
                Effect.provideService(Path.Path, pathService),
              )
          : Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
      acquireForTransition: () => Effect.die("Transition acquisition is not used"),
      cloneUrl: () => Option.none(),
      origin: () => "fixture",
    };
    return service;
  }),
);

interface AcceptedMember {
  readonly name: string;
  readonly commit: string;
  readonly tree: string;
  readonly revision?: string;
}

/** A Pack member's desired row, inheriting the Pack's Git source view. */
const desiredMember = (url: URL, member: AcceptedMember): DesiredExtensionNode => {
  const origins = [
    {
      type: "pack",
      pack: { authority: "git", locator: url.href, fqn: "@acme/packs/starter" },
      manifestPath: "agent_extensions/packs/starter/pack.json",
      source: `@acme/skills/${member.name}`,
      sourceAuthority: {
        authority: "git",
        url,
        revision: member.revision ?? "HEAD",
        root: Option.none(),
      },
      constraint: "*",
      enabled: true,
    },
  ] as const;
  return {
    type: "skill",
    name: member.name,
    enabled: true,
    source: `@acme/skills/${member.name}@*`,
    identity: {
      authority: "registry",
      fqn: `@acme/skills/${member.name}`,
      registry: { sourceName: undefined, endpoint: undefined },
    },
    origins,
    constraint: UNCONSTRAINED_DESIRED_NODE,
  };
};

const packOf = (url: URL, names: ReadonlyArray<string>): PackRef => ({
  type: "pack",
  refType: "git-hosted",
  source: { type: "git", url, ref: Option.none(), subPath: Option.none() } satisfies GitSource,
  owner: decodeHandleSync("@acme"),
  name: extensionName("starter"),
  version: exactVersion("1.0.0"),
  location: url.href,
  gitCommitSha: "0".repeat(40),
  gitTreeSha: "0".repeat(40),
  sourcePath: "packs/starter",
  pack: {
    name: extensionName("starter"),
    dependencies: Object.fromEntries(
      names.map((name) => [`@acme/skills/${name}`, decodeVersionRangeSync("*")]),
    ),
  },
  sourceMembers: [],
});

describe("accepted Pack member restoration", () => {
  let root: string;
  let repository: string;
  let url: URL;
  let workspace: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-accepted-members-")));
    repository = path.join(root, "repository");
    workspace = path.join(root, "workspace");
    fs.mkdirSync(repository, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    git(repository, "init", "--quiet", "--initial-branch=main");
    writeSkill(repository, "alpha");
    writeSkill(repository, "beta");
    git(repository, "add", ".");
    git(repository, "commit", "--quiet", "-m", "members");
    url = pathToFileURL(repository);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const accepted = (name: string, revision?: string): AcceptedMember => ({
    name,
    commit: git(repository, "rev-parse", revision ?? "HEAD"),
    tree: git(repository, "rev-parse", `${revision ?? "HEAD"}:skills/${name}`),
    ...(revision === undefined ? {} : { revision }),
  });

  const lockfileOf = (members: ReadonlyArray<AcceptedMember>): Lockfile => ({
    lockfileVersion: 1,
    skills: Object.fromEntries(
      members.map((member) => [
        member.name,
        {
          source: {
            type: "git" as const,
            url,
            path: `skills/${member.name}`,
            ...(member.revision === undefined ? {} : { revision: member.revision }),
          },
          identity: { owner: handle("@acme"), name: extensionName(member.name) },
          resolved: { commit: member.commit, tree: member.tree },
          treeIntegrity: treeIntegrityOfSync(path.join(repository, "skills", member.name)),
        },
      ]),
    ),
  });

  /**
   * Run `run` over accepted state for `members`, counting the commit fetches
   * made after setup.
   */
  const restoring = <A, E, R>(
    members: ReadonlyArray<AcceptedMember>,
    run: (sources: SourceHostProvidersService) => Effect.Effect<A, E, R>,
    lockfile: Lockfile = lockfileOf(members),
  ) =>
    Effect.gen(function* () {
      const recording: FileSystemRecording = yield* FileSystemRecorder;
      const sources = yield* SourceHostProviders;
      recording.reset();
      const outcome = yield* Effect.result(run(sources));
      const fetches = recording
        .calls({ method: "makeTempDirectory" })
        .filter((call) => path.basename(call.path).startsWith("axm-source-commit-")).length;
      return { outcome, fetches };
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          Layer.mergeAll(
            gitFetching,
            WorkspaceReadTest({
              baseDir: workspace,
              lockfile,
              graph: {
                nodes: members.map((member) => desiredMember(url, member)),
                mcpSourceClosures: [],
                problems: [],
                packMembership: [],
              },
            }),
          ),
          Layer.mergeAll(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer),
        ),
      ),
    );

  const expand = (names: ReadonlyArray<string>) => (sources: SourceHostProvidersService) =>
    resolvePackDependenciesWithReleaseAge(
      packOf(url, names),
      sources,
      evaluation,
      undefined,
      undefined,
      acceptedPackDependencyResolver(),
    ).pipe(Effect.scoped);

  /** Each restored member's location within the directory its commit was fetched into. */
  const restoredLocations = (refs: ReadonlyArray<ExtensionRef>): ReadonlyArray<string> =>
    refs.map((ref) =>
      ref.refType === "git-hosted"
        ? path.relative(
            path.dirname(path.dirname(fromFileLocation(ref.location))),
            fromFileLocation(ref.location),
          )
        : ref.refType,
    );

  it.effect("fetches one accepted commit once for every member a Pack restores from it", () =>
    Effect.gen(function* () {
      const { outcome, fetches } = yield* restoring(
        [accepted("alpha"), accepted("beta")],
        expand(["alpha", "beta"]),
      );

      expect(outcome._tag).toBe("Success");
      expect(
        restoredLocations(
          outcome._tag === "Success" && outcome.success.kind === "selected"
            ? outcome.success.dependencies.dependencyRefs
            : [],
        ),
      ).toStrictEqual([path.join("skills", "alpha"), path.join("skills", "beta")]);
      expect(fetches).toBe(1);
    }),
  );

  it.effect("refuses the member whose accepted tree the shared fetch does not hold", () =>
    Effect.gen(function* () {
      const alpha = accepted("alpha");
      const { outcome, fetches } = yield* restoring(
        [alpha, { ...accepted("beta"), tree: alpha.tree }],
        expand(["alpha", "beta"]),
      );

      expect(outcome).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "ExtensionResolutionFailed",
          detail: "Cannot restore accepted skill beta: its recorded source content is unavailable",
        },
      });
      expect(fetches).toBe(1);
    }),
  );

  it.effect("fetches different accepted commits separately", () =>
    Effect.gen(function* () {
      git(repository, "checkout", "--quiet", "-b", "other");
      writeSkill(repository, "beta", "The revised beta skill");
      git(repository, "commit", "--quiet", "-am", "revise beta");
      const { outcome, fetches } = yield* restoring(
        [accepted("alpha", "main"), accepted("beta", "other")],
        expand(["alpha", "beta"]),
        {
          ...lockfileOf([accepted("alpha", "main"), accepted("beta", "other")]),
        },
      );

      expect(outcome._tag).toBe("Success");
      expect(fetches).toBe(2);
    }),
  );

  it.effect("fetches for each member restored outside one Pack expansion", () =>
    Effect.gen(function* () {
      const resolve = acceptedPackDependencyResolver();
      const member = (name: string) =>
        resolve({
          owner: decodeHandleSync("@acme"),
          type: "skill",
          name: extensionName(name),
          constraint: decodeVersionRangeSync("*"),
          root: "@acme/packs/starter",
        });
      const { outcome, fetches } = yield* restoring([accepted("alpha"), accepted("beta")], () =>
        Effect.all([member("alpha"), member("beta")]).pipe(Effect.scoped),
      );

      expect(outcome._tag).toBe("Success");
      expect(fetches).toBe(2);
    }),
  );

  it.effect("fetches nothing for a Pack whose members have no accepted rows", () =>
    Effect.gen(function* () {
      const { outcome, fetches } = yield* restoring([], expand(["alpha"]), {
        lockfileVersion: 1,
        skills: {},
      });

      expect(outcome._tag).toBe("Failure");
      expect(fetches).toBe(0);
    }),
  );
});
