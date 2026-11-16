/**
 * A repeat install naming several packages from one source restores each
 * accepted package whose canonical tree is missing. Packages accepted at one
 * Git commit, or from one digest-pinned HTTP artifact, retrieve that content
 * once per request; each still checks and selects its own package within it.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { zipSync } from "fflate";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  LOCKFILE_VERSION,
  TreeIntegritySchema,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import { CodingAgentRepositoryLive } from "@agentxm/workspace-kernel/projection/live";
import {
  ArtifactHttpClient,
  httpArtifactDigest,
  resolveSource,
} from "@agentxm/workspace-kernel/sources";
import {
  SourceHostProvidersLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-kernel/sources/live";
import {
  AxmSkillCandidateGateLive,
  RegistryResolutionPolicyLive,
} from "@agentxm/workspace-kernel/resolution/live";
import { serveBareRepository } from "../../testing/git-repositories.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { acceptedInstallRequestRefs } from "./accepted-request.js";

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);

const RegistryClientFactoryUnused = Layer.succeed(RegistryClientFactory, {
  authorityContext: () => Effect.die("Unexpected Registry authority lookup"),
  withReadPhase: (effect) => effect,
  invalidateReadPhase: Effect.void,
  forEndpoint: () => Effect.die("Unexpected Registry client"),
  lifecycle: () => Effect.die("Unexpected Registry lifecycle"),
  wire: () => Effect.die("Unexpected Registry authentication"),
});

/**
 * A served repository whose `main` holds the skills `alpha` and `beta` under
 * `vendor/`, and whose branch `other` changes `beta`.
 */
const serveSkillRepository = Effect.acquireRelease(
  Effect.promise(async () => {
    const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-accepted-git-")));
    const source = nodePath.join(root, "source");
    fs.mkdirSync(source);
    writeLocalSkillPackage(source, { name: "alpha" });
    writeLocalSkillPackage(source, { name: "beta" });
    const git = (args: ReadonlyArray<string>): string =>
      execFileSync(
        "git",
        ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
        { cwd: source, encoding: "utf8" },
      ).trim();
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "main"]);
    const revision = (ref: string) => ({
      commit: git(["rev-parse", ref]),
      tree: (name: string) => git(["rev-parse", `${ref}:vendor/${name}`]),
    });
    const main = revision("main");
    git(["checkout", "--quiet", "-b", "other"]);
    writeLocalSkillPackage(source, { name: "beta", description: "Changed beta." });
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "other"]);
    const other = revision("other");
    const served = await serveBareRepository({ root, source, name: "extensions" });
    return {
      url: served.url,
      main,
      other,
      cleanup: () => {
        served.stop();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  }),
  (repository) => Effect.sync(repository.cleanup),
);

/** A settings row for `name` configured from `source`, with no canonical copy. */
const desiredSkill = (name: string, source: string): DesiredExtensionNode => ({
  type: "skill",
  name,
  identity: { authority: "git", locator: source, fqn: `@acme/skills/${name}` },
  source,
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [{ type: "settings", source, enabled: true }],
});

/**
 * Restore `names` from `source` through the live source providers over the
 * accepted `entries`, counting the scratch directories and artifact requests
 * the restoration makes.
 */
const restore = (args: {
  readonly source: string;
  readonly names: ReadonlyArray<string>;
  readonly entries: Readonly<Record<string, LockEntry>>;
  readonly artifacts?: Readonly<Record<string, Uint8Array>>;
}) =>
  Effect.gen(function* () {
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const workspaceRoot = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: "axm-accepted-request-",
    });
    const requests: Array<string> = [];
    const artifactClient = HttpClient.make((request) =>
      Effect.sync(() => {
        requests.push(request.url);
        const body = Object.entries(args.artifacts ?? {}).find(([url]) => url === request.url)?.[1];
        return HttpClientResponse.fromWeb(
          request,
          body === undefined ? new Response("missing", { status: 404 }) : new Response(body),
        );
      }),
    );
    const workspace = WorkspaceCatalogLive.pipe(
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provideMerge(
        WorkspaceReadTest({
          baseDir: workspaceRoot,
          settings: { agents: ["claude-code"] },
          lockfile: { lockfileVersion: LOCKFILE_VERSION, skills: { ...args.entries } },
          graph: {
            nodes: args.names.map((name) => desiredSkill(name, args.source)),
            mcpSourceClosures: [],
            problems: [],
            packMembership: [],
          },
        }),
      ),
      Layer.provideMerge(RegistryClientFactoryUnused),
      Layer.provide(NodeServices.layer),
    );
    const sources = SourceHostProvidersLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          workspace,
          AxmSkillCandidateGateLive,
          RegistryResolutionPolicyLive,
          Layer.succeed(ArtifactHttpClient, artifactClient),
          Layer.succeed(FileSystem.FileSystem, recorder.fileSystem),
          Layer.succeed(Path.Path, yield* Path.Path),
        ),
      ),
    );
    const outcome = yield* Effect.scoped(
      Effect.gen(function* () {
        const source = yield* resolveSource(args.source, { expectedType: "skill" });
        recorder.recording.reset();
        requests.length = 0;
        const refs = yield* acceptedInstallRequestRefs({
          type: "skill",
          source,
          names: args.names,
          versionRange: Option.none(),
        });
        return refs.map((ref) => ref.name);
      }),
    ).pipe(Effect.result, Effect.provide(Layer.mergeAll(workspace, sources, NodeServices.layer)));
    const scratch = (prefix: string) =>
      recorder.recording
        .calls({ method: "makeTempDirectory" })
        .filter((call) => nodePath.basename(call.path).startsWith(prefix)).length;
    return {
      outcome,
      commitFetches: scratch("axm-source-commit-"),
      artifactAcquisitions: scratch("axm-http-package-"),
      requests: [...requests],
    };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const gitEntry = (
  url: string,
  name: string,
  resolved: { readonly commit: string; readonly tree: (name: string) => string },
  revision?: string,
): LockEntry => ({
  source: {
    type: "git",
    url: new URL(url),
    ...(revision === undefined ? {} : { revision }),
    path: `vendor/${name}`,
  },
  identity: { owner: decodeHandleSync("@acme"), name: decodeExtensionNameSync(name) },
  resolved: { commit: resolved.commit, tree: resolved.tree(name) },
  treeIntegrity,
});

