import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { SETTINGS_ENTRY_KEYS } from "@agentxm/workspace-kernel/workspace-state";
import { planZipArchive, type PublishableType } from "../index.js";
import {
  archiveContents,
  makePublishWorld,
  makeRemotePublishWorld,
  publishDocument,
  remoteRequest,
  requestFor,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/publication-controls-remain-private",
  title: "Publication consumes selection controls without distributing them",
  statement:
    "Every publication route shall require a regular-file distribution manifest, omit publish.include and publish.exclude from it, remove an emptied publish object, preserve other metadata and source files, omit every .gitignore entry including case variants despite explicit inclusion with local omission diagnostics, and keep selection rules out of Registry request metadata while reporting sizes and integrity of the resulting archive.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Actual filesystem sources and uploaded ZIP bytes establish the distribution boundary; recorded HTTP requests establish outgoing metadata but do not prove remote Registry storage behavior.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Arbitrary content references and public source repositories are outside this selection-control boundary.",
  ],
  openQuestions: [],
});

const types: ReadonlyArray<PublishableType> = [
  "skill",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "mcp-server",
  "pack",
];

describe("Private publication controls", () => {
  for (const type of types) {
    it.effect(`sanitizes ${type} publication and preserves the source`, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({
          settings: { [SETTINGS_ENTRY_KEYS[type]]: { review: { source: "workspace" } } },
        });
        try {
          const root = world.write(type, {
            name: "review",
            publishInclude: ["**"],
            publishExclude: ["private-customer.txt"],
          });
          const manifestPath = path.join(root, manifestFilenameForType(type));
          const original: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          if (typeof original !== "object" || original === null)
            throw new Error("Expected manifest");
          const manifest = {
            ...original,
            metadata: { public: "retained" },
            publish: { include: ["**"], exclude: ["private-customer.txt"], visibility: "public" },
          };
          const source = JSON.stringify(manifest);
          fs.writeFileSync(manifestPath, source);
          fs.writeFileSync(path.join(root, "private-customer.txt"), "private payload");
          fs.writeFileSync(path.join(root, ".gitignore"), "private-customer.txt\n");
          fs.writeFileSync(path.join(root, "src", ".GITIGNORE"), "internal-draft.txt\n");
          const result = yield* world.provide(runPublish(requestFor(world, { preview: false })));
          expect(publishDocument(result).counts.published).toBe(1);
          const contents = yield* archiveContents(
            world.archive("review", "1.0.0", extensionTypeToPlural[type]),
          );
          expect(
            JSON.parse(new TextDecoder().decode(contents[manifestFilenameForType(type)])),
          ).toEqual({ ...manifest, publish: { visibility: "public" } });
          expect(contents["private-customer.txt"]).toBeUndefined();
          expect(contents[".gitignore"]).toBeUndefined();
          expect(contents["src/.GITIGNORE"]).toBeUndefined();
          expect(fs.readFileSync(manifestPath, "utf8")).toBe(source);
          expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(
            "private-customer.txt\n",
          );
          const archive = publishDocument(result).execution.outcomes[0]?.archive;
          expect(archive?.excluded).toContainEqual(
            expect.objectContaining({
              path: ".gitignore",
              ruleOrigin: { kind: "builtin", rule: "publication-control" },
            }),
          );
          expect(archive?.warnings).toContain(
            'Omitted publication control file ".gitignore"; explicit inclusion cannot override this exclusion.',
          );
          expect(archive?.uncompressedBytes).toBe(
            Object.values(contents).reduce((sum, bytes) => sum + bytes.length, 0),
          );
        } finally {
          world.cleanup();
        }
      }),
    );
  }

  it.effect("sends no selection rules in remote preview metadata or archive uploads", () =>
    Effect.gen(function* () {
      const world = makeRemotePublishWorld({ settings: { skills: { review: "workspace" } } });
      try {
        world.write("skill", { name: "review", publishExclude: ["private-customer.txt"] });
        const result = yield* world.provide(runPublish(remoteRequest()));
        expect(publishDocument(result).counts.published).toBe(1);
        expect(world.uploads).toHaveLength(1);
        for (const request of world.requests) {
          if (request.body._tag === "Uint8Array")
            expect(new TextDecoder().decode(request.body.body)).not.toContain("private-customer");
        }
      } finally {
        world.cleanup();
      }
    }),
  );

  it.effect("rejects a linked manifest and links to omitted control files", () =>
    Effect.gen(function* () {
      const world = makePublishWorld();
      try {
        const root = world.write("skill", { name: "review" });
        fs.writeFileSync(path.join(root, ".gitignore"), "private-customer.txt\n");
        fs.symlinkSync(".gitignore", path.join(root, "policy"));
        const linkedControl = yield* world
          .provide(planZipArchive(root, { include: ["**"] }))
          .pipe(Effect.result);
        expect(linkedControl).toMatchObject({
          _tag: "Failure",
          failure: { detail: expect.stringContaining("excluded content") },
        });
        fs.unlinkSync(path.join(root, "policy"));
        fs.renameSync(path.join(root, "skill.json"), path.join(root, "original.json"));
        fs.symlinkSync("original.json", path.join(root, "skill.json"));
        const linkedManifest = yield* world.provide(planZipArchive(root)).pipe(Effect.result);
        expect(linkedManifest).toMatchObject({
          _tag: "Failure",
          failure: { detail: expect.stringContaining("regular file") },
        });
      } finally {
        world.cleanup();
      }
    }),
  );
});
