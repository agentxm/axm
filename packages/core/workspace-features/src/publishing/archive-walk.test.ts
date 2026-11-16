/**
 * Physical work of one archive build: each source directory is listed once
 * and each entry's link and kind are observed once, whether the selection
 * comes from discovered ignore inputs or from an explicit include.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as childProcess from "node:child_process";

import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { planZipArchive, rebuildDistributionDigest } from "./archive.js";
import { expectPublishRefused } from "./test-helpers.js";

const withRoot = <A, E, R>(body: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-archive-walk-")))),
    body,
    (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );

/** A skill package outside any Git repository, so its ignore boundary is the package root. */
const writePackage = (root: string) => {
  fs.writeFileSync(path.join(root, "skill.json"), '{"name":"review"}\n');
  fs.writeFileSync(path.join(root, "SKILL.md"), "# Review\n");
  fs.writeFileSync(path.join(root, ".gitignore"), "secret.txt\n");
  fs.writeFileSync(path.join(root, "secret.txt"), "secret");
  fs.mkdirSync(path.join(root, "docs", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "a.md"), "a");
  fs.writeFileSync(path.join(root, "docs", "nested", "b.md"), "b");
  fs.mkdirSync(path.join(root, "empty"));
  for (const file of [
    "skill.json",
    "SKILL.md",
    ".gitignore",
    "secret.txt",
    "docs/a.md",
    "docs/nested/b.md",
  ])
    fs.chmodSync(path.join(root, file), 0o644);
  fs.chmodSync(path.join(root, "empty"), 0o755);
};

const DISCOVERED_ARCHIVE_DIGEST =
  "7054af8106a900c0af16f44f8e51680648f9e295c34172dee70e3555c7cd4e5c";

const directories = ["", "docs", "docs/nested", "empty"];
const entries = [
  "skill.json",
  "SKILL.md",
  "secret.txt",
  "docs",
  "docs/a.md",
  "docs/nested",
  "docs/nested/b.md",
  "empty",
];

/** Listings of one directory, under every spelling a walk may give its path. */
const listings = (recording: FileSystemRecording, root: string, relative: string) =>
  relative === ""
    ? (recording.counts(root).readDirectory ?? 0) +
      (recording.counts(`${root}${path.sep}`).readDirectory ?? 0)
    : (recording.counts(path.join(root, relative)).readDirectory ?? 0);

const recorded = Effect.gen(function* () {
  return makeRecordingFileSystem(yield* FileSystem.FileSystem);
});

/** Every physical observation of the walked tree, by path relative to the package root. */
const walkCounts = (recording: FileSystemRecording, root: string) => {
  const observed = (relative: string) => {
    const { readLink, stat } = recording.counts(path.join(root, relative));
    return { readLink: readLink ?? 0, stat: stat ?? 0 };
  };
  return {
    listings: Object.fromEntries(
      directories.map((relative) => [relative, listings(recording, root, relative)]),
    ),
    entries: Object.fromEntries(entries.map((relative) => [relative, observed(relative)])),
    ignoreInputs: Object.fromEntries(
      directories.map((relative) => [
        relative,
        {
          ...observed(path.join(relative, ".gitignore")),
          contentReads: recording.contentReads(path.join(root, relative, ".gitignore")),
        },
      ]),
    ),
    manifestReads: recording.contentReads(path.join(root, "skill.json")),
  };
};

const once = { readLink: 1, stat: 1 };
const eachEntryOnce = Object.fromEntries(entries.map((relative) => [relative, once]));
const eachDirectoryOnce = { "": 1, docs: 1, "docs/nested": 1, empty: 1 };

/** sha256 of the archive the fixture package produces. */
const archiveDigest = (bytes: Uint8Array) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

