// Raw node filesystem and Git subprocesses construct a real immutable repository fixture.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource, LocalSource } from "@agentxm/extension-model/unstable/sources/types";

import { PackLockEntrySchema } from "../desired-state/lockfile/schema.js";
import { resolvePackDependencies } from "./pack-dependency-resolution.js";
import {
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
  type SourceHostProvidersService,
} from "./sources/index.js";

export const specification = defineSpecification({
  requirement: "packs/source-inherited-members-share-one-source-view",
  title: "Git and path Packs inherit members from one source view",
  statement:
    "A Git or path Pack shall resolve sourceless members by declared identity from the same source view as the Pack, shall refuse ambiguous identities, and shall record the Pack's immutable resolution and member identities in accepted lock authority.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The Git example clones one committed fixture through the production provider and compares the accepted commit on the Pack with its captured member candidate; the path example expands that captured source view without reacquisition.",
  methods: ["example", "invariant"],
  derivedFrom: ["extension-discovery/all-manifest-kinds-from-git-and-path"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const writeFixture = (root: string): void => {
  const packDirectory = path.join(root, "packs", "starter");
  const skillDirectory = path.join(root, "skills", "review");
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(path.join(skillDirectory, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packDirectory, "pack.json"),
    `${JSON.stringify({
      owner: "@acme",
      type: "pack",
      name: "starter",
      version: "1.0.0",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(skillDirectory, "skill.json"),
    `${JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" })}\n`,
  );
  fs.writeFileSync(
    path.join(skillDirectory, "src", "SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\n",
  );
};

const git = (root: string, args: ReadonlyArray<string>): void => {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
};

const findOptions = {
  type: "pack",
  names: ["starter"],
  owner: Option.some(decodeHandleSync("@acme")),
  versionRange: Option.none(),
} satisfies FindOptions;

const noReacquisition: SourceHostProvidersService = {
  resolveNamedRegistry: () => Effect.die("Registry resolution is not used"),
  find: () => Effect.die("Source-inherited members must not reacquire the source"),
  fetch: () => Effect.die("Fetch is not used while expanding captured members"),
  cloneUrl: () => Option.none(),
  origin: () => "fixture",
};

const onePack = (refs: ReadonlyArray<PackRef>): PackRef => {
  const pack = refs[0];
  if (pack === undefined) throw new Error("Expected one discovered Pack");
  return pack;
};

describe("source-inherited Pack members", () => {
  const roots: Array<string> = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect(
    "pins Git members to the Pack commit and expands path members without reacquisition",
    () =>
      Effect.gen(function* () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-pack-source-view-"));
        roots.push(root);
        writeFixture(root);
        git(root, ["init", "--quiet", "--initial-branch=main"]);
        git(root, ["config", "user.email", "test@example.com"]);
        git(root, ["config", "user.name", "Test"]);
        git(root, ["add", "."]);
        git(root, ["commit", "--quiet", "-m", "fixture"]);

        const gitProvider = createGitSourceHostProvider();
        const gitSource = {
          type: "git",
          url: pathToFileURL(root),
          ref: Option.none(),
        } satisfies GitSource;
        const gitRefs = yield* gitProvider
          .find(gitSource, findOptions)
          .pipe(Effect.provide(NodeServices.layer), Effect.scoped);
        const gitPack = onePack(gitRefs.filter((ref): ref is PackRef => ref.type === "pack"));
        expect(gitPack.refType).toBe("git-hosted");
        if (gitPack.refType === "git-hosted") {
          expect(gitPack.sourceMembers).toHaveLength(1);
          const member = gitPack.sourceMembers[0];
          expect(member?.refType).toBe("git-hosted");
          if (member?.refType === "git-hosted") {
            expect(member.gitCommitSha).toBe(gitPack.gitCommitSha);
          }

          const lock = Schema.decodeUnknownSync(PackLockEntrySchema)({
            source: { type: "git", url: gitSource.url.href },
            identity: { owner: "@acme", name: "starter" },
            resolved: { commit: gitPack.gitCommitSha, tree: gitPack.gitTreeSha },
            treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
            manifestVersion: "1.0.0",
            manifestContentIdentity: "sha256-pack-manifest",
            members: ["@acme/skills/review"],
          });
          expect(lock).toMatchObject({
            resolved: { commit: gitPack.gitCommitSha },
            members: ["@acme/skills/review"],
          });
        }

        const localProvider = createLocalSourceHostProvider();
        const localSource = { type: "local", path: root } satisfies LocalSource;
        const localRefs = yield* localProvider
          .find(localSource, findOptions)
          .pipe(Effect.provide(NodeServices.layer));
        const localPack = onePack(localRefs.filter((ref): ref is PackRef => ref.type === "pack"));
        const resolved = yield* resolvePackDependencies(localPack, noReacquisition);
        expect(resolved.resolvedSkills["@acme/skills/review"]).toEqual({ source: "local" });
        expect(resolved.dependencyRefs).toHaveLength(1);
      }),
  );
});
