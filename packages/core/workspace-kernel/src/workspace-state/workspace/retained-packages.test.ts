import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type {
  GitHostedSkillRef,
  HttpSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { HttpArtifactSnapshotSchema } from "@agentxm/extension-model/unstable/sources/http-artifact";
import { LOCK_ENTRY_SCHEMA_BY_TYPE } from "../desired/lockfile/schema.js";
import { extensionName } from "../testing.js";
import { encodeSourcePath } from "./source-address.js";
import { retainedBindingMatchesRef, validatePackageAddressClaims } from "./retained-packages.js";

const claim = (packageKey: string, segments: ReadonlyArray<string>) => ({
  packageKey,
  address: Result.getOrThrow(encodeSourcePath(segments)),
});

describe("portable retained package claims", () => {
  it("allows repeated component bindings to exactly one package", () => {
    const shared = claim("shared", ["github.com", "basecamp", "skills"]);
    expect(Result.isSuccess(validatePackageAddressClaims([shared, shared]))).toBe(true);
  });

  it.each([
    [
      ["example.test", "Repo"],
      ["example.test", "repo"],
    ],
    [
      ["example.test", "repo"],
      ["example.test", "repo", "nested"],
    ],
    [
      ["example.test", "repo", "nested"],
      ["example.test", "repo"],
    ],
    [
      ["example.test", "café"],
      ["example.test", "CAFÉ"],
    ],
    [
      ["example.test", "café"],
      ["example.test", "cafe\u0301"],
    ],
    [
      ["example.test", "repo"],
      ["example.test", "repo"],
    ],
  ])("refuses distinct source authorities at overlapping portable addresses", (left, right) => {
    expect(
      Result.isFailure(validatePackageAddressClaims([claim("left", left), claim("right", right)])),
    ).toBe(true);
  });

  it("keeps neighboring names and separately retained package boundaries distinct", () => {
    expect(
      Result.isSuccess(
        validatePackageAddressClaims([
          claim("first", ["example.test", "repo", "skills", "one"]),
          claim("second", ["example.test", "repo", "skills", "two"]),
          claim("third", ["example.test", "repository"]),
        ]),
      ),
    ).toBe(true);
  });

  it("counts the actual workspace root in the filesystem path limit", () => {
    expect(
      Result.isFailure(
        validatePackageAddressClaims(
          [claim("source", ["example.test", "repo"])],
          "/" + "x".repeat(4090),
        ),
      ),
    ).toBe(true);
  });
});

const decodeSkillLockEntry = Schema.decodeUnknownSync(LOCK_ENTRY_SCHEMA_BY_TYPE.skill);
const decodeSnapshot = Schema.decodeUnknownSync(HttpArtifactSnapshotSchema);
const treeIntegrity = `sha256-tree-v2:${"0".repeat(64)}`;
const acceptedCommit = "a".repeat(40);
const acceptedTree = "c".repeat(40);
const skill = {
  name: extensionName("review"),
  description: Option.none(),
  metadata: Option.none(),
};

const gitRef = (gitCommitSha: string, gitTreeSha: string) =>
  ({
    type: "skill",
    refType: "git-hosted",
    source: {
      type: "git",
      url: new URL("https://github.com/acme/extensions.git"),
      ref: Option.none(),
      subPath: Option.none(),
    },
    name: extensionName("review"),
    location: "file:///checkout",
    gitCommitSha,
    gitTreeSha,
    skill,
  }) satisfies GitHostedSkillRef;

const snapshot = (digit: string) =>
  decodeSnapshot({
    format: "zip",
    url: "https://downloads.example/review.zip",
    digest: `sha256:${digit.repeat(64)}`,
  });

const httpRef = (accepted: ReturnType<typeof snapshot>) =>
  ({
    type: "skill",
    refType: "http",
    source: { type: "http", url: new URL("https://downloads.example/review.zip"), kind: "archive" },
    name: extensionName("review"),
    location: "file:///download",
    sourcePath: ".",
    snapshot: accepted,
    portable: true,
    skill,
  }) satisfies HttpSkillRef;

const gitEntry = decodeSkillLockEntry({
  source: { type: "git", url: "https://github.com/acme/extensions.git" },
  identity: { name: "review" },
  resolved: { commit: acceptedCommit, tree: acceptedTree },
  treeIntegrity,
});

const httpEntry = decodeSkillLockEntry({
  source: {
    type: "http",
    url: "https://downloads.example/review.zip",
    kind: "archive",
    path: ".",
    portable: true,
  },
  identity: { name: "review" },
  resolved: {
    format: "zip",
    url: "https://downloads.example/review.zip",
    digest: `sha256:${"a".repeat(64)}`,
  },
  treeIntegrity,
});

describe("retained binding snapshot match", () => {
  it.each([
    [acceptedCommit, acceptedTree, true],
    ["b".repeat(40), acceptedTree, false],
    [acceptedCommit, "d".repeat(40), false],
  ])("compares git commit %s and tree %s", (commit, tree, matches) => {
    expect(retainedBindingMatchesRef(gitEntry, gitRef(commit, tree))).toBe(matches);
  });

  it("refuses a git ref against an entry resolved without a commit", () => {
    expect(retainedBindingMatchesRef(httpEntry, gitRef(acceptedCommit, acceptedTree))).toBe(false);
  });

  it.each([
    ["a", true],
    ["b", false],
  ])("compares the accepted HTTP snapshot digest %s", (digit, matches) => {
    expect(retainedBindingMatchesRef(httpEntry, httpRef(snapshot(digit)))).toBe(matches);
  });
});
