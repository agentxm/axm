import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";
import { rebuildDistributionDigest } from "../archive.js";
import { publishArchiveOptions } from "../publish-selection.js";
import { archiveContents } from "../test-helpers.js";
import { FIXTURE_OWNER, writeAuthoredExtension } from "../testing.js";
import { decodeCandidate, prepareCandidate } from "./model.js";

const concept = (title: string) =>
  `---\ntype: reference\ndescription: ${title}\ntags: [platform]\n---\n# ${title}\n`;

const documents = ["index.md", "architecture.md", "drafts/draft.md"];

/** A workspace-authored Knowledge package whose drafts are excluded from publication. */
const writeKnowledge = (root: string, name: string) => {
  const extensionDir = writeAuthoredExtension(root, "knowledge", {
    name,
    publishExclude: ["src/drafts/**"],
  });
  fs.writeFileSync(nodePath.join(extensionDir, "src", "architecture.md"), concept(name));
  fs.mkdirSync(nodePath.join(extensionDir, "src", "drafts"));
  fs.writeFileSync(nodePath.join(extensionDir, "src", "drafts", "draft.md"), concept("Draft"));
  return extensionDir;
};

const decoded = (name: string, extensionDir: string) =>
  decodeCandidate({
    type: "knowledge",
    name,
    source: "workspace",
    distribute: true,
    owner: decodeHandleSync(FIXTURE_OWNER),
    fqn: `${FIXTURE_OWNER}/knowledge/${name}`,
    sourceType: "workspace",
    authored: true,
    extensionDir,
  }).pipe(
    Effect.flatMap((candidate) =>
      candidate === undefined
        ? Effect.die("Expected a publishable candidate")
        : Effect.succeed(candidate),
    ),
  );

const withProject = <A, E, R>(body: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-knowledge-"))),
    ),
    body,
    (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  );

describe("Knowledge candidate preparation", () => {
  it.effect("reads each bundle document once for the inspection and the archive", () =>
    withProject((root) =>
      Effect.gen(function* () {
        const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
        const record = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.provideService(effect, FileSystem.FileSystem, fileSystem);
        for (const name of ["review", "notes"]) {
          const extensionDir = writeKnowledge(root, name);
          const candidate = yield* decoded(name, extensionDir);
          recording.reset();

          const prepared = yield* record(prepareCandidate(candidate, Option.none(), false));

          expect(
            Object.fromEntries(
              documents.map((document) => [
                document,
                recording.contentReads(nodePath.join(extensionDir, "src", document)),
              ]),
            ),
          ).toEqual({ "index.md": 1, "architecture.md": 1, "drafts/draft.md": 1 });
          if (prepared.action !== "publish") return yield* Effect.die("Expected an upload");
          expect(prepared.archivePlan.included.map((entry) => entry.path)).toEqual([
            "knowledge.json",
            "src/architecture.md",
            "src/index.md",
          ]);
          expect(prepared.archivePlan.excluded.map((entry) => entry.path)).toContain(
            "src/drafts/draft.md",
          );
          const contents = yield* archiveContents(prepared.archive.copyBytes());
          expect(contents["src/architecture.md"]).toEqual(Buffer.from(concept(name)));
          // A build that reads every source itself yields the same archive.
          const rebuilt = yield* rebuildDistributionDigest(
            extensionDir,
            yield* publishArchiveOptions("knowledge", prepared.publishOptions),
          );
          expect(rebuilt.integrity).toBe(prepared.integrity);
        }
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reads no bundle document for a version the Registry already has", () =>
    withProject((root) =>
      Effect.gen(function* () {
        const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
        const extensionDir = writeKnowledge(root, "review");
        const candidate = yield* decoded("review", extensionDir);
        const index: ExtensionIndex = {
          owner: decodeHandleSync(FIXTURE_OWNER),
          type: "knowledge",
          name: candidate.manifest.name,
          publisherBindingId: "hbnd_test",
          archival: null,
          deprecation: null,
          versions: [
            {
              version: decodeVersionSync("1.0.0"),
              published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
              integrity: "sha512-AAAA==",
            },
          ],
        };
        recording.reset();

        const prepared = yield* prepareCandidate(candidate, Option.some(index), false).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );

        expect(prepared.action).toBe("skip");
        expect(recording.calls()).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  // Permission bits do not stop a privileged reader, and Windows does not honor them.
  it.effect.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses an unreadable bundle document as a failed inspection",
    () =>
      withProject((root) =>
        Effect.gen(function* () {
          const extensionDir = writeKnowledge(root, "review");
          const document = nodePath.join(extensionDir, "src", "architecture.md");
          const candidate = yield* decoded("review", extensionDir);
          fs.chmodSync(document, 0o000);

          const failure = yield* prepareCandidate(candidate, Option.none(), false).pipe(
            Effect.ensuring(Effect.sync(() => fs.chmodSync(document, 0o644))),
            Effect.flip,
          );

          expect(failure).toMatchObject({
            _tag: "OperationRefused",
            category: "validation",
            detail: "Failed to inspect Knowledge bundle: @acme/knowledge/review",
          });
          const cause: unknown = "cause" in failure ? failure.cause : undefined;
          expect(PlatformError.isPlatformError(cause)).toBe(true);
          expect(cause).toMatchObject({
            reason: { _tag: "PermissionDenied", method: "readFile", pathOrDescriptor: document },
          });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
