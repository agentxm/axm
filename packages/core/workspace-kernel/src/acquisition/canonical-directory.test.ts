import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import * as nodeFs from "node:fs";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import type { WorkFact } from "@agentxm/host-primitives/work-observation";
import {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  materializeExternalPackageWithTreeIntegrity,
  replaceCanonicalDirectory,
  reusableCanonicalTree,
} from "./canonical-directory.js";
import { workObservations } from "../locations/testing.js";
import * as Data from "effect/Data";
import {
  computeMaterializedTreeIntegrity,
  type LockEntry,
  type TreeIntegrity,
} from "../workspace-state/index.js";
import { exactVersion, extensionName, handle } from "../workspace-state/testing.js";

/** Whether the temporary directory folds case, so a case-fold collision cannot be created there. */
const tmpdirFoldsCase = ((): boolean => {
  const probe = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-case-probe-"));
  try {
    nodeFs.writeFileSync(nodePath.join(probe, "probe"), "");
    return nodeFs.existsSync(nodePath.join(probe, "PROBE"));
  } finally {
    nodeFs.rmSync(probe, { recursive: true, force: true });
  }
})();

class InjectedFailure extends Data.TaggedError("InjectedFailure")<{
  readonly detail: string;
}> {}

const requestedReview = {
  refType: "registry",
  owner: "@acme",
  name: "review",
  version: "1.0.0",
  publisherBindingId: "binding-1",
} as const;

/** The accepted Registry row for `@acme/hooks/review` at the given version and tree. */
const acceptedReview = (version: string, treeIntegrity: TreeIntegrity) =>
  Option.some<LockEntry>({
    source: { type: "registry", url: decodeRegistryEndpointSync("https://registry.agentxm.ai") },
    identity: { owner: handle("@acme"), name: extensionName("review") },
    resolved: {
      version: exactVersion(version),
      integrity: "sha512-archive",
      publisherBindingId: "binding-1",
    },
    treeIntegrity,
  });

