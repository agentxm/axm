/**
 * HTTP discovery measures each acquired tree before admitting it, and the
 * convention walk that follows takes that measure's listings and entry kinds
 * instead of listing and inspecting the same scratch tree again. Every file
 * read, plugin and marketplace probe, and containment resolution stays live,
 * and a path the measure did not observe is inspected live.
 */
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { zipSync } from "fflate";
import { pack } from "tar-stream";
import type { HttpSource } from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { ArtifactHttpClient, httpArtifactDigest } from "../http-download.js";
import { WELL_KNOWN_SCHEMA } from "../well-known-index.js";
import { findHttpSource } from "./http.js";

const skillOptions = {
  type: "skill",
  names: [],
  owner: Option.none(),
  versionRange: Option.none(),
} as const;

const skill = (name: string) =>
  new TextEncoder().encode(`---\nname: ${name}\ndescription: The ${name} skill\n---\n`);

const twoSkillArchive = () =>
  zipSync({ "skills/alpha/SKILL.md": skill("alpha"), "skills/beta/SKILL.md": skill("beta") });

const tarArchive = (
  entries: ReadonlyArray<
    | { readonly name: string; readonly body: Uint8Array }
    | { readonly name: string; readonly linkname: string }
  >,
) =>
  Effect.gen(function* () {
    const tar = yield* Effect.acquireRelease(
      Effect.sync(() => pack()),
      (tar) =>
        Effect.sync(() => {
          tar.destroy();
        }),
    );
    for (const entry of entries)
      if ("body" in entry) tar.entry({ name: entry.name }, Buffer.from(entry.body));
      else tar.entry({ name: entry.name, type: "symlink", linkname: entry.linkname });
    tar.finalize();
    const chunks: AsyncIterable<unknown> = tar;
    const parts = yield* Stream.fromAsyncIterable(chunks, (cause) => cause).pipe(
      Stream.runFoldEffect(
        (): Uint8Array[] => [],
        (bytes, chunk) =>
          Effect.sync(() => {
            if (!(chunk instanceof Uint8Array)) throw new Error("Expected archive bytes");
            bytes.push(chunk);
            return bytes;
          }),
      ),
    );
    return new Uint8Array(Buffer.concat(parts));
  });

/** Serve `artifacts` by URL path suffix and record each request. */
const client = (artifacts: Readonly<Record<string, Uint8Array | string>>, requests: string[]) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url);
      const suffix = Object.keys(artifacts).find((key) => request.url.endsWith(key));
      const body = suffix === undefined ? undefined : artifacts[suffix];
      return HttpClientResponse.fromWeb(
        request,
        body === undefined ? new Response("missing", { status: 404 }) : new Response(body),
      );
    }),
  );

/**
 * Run one HTTP find under a recording filesystem whose recording starts with
 * the find, returning the refs, the recording, and each acquired tree's root.
 */
