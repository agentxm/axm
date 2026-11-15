import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import {
  TreeIntegritySchema,
  LOCKFILE_VERSION,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import { CodingAgentRepositoryLive } from "@agentxm/workspace-kernel/projection/live";
import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
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
import { handle, RegistryClientFactoryTestLive } from "../test-helpers.js";
import {
  assessExtensionListItems,
  type AssessedExtensionListItem,
  type ExtensionListFilter,
} from "./assessment.js";

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);

/**
 * A served repository whose `main` holds the skills `alpha`, `beta` and
 * `gamma` under `vendor/`, and whose branch `other` changes `alpha`.
 */
const serveSkillRepository = Effect.acquireRelease(
  Effect.promise(async () => {
    const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-list-git-")));
    const source = nodePath.join(root, "source");
    fs.mkdirSync(source);
    writeLocalSkillPackage(source, { name: "alpha" });
    writeLocalSkillPackage(source, { name: "beta" });
    writeLocalSkillPackage(source, { name: "gamma" });
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
    writeLocalSkillPackage(source, { name: "alpha", description: "Changed alpha." });
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "other"]);
    const other = revision("other");
    git(["checkout", "--quiet", "main"]);
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

type ServedSkillRepository = Effect.Success<typeof serveSkillRepository>;

interface AcceptedGitSkill {
  readonly name: "alpha" | "beta" | "gamma";
  readonly revision?: string;
  readonly resolvedFrom: "main" | "other";
}

const acceptedEntry = (repository: ServedSkillRepository, accepted: AcceptedGitSkill) => {
  const resolved = repository[accepted.resolvedFrom];
  return {
    source: {
      type: "git",
      url: new URL(repository.url),
      ...(accepted.revision === undefined ? {} : { revision: accepted.revision }),
      path: `vendor/${accepted.name}`,
    },
    identity: { owner: handle("@acme"), name: decodeExtensionNameSync(accepted.name) },
    resolved: { commit: resolved.commit, tree: resolved.tree(accepted.name) },
    treeIntegrity,
  } satisfies LockEntry;
};

/**
 * Assess the accepted Git skills against the served repository through the
 * live source providers, counting the scratch checkouts their Git discovery
 * creates.
 */
const assessGitSkills = (
  entries: Readonly<Record<string, AcceptedGitSkill>>,
  filter: Exclude<ExtensionListFilter, "all"> = "outdated",
) =>
  Effect.gen(function* () {
    const repository = yield* serveSkillRepository;
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const workspace = WorkspaceCatalogLive.pipe(
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provideMerge(
        WorkspaceReadTest({
          baseDir: "/tmp",
          runtimeDir: "/tmp/.axm",
          settings: { agents: ["claude-code"] },
          lockfile: {
            lockfileVersion: LOCKFILE_VERSION,
            skills: Object.fromEntries(
              Object.entries(entries).map(([installed, accepted]) => [
                installed,
                acceptedEntry(repository, accepted),
              ]),
            ),
          },
        }),
      ),
      Layer.provideMerge(RegistryClientFactoryTestLive()),
      Layer.provide(NodeServices.layer),
    );
    const sources = SourceHostProvidersLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          workspace,
          AxmSkillCandidateGateLive,
          RegistryResolutionPolicyLive,
          Layer.succeed(
            ArtifactHttpClient,
            HttpClient.make(() => Effect.die("Unexpected HTTP artifact request")),
          ),
          Layer.succeed(FileSystem.FileSystem, recorder.fileSystem),
          Layer.succeed(Path.Path, yield* Path.Path),
        ),
      ),
    );
    const items = Object.keys(entries).map((installed): AssessedExtensionListItem => ({
      ref: `skills/${installed}`,
      type: "skill",
      name: installed,
      management: "configured",
      installed: true,
      enabled: true,
      assessment: { state: "not-checked" },
    }));
    const assessed = yield* Effect.scoped(
      Effect.gen(function* () {
        recorder.recording.reset();
        return yield* assessExtensionListItems(items, filter);
      }),
    ).pipe(
      Effect.provide(Layer.mergeAll(workspace, sources, FetchHttpClient.layer, NodeServices.layer)),
    );
    return {
      repository,
      states: Object.fromEntries(
        assessed.map((item) => [
          item.name,
          item.assessment.reason === undefined
            ? item.assessment.state
            : `${item.assessment.state}: ${item.assessment.reason}`,
        ]),
      ),
      checkouts: recorder.recording
        .calls({ method: "makeTempDirectory" })
        .filter((call) => nodePath.basename(call.path).startsWith("axm-source-discovery-")).length,
    };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("list --outdated Git checkouts", () => {
  it.effect("checks out one Git URL and revision once for every entry it assesses", () =>
    Effect.gen(function* () {
      const outcome = yield* assessGitSkills({
        alpha: { name: "alpha", resolvedFrom: "main" },
        beta: { name: "beta", resolvedFrom: "main" },
      });
      expect(outcome.states).toEqual({ alpha: "current", beta: "current" });
      expect(outcome.checkouts).toBe(1);
    }),
  );

  it.effect("checks out each revision of one repository separately", () =>
    Effect.gen(function* () {
      const outcome = yield* assessGitSkills({
        alpha: { name: "alpha", revision: "other", resolvedFrom: "main" },
        beta: { name: "beta", revision: "main", resolvedFrom: "main" },
      });
      expect(outcome.states).toEqual({ alpha: "changed", beta: "current" });
      expect(outcome.checkouts).toBe(2);
    }),
  );

  it.effect("attempts a failing checkout again for each entry that needs it", () =>
    Effect.gen(function* () {
      const outcome = yield* assessGitSkills({
        alpha: { name: "alpha", revision: "missing", resolvedFrom: "main" },
        beta: { name: "beta", revision: "missing", resolvedFrom: "main" },
        gamma: { name: "gamma", resolvedFrom: "main" },
      });
      expect(outcome.states["gamma"]).toBe("current");
      expect(outcome.states["alpha"]).toMatch(/^unknown: .*Remote branch missing not found/s);
      expect(outcome.states["beta"]).toMatch(/^unknown: .*Remote branch missing not found/s);
      // Each reason names the scratch directory of that entry's own attempt.
      expect(outcome.states["beta"]).not.toBe(outcome.states["alpha"]);
      expect(outcome.checkouts).toBe(3);
    }),
  );

  it.effect("does no Git work for a filter that does not compare revisions", () =>
    Effect.gen(function* () {
      const outcome = yield* assessGitSkills(
        {
          alpha: { name: "alpha", resolvedFrom: "main" },
          beta: { name: "beta", resolvedFrom: "main" },
        },
        "deprecated",
      );
      expect(outcome.states).toEqual({ alpha: "not-applicable", beta: "not-applicable" });
      expect(outcome.checkouts).toBe(0);
    }),
  );
});