describe("package materialization helpers", () => {
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-package-materialization-"));
    workspaceRoot = nodePath.join(tempDir, "workspace");
    nodeFs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect(
    "reuses a complete canonical directory when the lockfile pins the requested version",
    () =>
      run(
        Effect.gen(function* () {
          const installedPath = nodePath.join(
            workspaceRoot,
            ".axm",
            "extensions",
            "@acme",
            "hooks",
            "review",
          );
          yield* replaceCanonicalDirectory({
            baseDir: workspaceRoot,
            canonicalPath: installedPath,
            populate: (stagingPath) =>
              Effect.sync(() => {
                nodeFs.mkdirSync(stagingPath, { recursive: true });
                nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "complete");
              }),
          });

          const accepted = yield* computeMaterializedTreeIntegrity(installedPath);
          const { reusable: reuse } = yield* reusableCanonicalTree({
            canonicalPath: installedPath,
            requested: requestedReview,
            accepted: acceptedReview("1.0.0", accepted),
            force: false,
          });

          expect(reuse).toEqual(Option.some(accepted));
        }),
      ),
  );

  it.effect("re-acquires an edited tree instead of accepting its drift", () =>
    run(
      Effect.gen(function* () {
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "accepted");
        const accepted = yield* computeMaterializedTreeIntegrity(installedPath);
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "edited");

        const { reusable: reuse } = yield* reusableCanonicalTree({
          canonicalPath: installedPath,
          requested: requestedReview,
          accepted: acceptedReview("1.0.0", accepted),
          force: false,
        });

        expect(reuse).toEqual(Option.none());
      }),
    ),
  );

  it.effect("re-materializes when the accepted version is not the requested one", () =>
    run(
      Effect.gen(function* () {
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "accepted");
        const accepted = yield* computeMaterializedTreeIntegrity(installedPath);

        const { reusable: reuse } = yield* reusableCanonicalTree({
          canonicalPath: installedPath,
          requested: requestedReview,
          accepted: acceptedReview("0.9.0", accepted),
          force: false,
        });

        expect(reuse).toEqual(Option.none());
      }),
    ),
  );

  it.effect("never reuses a tree when re-materialization is forced", () =>
    run(
      Effect.gen(function* () {
        const installedPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        nodeFs.mkdirSync(installedPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(installedPath, "review.md"), "accepted");
        const accepted = yield* computeMaterializedTreeIntegrity(installedPath);

        const { reusable: reuse } = yield* reusableCanonicalTree({
          canonicalPath: installedPath,
          requested: requestedReview,
          accepted: acceptedReview("1.0.0", accepted),
          force: true,
        });

        expect(reuse).toEqual(Option.none());
      }),
    ),
  );

  it.effect("keeps the prior complete tree visible while staging and after staging fails", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                nodeFs.mkdirSync(stagingPath, { recursive: true });
                nodeFs.writeFileSync(nodePath.join(stagingPath, "partial.txt"), "partial");
              });
              expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
                "prior",
              );
              return yield* new InjectedFailure({ detail: "injected staging failure" });
            }),
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "InjectedFailure",
          detail: "injected staging failure",
        });
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "partial.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("keeps the prior complete tree when staged package validation fails", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });

        const failure = yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "invalid next");
            }),
          validate: (stagingPath) =>
            Effect.gen(function* () {
              expect(nodeFs.readFileSync(nodePath.join(stagingPath, "review.md"), "utf8")).toBe(
                "invalid next",
              );
              return yield* new InjectedFailure({ detail: "injected validation failure" });
            }),
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "InjectedFailure",
          detail: "injected validation failure",
        });
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(canonicalMaterializationPaths(canonicalPath).stagingPath)).toBe(
          false,
        );
      }),
    ),
  );

  it.effect("recovers a complete prior tree after interruption during replacement", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.renameSync(canonicalPath, paths.backupPath);
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");

        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
                "prior",
              );
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "next");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe("next");
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("recovers the prior tree before deciding reuse after a replacement interruption", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(stagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "prior");
            }),
        });
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.renameSync(canonicalPath, paths.backupPath);
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");

        const prior = yield* computeMaterializedTreeIntegrity(paths.backupPath);
        const { reusable: reuse } = yield* reusableCanonicalTree({
          canonicalPath,
          requested: requestedReview,
          accepted: acceptedReview("1.0.0", prior),
          force: false,
        });

        expect(reuse).toEqual(Option.some(prior));
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "prior",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("discards a stale staging tree before the next replacement", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        const { stagingPath } = canonicalMaterializationPaths(canonicalPath);
        nodeFs.mkdirSync(stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(stagingPath, "stale.txt"), "stale");

        yield* replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (freshStagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.existsSync(nodePath.join(freshStagingPath, "stale.txt"))).toBe(false);
              nodeFs.mkdirSync(freshStagingPath, { recursive: true });
              nodeFs.writeFileSync(nodePath.join(freshStagingPath, "review.md"), "fresh");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
          "fresh",
        );
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "stale.txt"))).toBe(false);
      }),
    ),
  );

  it.effect("publishes a create-only package after discarding stale staging", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "rules",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);
        const unrelatedSibling = `${canonicalPath}.notes`;
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial");
        nodeFs.mkdirSync(unrelatedSibling, { recursive: true });

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Rule",
          requiredFiles: ["rule.json", "src/RULE.md"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              expect(nodeFs.existsSync(nodePath.join(stagingPath, "partial.txt"))).toBe(false);
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "rule.json"), "{}\n");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "RULE.md"), "complete\n");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "RULE.md"), "utf8")).toBe(
          "complete\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
        expect(nodeFs.existsSync(unrelatedSibling)).toBe(true);
      }),
    ),
  );

  it.effect("restores interrupted create state before reporting a collision", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "skills",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);
        nodeFs.mkdirSync(paths.backupPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.backupPath, "skill.json"), "prior\n");
        nodeFs.mkdirSync(paths.stagingPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(paths.stagingPath, "partial.txt"), "partial\n");

        const failure = yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Skill",
          populate: () => Effect.void,
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("CreateDestinationExists");
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "skill.json"), "utf8")).toBe(
          "prior\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("keeps create-only destinations absent until required files validate", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "hooks",
          "review",
        );
        const paths = canonicalMaterializationPaths(canonicalPath);

        const failure = yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          requiredFiles: ["hook.json", "src/index.ts"],
          populate: (stagingPath) =>
            Effect.sync(() => nodeFs.writeFileSync(nodePath.join(stagingPath, "hook.json"), "{}")),
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("StagedPackageInvalid");
        expect(nodeFs.existsSync(canonicalPath)).toBe(false);
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          requiredFiles: ["hook.json", "src/index.ts"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "hook.json"), "{}");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "index.ts"), "export {};");
            }),
        });

        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "src", "index.ts"))).toBe(true);
      }),
    ),
  );

  it.effect("recovers after hard process death during create-only staging", () =>
    run(
      Effect.gen(function* () {
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "@acme",
          "knowledge",
          "review",
        );
        const fixture = fileURLToPath(
          new URL("./__fixtures__/interrupted-package-create.mjs", import.meta.url),
        );
        const child = spawnSync(process.execPath, [fixture], { cwd: workspaceRoot });
        const paths = canonicalMaterializationPaths(canonicalPath);

        expect(child.signal).toBe("SIGKILL");
        expect(nodeFs.existsSync(canonicalPath)).toBe(false);
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(true);

        yield* createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Knowledge bundle",
          requiredFiles: ["package.json", "src/content.md"],
          populate: (stagingPath) =>
            Effect.sync(() => {
              nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
              nodeFs.writeFileSync(nodePath.join(stagingPath, "package.json"), "{}\n");
              nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "content.md"), "retried\n");
            }),
        });

        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "content.md"), "utf8")).toBe(
          "retried\n",
        );
        expect(nodeFs.existsSync(paths.stagingPath)).toBe(false);
        expect(nodeFs.existsSync(paths.backupPath)).toBe(false);
      }),
    ),
  );

  it.effect("copies an external package into the canonical path", () =>
    run(
      Effect.gen(function* () {
        const sourcePath = nodePath.join(tempDir, "source");
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "external",
          "hooks",
          "audit",
        );
        nodeFs.mkdirSync(nodePath.join(sourcePath, "src"), { recursive: true });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "src", "hook.sh"), "#!/usr/bin/env bash\n");
        nodeFs.mkdirSync(canonicalPath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(canonicalPath, "stale.txt"), "stale");

        const result = yield* materializeExternalPackage({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: pathToFileURL(sourcePath).href,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `failed to copy to ${target}`,
        });

        expect(result).toBe(canonicalPath);
        expect(nodeFs.existsSync(nodePath.join(canonicalPath, "stale.txt"))).toBe(false);
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "src", "hook.sh"), "utf8")).toBe(
          "#!/usr/bin/env bash\n",
        );
      }),
    ),
  );

  it.effect("reuses accepted external canonical content until refresh is forced", () =>
    run(
      Effect.gen(function* () {
        const sourcePath = nodePath.join(tempDir, "source");
        const canonicalPath = nodePath.join(
          workspaceRoot,
          ".axm",
          "extensions",
          "external",
          "skills",
          "review",
        );
        nodeFs.mkdirSync(sourcePath, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "SKILL.md"), "source");
        yield* materializeExternalPackage({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: sourcePath,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `failed to copy to ${target}`,
        });
        nodeFs.writeFileSync(nodePath.join(sourcePath, "SKILL.md"), "changed source");
        const acceptedTree = yield* computeMaterializedTreeIntegrity(canonicalPath);
        const accepted = Option.some<LockEntry>({
          source: { type: "path", path: sourcePath },
          identity: { name: extensionName("review") },
          resolved: { tree: acceptedTree },
          treeIntegrity: acceptedTree,
        });
        const requested = { refType: "local", name: "review" } as const;

        expect(
          (yield* reusableCanonicalTree({ canonicalPath, requested, accepted, force: false }))
            .reusable,
        ).toEqual(Option.some(acceptedTree));
        expect(
          (yield* reusableCanonicalTree({ canonicalPath, requested, accepted, force: true }))
            .reusable,
        ).toEqual(Option.none());
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "SKILL.md"), "utf8")).toBe(
          "source",
        );
      }),
    ),
  );
});