describe("archive walk", () => {
  it.effect("lists each directory and observes each entry once with discovered ignore inputs", () =>
    withRoot((root) =>
      Effect.gen(function* () {
        writePackage(root);
        const { fileSystem, recording } = yield* recorded;
        recording.reset();

        // The form a caller may pass: an unnormalized package directory.
        const planned = yield* planZipArchive(`${root}${path.sep}`).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );

        expect(walkCounts(recording, root)).toEqual({
          listings: eachDirectoryOnce,
          entries: eachEntryOnce,
          ignoreInputs: {
            "": { readLink: 1, stat: 1, contentReads: 1 },
            // Absent nested ignore inputs are still probed live, once each.
            docs: { readLink: 1, stat: 1, contentReads: 0 },
            "docs/nested": { readLink: 1, stat: 1, contentReads: 0 },
            empty: { readLink: 1, stat: 1, contentReads: 0 },
          },
          manifestReads: 1,
        });
        expect(planned.plan).toEqual({
          included: [
            { path: "SKILL.md", sourcePath: "SKILL.md", size: 9, matchedPatterns: [] },
            { path: "docs/a.md", sourcePath: "docs/a.md", size: 1, matchedPatterns: [] },
            {
              path: "docs/nested/b.md",
              sourcePath: "docs/nested/b.md",
              size: 1,
              matchedPatterns: [],
            },
            { path: "empty/", sourcePath: "empty", size: 0, matchedPatterns: [] },
            {
              path: "skill.json",
              sourcePath: "skill.json",
              size: 18,
              matchedPatterns: [],
              ruleOrigin: { kind: "builtin", rule: "required-manifest" },
            },
          ],
          excluded: [
            {
              path: ".gitignore",
              sourcePath: ".gitignore",
              size: 11,
              matchedPatterns: [],
              ruleOrigin: { kind: "builtin", rule: "publication-control" },
            },
            {
              path: "secret.txt",
              sourcePath: "secret.txt",
              size: 6,
              matchedPatterns: ["secret.txt"],
              ruleOrigin: { kind: "gitignore", file: ".gitignore", line: 1 },
            },
          ],
          patterns: [
            {
              pattern: "secret.txt",
              origin: { kind: "gitignore", file: ".gitignore", line: 1 },
              matchCount: 1,
            },
          ],
          patternCoverage: { explicit: "all", inherited: "matched-only", omittedInheritedCount: 0 },
          warnings: ['Omitted publication control file ".gitignore".'],
          includedCount: 5,
          excludedCount: 2,
          uncompressedBytes: 29,
        });
        expect(archiveDigest(planned.archive.copyBytes())).toBe(DISCOVERED_ARCHIVE_DIGEST);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("lists each directory and observes each entry once with an explicit include", () =>
    withRoot((root) =>
      Effect.gen(function* () {
        writePackage(root);
        const { fileSystem, recording } = yield* recorded;
        const options = { include: ["**"] };
        const reference = yield* rebuildDistributionDigest(root, options);
        recording.reset();

        const rebuilt = yield* rebuildDistributionDigest(root, options).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );

        expect(walkCounts(recording, root)).toEqual({
          listings: eachDirectoryOnce,
          entries: eachEntryOnce,
          // No ignore input is discovered for an explicit include; the walk
          // observes the root control entry itself.
          ignoreInputs: {
            "": { readLink: 1, stat: 1, contentReads: 0 },
            docs: { readLink: 0, stat: 0, contentReads: 0 },
            "docs/nested": { readLink: 0, stat: 0, contentReads: 0 },
            empty: { readLink: 0, stat: 0, contentReads: 0 },
          },
          manifestReads: 1,
        });
        expect(rebuilt.integrity).toBe(reference.integrity);
        expect(rebuilt.policyFingerprint).toBe(reference.policyFingerprint);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a linked ignore input before any archive refusal", () =>
    withRoot((root) =>
      Effect.gen(function* () {
        writePackage(root);
        fs.rmSync(path.join(root, ".gitignore"));
        fs.symlinkSync("secret.txt", path.join(root, ".gitignore"));
        // An archive refusal the walk would otherwise reach.
        fs.symlinkSync("SKILL.md", path.join(root, "linked.json"));

        const failure = yield* planZipArchive(root, { manifest: "linked.json" }).pipe(Effect.flip);

        expect(expectPublishRefused(failure).detail).toBe(
          "A publication .gitignore must be a regular file, not a symbolic link.",
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  // Named pipes are not filesystem entries on Windows.
  it.effect.skipIf(process.platform === "win32")(
    "refuses an unsupported entry the ignore inputs observed",
    () =>
      withRoot((root) =>
        Effect.gen(function* () {
          writePackage(root);
          childProcess.execFileSync("mkfifo", [path.join(root, "docs", "pipe")]);

          const failure = yield* planZipArchive(root).pipe(Effect.flip);

          expect(expectPublishRefused(failure).detail).toBe(
            "Cannot archive unsupported filesystem entry: docs/pipe",
          );
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