const recordedFind = (
  source: HttpSource,
  artifacts: Readonly<Record<string, Uint8Array | string>>,
  accepted?: Extract<ExtensionRef, { readonly refType: "http" }>["snapshot"],
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const requests: string[] = [];
    recording.reset();
    const refs = yield* findHttpSource(source, skillOptions, accepted).pipe(
      Effect.provideService(ArtifactHttpClient, client(artifacts, requests)),
      Effect.scoped,
    );
    const roots = recording
      .calls({ method: "makeTempDirectory" })
      .filter((call) => call.outcome === "success")
      .map((call) => call.path);
    return { refs, recording, roots, requests };
  }).pipe(
    Effect.provide(Layer.mergeAll(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

const writing = new Set(["makeDirectory", "writeFile", "symlink", "file.write", "file.writeAll"]);

/**
 * Calls of `method` naming `target` after the last write into the acquired
 * tree at `root`, so the staging that wrote the tree is not counted.
 */
const count = (
  recording: FileSystemRecording,
  root: string,
  method: "access" | "readDirectory" | "readLink" | "stat" | "readFile" | "realPath",
  target: string,
) => {
  const calls = recording.calls();
  let staged = -1;
  calls.forEach((call, index) => {
    if (writing.has(call.method) && (call.path === root || call.path.startsWith(root + path.sep)))
      staged = index;
  });
  return calls.slice(staged + 1).filter((call) => call.method === method && call.path === target)
    .length;
};

/** The walk-shaped calls on each directory of a `skills/{alpha,beta}` tree. */
const walkCounts = (recording: FileSystemRecording, root: string) => {
  const directories = {
    root,
    skills: path.join(root, "skills"),
    alpha: path.join(root, "skills", "alpha"),
    beta: path.join(root, "skills", "beta"),
  };
  return {
    listings: Object.fromEntries(
      Object.entries(directories).map(([key, at]) => [
        key,
        count(recording, root, "readDirectory", at),
      ]),
    ),
    links: Object.fromEntries(
      Object.entries(directories).map(([key, at]) => [key, count(recording, root, "readLink", at)]),
    ),
    stats: Object.fromEntries(
      Object.entries(directories).map(([key, at]) => [key, count(recording, root, "stat", at)]),
    ),
    rootProbe: count(recording, root, "access", root),
  };
};

const measuredOnce = {
  listings: { root: 1, skills: 1, alpha: 1, beta: 1 },
  links: { root: 0, skills: 1, alpha: 1, beta: 1 },
  stats: { root: 1, skills: 1, alpha: 1, beta: 1 },
  rootProbe: 0,
};

describe("HTTP discovery over a measured tree", () => {
  it.effect("lists and inspects an archive's tree once for its measure and discovery", () =>
    Effect.gen(function* () {
      const { refs, recording, roots } = yield* recordedFind(
        { type: "http", kind: "archive", url: new URL("https://example.test/skills.zip") },
        { "skills.zip": twoSkillArchive() },
      );

      expect(refs.map((ref) => ref.name)).toStrictEqual(["alpha", "beta"]);
      expect(roots).toHaveLength(1);
      const root = roots[0] ?? "";
      expect(walkCounts(recording, root)).toStrictEqual(measuredOnce);
      // Skill documents, plugin and marketplace probes, and resolutions stay live.
      expect({
        alpha: count(recording, root, "readFile", path.join(root, "skills", "alpha", "SKILL.md")),
        beta: count(recording, root, "readFile", path.join(root, "skills", "beta", "SKILL.md")),
        rootResolution: count(recording, root, "realPath", root),
        skillsResolution: count(recording, root, "realPath", path.join(root, "skills")),
        rootPluginProbe: count(recording, root, "access", path.join(root, "plugin.json")),
        skillsPluginProbe: count(
          recording,
          root,
          "access",
          path.join(root, "skills", "plugin.json"),
        ),
        heldRootProbe: count(recording, root, "readLink", path.join(root, "agent_extensions")),
      }).toStrictEqual({
        alpha: 1,
        beta: 1,
        rootResolution: 1,
        skillsResolution: 1,
        rootPluginProbe: 1,
        skillsPluginProbe: 1,
        heldRootProbe: 1,
      });
    }),
  );

  it.effect("gives each index offer its own measured tree", () =>
    Effect.gen(function* () {
      const archive = twoSkillArchive();
      const index = JSON.stringify({
        $schema: WELL_KNOWN_SCHEMA,
        skills: ["one", "two"].map((name) => ({
          name,
          type: "archive",
          url: `${name}.zip`,
          digest: httpArtifactDigest(archive),
        })),
      });
      const { refs, recording, roots } = yield* recordedFind(
        { type: "http", kind: "index", url: new URL("https://example.test/index.json") },
        { "index.json": index, "one.zip": archive, "two.zip": archive },
      );

      expect(refs.map((ref) => ref.name)).toStrictEqual(["alpha", "beta", "alpha", "beta"]);
      expect(roots).toHaveLength(2);
      for (const root of roots) expect(walkCounts(recording, root)).toStrictEqual(measuredOnce);
    }),
  );

  it.effect("replays an accepted snapshot's download and walks its tree once", () =>
    Effect.gen(function* () {
      const archive = twoSkillArchive();
      const url = new URL("https://example.test/skills.zip");
      const { refs, recording, roots, requests } = yield* recordedFind(
        { type: "http", kind: "archive", url },
        { "skills.zip": archive },
        { format: "zip", url, digest: httpArtifactDigest(archive) },
      );

      expect(refs.map((ref) => ref.name)).toStrictEqual(["alpha", "beta"]);
      expect(requests).toStrictEqual(["https://example.test/skills.zip"]);
      expect(roots).toHaveLength(1);
      expect(walkCounts(recording, roots[0] ?? "")).toStrictEqual(measuredOnce);
    }),
  );

  it.effect("refuses an accepted snapshot whose bytes no longer match its digest", () =>
    Effect.gen(function* () {
      const url = new URL("https://example.test/skills.zip");
      const outcome = yield* recordedFind(
        { type: "http", kind: "archive", url },
        { "skills.zip": twoSkillArchive() },
        { format: "zip", url, digest: httpArtifactDigest(new TextEncoder().encode("other")) },
      ).pipe(Effect.flip);

      expect(outcome._tag).toBe("SourceNotResolvable");
    }),
  );

  it.effect("does not follow a contained directory link in the acquired tree", () =>
    Effect.gen(function* () {
      const archive = yield* tarArchive([
        { name: "skills/alpha/SKILL.md", body: skill("alpha") },
        { name: "skills/beta/SKILL.md", body: skill("beta") },
        { name: "skills/linked", linkname: "alpha" },
      ]);
      const { refs, recording, roots } = yield* recordedFind(
        { type: "http", kind: "archive", url: new URL("https://example.test/skills.tar") },
        { "skills.tar": archive },
      );

      expect(refs.map((ref) => ref.name)).toStrictEqual(["alpha", "beta"]);
      const root = roots[0] ?? "";
      const linked = path.join(root, "skills", "linked");
      const beta = path.join(root, "skills", "beta");
      // The measure's own link containment check still resolves the link's
      // target live; the walk takes the link and its siblings from the measure.
      expect({
        link: count(recording, root, "readLink", linked),
        linkStat: count(recording, root, "stat", linked),
        linkListing: count(recording, root, "readDirectory", linked),
        skillsListing: count(recording, root, "readDirectory", path.join(root, "skills")),
        betaLink: count(recording, root, "readLink", beta),
        betaStat: count(recording, root, "stat", beta),
        betaListing: count(recording, root, "readDirectory", beta),
      }).toStrictEqual({
        link: 2,
        linkStat: 0,
        linkListing: 0,
        skillsListing: 1,
        betaLink: 1,
        betaStat: 1,
        betaListing: 1,
      });
    }),
  );

  it.effect("acquires and walks nothing for a skill-only source asked for another type", () =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const refs = yield* findHttpSource(
        { type: "http", kind: "index", url: new URL("https://example.test/index.json") },
        { ...skillOptions, type: "knowledge" },
      ).pipe(
        Effect.provideService(
          ArtifactHttpClient,
          HttpClient.make(() => Effect.die("Non-skill discovery reached a skill-only source")),
        ),
        Effect.scoped,
      );

      expect(refs).toStrictEqual([]);
      expect(recording.calls()).toStrictEqual([]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer),
      ),
    ),
  );
});