describe("canonical publication work", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let canonicalPath: string;
  let sourcePath: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-canonical-publication-work-"));
    workspaceRoot = nodePath.join(tempDir, "workspace");
    canonicalPath = nodePath.join(workspaceRoot, ".axm", "extensions", "@acme", "hooks", "review");
    sourcePath = nodePath.join(tempDir, "source");
    nodeFs.mkdirSync(sourcePath, { recursive: true });
    nodeFs.writeFileSync(nodePath.join(sourcePath, "review.md"), "next");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeCanonical = (contents: string) => {
    nodeFs.mkdirSync(canonicalPath, { recursive: true });
    nodeFs.writeFileSync(nodePath.join(canonicalPath, "review.md"), contents);
  };

  const treeHashes = (facts: ReadonlyArray<WorkFact>) =>
    facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length;

  /** Run one owner call over a recording filesystem; fixture setup stays outside the counts. */
  const measured = <A, E>(
    owner: Effect.Effect<A, E, NodeServices.NodeServices>,
  ): Effect.Effect<
    {
      readonly result: A;
      readonly facts: ReadonlyArray<WorkFact>;
      readonly recording: FileSystemRecording;
    },
    E
  > =>
    Effect.gen(function* () {
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const observed = workObservations(false);
      recording.reset();
      const result = yield* owner.pipe(
        observed.provide,
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );
      return { result, facts: observed.facts, recording };
    }).pipe(Effect.provide(NodeServices.layer));

  const publishExternal = (transient: boolean) =>
    materializeExternalPackageWithTreeIntegrity({
      baseDir: workspaceRoot,
      canonicalPath,
      transient,
      sourceLocation: sourcePath,
      copyFailureCode: "validation",
      copyFailureDetail: (target) => `failed to copy to ${target}`,
    });

  /** Recoveries of a path, each one existence probe of its backup and one staging cleanup. */
  const recoveries = (recording: FileSystemRecording, path: string) => {
    const { stagingPath, backupPath } = canonicalMaterializationPaths(path);
    return {
      backupProbes: recording.calls({ path: backupPath, method: "access" }).length,
      stagingCleanups: recording.calls({ path: stagingPath, method: "remove" }).length,
    };
  };

  for (const scenario of [
    { transient: false, prior: undefined, hashes: 1, canonicalReads: 0 },
    // The footprint compares the prior and the published tree whenever a prior one exists.
    { transient: false, prior: "prior", hashes: 3, canonicalReads: 2 },
    { transient: false, prior: "next", hashes: 3, canonicalReads: 2 },
    // Internal acquisition staging records no footprint, so only the staged tree is hashed.
    { transient: true, prior: undefined, hashes: 1, canonicalReads: 0 },
    { transient: true, prior: "stale", hashes: 1, canonicalReads: 0 },
  ] as const)
    it.effect(
      `hashes ${scenario.hashes} tree(s) to publish an external package (transient=${scenario.transient}, prior=${scenario.prior ?? "none"})`,
      () =>
        Effect.gen(function* () {
          if (scenario.prior !== undefined) writeCanonical(scenario.prior);

          const { result, facts, recording } = yield* measured(publishExternal(scenario.transient));

          expect(treeHashes(facts)).toBe(scenario.hashes);
          expect(recording.contentReads(nodePath.join(canonicalPath, "review.md"))).toBe(
            scenario.canonicalReads,
          );
          expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
            "next",
          );
          expect(result.treeIntegrity).toBe(
            yield* computeMaterializedTreeIntegrity(canonicalPath).pipe(
              Effect.provide(NodeServices.layer),
            ),
          );
        }),
    );

  for (const unsafe of [false, true])
    it.effect.skipIf(unsafe && tmpdirFoldsCase)(
      unsafe
        ? "refuses an unsafe staged tree before comparing it with the expected tree"
        : "refuses a staged tree that differs from the expected tree before publication",
      () =>
        Effect.gen(function* () {
          writeCanonical("prior");
          const expected = yield* computeMaterializedTreeIntegrity(canonicalPath).pipe(
            Effect.provide(NodeServices.layer),
          );
          if (unsafe) nodeFs.writeFileSync(nodePath.join(sourcePath, "REVIEW.md"), "colliding");

          const failure = yield* materializeExternalPackageWithTreeIntegrity({
            baseDir: workspaceRoot,
            canonicalPath,
            sourceLocation: sourcePath,
            copyFailureCode: "validation",
            copyFailureDetail: (target) => `failed to copy to ${target}`,
            expectedTreeIntegrity: {
              integrity: expected,
              mismatch: () => new InjectedFailure({ detail: "prepared tree changed" }),
            },
          }).pipe(Effect.flip, Effect.provide(NodeServices.layer));

          expect(failure._tag).toBe(unsafe ? "MaterializedTreeInvalid" : "InjectedFailure");
          if (!unsafe) expect(failure).toMatchObject({ detail: "prepared tree changed" });
          expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe(
            "prior",
          );
          expect(nodeFs.existsSync(canonicalMaterializationPaths(canonicalPath).stagingPath)).toBe(
            false,
          );
        }),
    );

  it.effect("publishes a staged tree equal to the expected tree", () =>
    Effect.gen(function* () {
      const expected = yield* computeMaterializedTreeIntegrity(sourcePath).pipe(
        Effect.provide(NodeServices.layer),
      );

      const { result, facts } = yield* measured(
        materializeExternalPackageWithTreeIntegrity({
          baseDir: workspaceRoot,
          canonicalPath,
          sourceLocation: sourcePath,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `failed to copy to ${target}`,
          expectedTreeIntegrity: {
            integrity: expected,
            mismatch: () => new InjectedFailure({ detail: "prepared tree changed" }),
          },
        }),
      );

      expect(result.treeIntegrity).toBe(expected);
      expect(treeHashes(facts)).toBe(1);
    }),
  );

  it.effect("publishes a create-only package without hashing its tree", () =>
    Effect.gen(function* () {
      const { facts, recording } = yield* measured(
        createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          requiredFiles: ["review.md"],
          populate: (stagingPath) =>
            Effect.sync(() => nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "new")),
        }),
      );

      expect(treeHashes(facts)).toBe(0);
      expect(recording.contentReads(nodePath.join(canonicalPath, "review.md"))).toBe(0);
      expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "review.md"), "utf8")).toBe("new");
    }),
  );

  it.effect("recovers a create-only destination once before publishing it", () =>
    Effect.gen(function* () {
      const { recording } = yield* measured(
        createCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          subject: "Hook",
          populate: (stagingPath) =>
            Effect.sync(() => nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "new")),
        }),
      );

      expect(recoveries(recording, canonicalPath)).toEqual({ backupProbes: 1, stagingCleanups: 1 });
    }),
  );

  it.effect("compares a prior and a replaced tree for a void-inspect replacement", () =>
    Effect.gen(function* () {
      writeCanonical("prior");

      const { facts, recording } = yield* measured(
        replaceCanonicalDirectory({
          baseDir: workspaceRoot,
          canonicalPath,
          populate: (stagingPath) =>
            Effect.sync(() =>
              nodeFs.writeFileSync(nodePath.join(stagingPath, "review.md"), "replaced"),
            ),
        }),
      );

      expect(treeHashes(facts)).toBe(2);
      expect(recoveries(recording, canonicalPath)).toEqual({ backupProbes: 1, stagingCleanups: 1 });
    }),
  );
});