describe("repeat install restoring accepted packages", () => {
  it.effect("fetches one accepted Git commit once for every package a request names", () =>
    Effect.gen(function* () {
      const repository = yield* serveSkillRepository;
      const outcome = yield* restore({
        source: repository.url,
        names: ["alpha", "beta"],
        entries: {
          alpha: gitEntry(repository.url, "alpha", repository.main),
          beta: gitEntry(repository.url, "beta", repository.main),
        },
      });

      expect(outcome.outcome).toMatchObject({ _tag: "Success", success: ["alpha", "beta"] });
      expect(outcome.commitFetches).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("fetches different accepted commits separately", () =>
    Effect.gen(function* () {
      const repository = yield* serveSkillRepository;
      const outcome = yield* restore({
        source: repository.url,
        names: ["alpha", "beta"],
        entries: {
          alpha: gitEntry(repository.url, "alpha", repository.main),
          beta: gitEntry(repository.url, "beta", repository.other),
        },
      });

      expect(outcome.outcome).toMatchObject({ _tag: "Success", success: ["alpha", "beta"] });
      expect(outcome.commitFetches).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses the package whose accepted tree the shared commit does not hold", () =>
    Effect.gen(function* () {
      const repository = yield* serveSkillRepository;
      const outcome = yield* restore({
        source: repository.url,
        names: ["alpha", "beta"],
        entries: {
          alpha: gitEntry(repository.url, "alpha", repository.main),
          beta: gitEntry(repository.url, "beta", {
            commit: repository.main.commit,
            tree: repository.other.tree,
          }),
        },
      });

      expect(outcome.outcome).toMatchObject({
        _tag: "Failure",
        failure: {
          detail: expect.stringContaining(
            "Cannot restore accepted skill beta: its recorded source content is unavailable",
          ),
        },
      });
      expect(outcome.commitFetches).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("downloads one accepted HTTP artifact once for every package a request names", () =>
    Effect.gen(function* () {
      const skill = (name: string) =>
        new TextEncoder().encode(`---\nname: ${name}\ndescription: The ${name} skill\n---\n`);
      const archive = zipSync({ "alpha/SKILL.md": skill("alpha"), "beta/SKILL.md": skill("beta") });
      const url = "https://example.test/skills.zip";
      const httpEntry = (name: string): LockEntry => ({
        source: { type: "http", url: new URL(url), kind: "archive", path: name, portable: true },
        identity: { name: decodeExtensionNameSync(name) },
        resolved: { format: "zip", url: new URL(url), digest: httpArtifactDigest(archive) },
        treeIntegrity,
      });
      const outcome = yield* restore({
        source: url,
        names: ["alpha", "beta"],
        entries: { alpha: httpEntry("alpha"), beta: httpEntry("beta") },
        artifacts: { [url]: archive },
      });

      expect(outcome.outcome).toMatchObject({ _tag: "Success", success: ["alpha", "beta"] });
      expect(outcome.requests).toStrictEqual([url]);
      expect(outcome.artifactAcquisitions).toBe(1);
    }),
  );

  it.effect("fetches nothing for a request that selects no package by name", () =>
    Effect.gen(function* () {
      const repository = yield* serveSkillRepository;
      const outcome = yield* restore({
        source: repository.url,
        names: [],
        entries: { alpha: gitEntry(repository.url, "alpha", repository.main) },
      });

      expect(outcome.outcome).toMatchObject({ _tag: "Success", success: [] });
      expect(outcome.commitFetches).toBe(0);
    }).pipe(Effect.scoped),
  );
});
