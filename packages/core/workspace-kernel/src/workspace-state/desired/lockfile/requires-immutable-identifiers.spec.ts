import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Schema from "effect/Schema";
import { LockfileSchema } from "../../index.js";

export const specification = defineSpecification({
  requirement: "workspace/lockfile/requires-immutable-identifiers",
  title: "Lockfile snapshots name immutable objects and canonical archive digests",
  statement:
    "AXM shall accept Git snapshot identifiers only as full lowercase SHA-1 or SHA-256 object IDs of matching widths and Registry archive integrity only as one canonical SHA-512 SRI token encoding 64 bytes. These constraints shall apply to reading and writing accepted resolutions; mutable Git intent remains a separate binding spec.",
  class: "functional",
  role: "supporting",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decode = Schema.decodeUnknownSync(LockfileSchema);
const encode = Schema.encodeSync(LockfileSchema);
const tree = `sha256-tree-v2:${"0".repeat(64)}`;
const git = (commit: string, gitTree: string) => ({
  version: 1,
  package: [
    {
      id: "github.com/acme/review",
      source: { git: "https://github.com/acme/review.git", path: ".", format: "native" },
      commit,
      "git-tree": gitTree,
      tree,
    },
  ],
  skills: { review: { package: "github.com/acme/review", name: "review", spec: "main" } },
});
const registry = (archive: string) => ({
  version: 1,
  package: [
    {
      id: "registry.example.com/@acme/skills/review",
      source: { registry: "https://registry.example.com" },
      version: "1.0.0",
      archive,
      publisher: "hbnd_example",
      tree,
    },
  ],
  skills: {
    review: { package: "registry.example.com/@acme/skills/review", name: "@acme/skills/review" },
  },
});
const validArchive = `sha512-${"A".repeat(86)}==`;

describe("immutable lockfile identifiers", () => {
  it.each([40, 64])("round-trips %i-character Git IDs and mutable binding intent", (width) => {
    const original = git("a".repeat(width), "b".repeat(width));
    expect(encode(decode(original))).toEqual(original);
  });
  it.each([
    "main",
    "HEAD",
    "abcdef0",
    "A".repeat(40),
    "g".repeat(40),
    "a".repeat(41),
    ` ${"a".repeat(40)}`,
    `${"a".repeat(40)}\n`,
  ])("rejects malformed Git identifier %s on either field", (value) => {
    expect(() => decode(git(value, "b".repeat(40)))).toThrow();
    expect(() => decode(git("a".repeat(40), value))).toThrow();
  });
  it("rejects mixed object formats", () => {
    expect(() => decode(git("a".repeat(40), "b".repeat(64)))).toThrow();
    expect(() => decode(git("a".repeat(64), "b".repeat(40)))).toThrow();
  });
  it("round-trips canonical SHA-512 archive integrity", () => {
    const original = registry(validArchive);
    expect(encode(decode(original))).toEqual(original);
  });
  it.each([
    "",
    "sha512-short",
    validArchive.replace("sha512", "sha256"),
    validArchive.slice(0, -1),
    `${validArchive}=`,
    `${validArchive} ${validArchive}`,
    `sha512-${"A".repeat(85)}B==`,
    `sha512-${"_".repeat(86)}==`,
    ` ${validArchive}`,
    `${validArchive}\n`,
  ])("rejects noncanonical archive integrity %s", (value) => {
    expect(() => decode(registry(value))).toThrow();
  });
  it("rejects a symbolic snapshot and invalid archive on encoding too", () => {
    for (const original of [git("a".repeat(40), "b".repeat(40)), registry(validArchive)]) {
      const view = decode(original);
      const entry = view.skills["review"];
      if (entry === undefined) throw new Error("Expected review fixture");
      const resolved =
        "commit" in entry.resolved
          ? { ...entry.resolved, commit: "main" }
          : { ...entry.resolved, integrity: "" };
      expect(() =>
        Schema.encodeUnknownSync(LockfileSchema)({
          ...view,
          skills: { review: { ...entry, resolved } },
        }),
      ).toThrow();
    }
  });
});
