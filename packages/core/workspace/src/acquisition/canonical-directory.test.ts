import * as nodeFs from "node:fs";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  replaceCanonicalDirectory,
  reusableCanonicalTree,
} from "./canonical-directory.js";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  computeMaterializedTreeIntegrity,
  type AcceptedExtensionResolution,
  type TreeIntegrity,
} from "../desired-state/index.js";
import { exactVersion, extensionName, handle } from "../desired-state/test-helpers.js";

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
  Option.some<AcceptedExtensionResolution>({
    source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
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
          const reuse = yield* reusableCanonicalTree({
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

        const reuse = yield* reusableCanonicalTree({
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

        const reuse = yield* reusableCanonicalTree({
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

        const reuse = yield* reusableCanonicalTree({
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
        const reuse = yield* reusableCanonicalTree({
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
        const accepted = Option.some<AcceptedExtensionResolution>({
          source: { type: "path", path: sourcePath },
          identity: { name: extensionName("review") },
          resolved: { tree: Schema.decodeUnknownSync(SourceHashSchema)("sha256-source") },
          treeIntegrity: acceptedTree,
        });
        const requested = { refType: "local", name: "review" } as const;

        expect(
          yield* reusableCanonicalTree({ canonicalPath, requested, accepted, force: false }),
        ).toEqual(Option.some(acceptedTree));
        expect(
          yield* reusableCanonicalTree({ canonicalPath, requested, accepted, force: true }),
        ).toEqual(Option.none());
        expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "SKILL.md"), "utf8")).toBe(
          "source",
        );
      }),
    ),
  );
});
