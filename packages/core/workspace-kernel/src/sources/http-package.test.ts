import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { ArtifactHttpClient } from "./http-download.js";
import { acquireHttpOffer } from "./http-package.js";

it.effect("counts implicit legacy inventory directories before downloading files", () =>
  Effect.gen(function* () {
    const client = HttpClient.make(() => Effect.die("Over-budget inventory reached transport"));
    const failure = yield* acquireHttpOffer(
      {
        name: "review",
        format: "files",
        artifacts: ["SKILL.md", "one/two/file.txt"].map((path) => ({
          path,
          url: new URL(`https://example.test/${path}`),
        })),
      },
      { maxEntries: 3 },
    ).pipe(Effect.provideService(ArtifactHttpClient, client), Effect.flip);
    expect(failure.detail).toContain("implicit directories");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

const inventoryRefusals: ReadonlyArray<{
  readonly name: string;
  readonly paths: ReadonlyArray<string | undefined>;
  readonly maxEntries?: number;
  readonly detail: string;
}> = [
  {
    name: "an empty inventory",
    paths: [],
    detail: "HTTP file inventory exceeds the supported entry count",
  },
  {
    name: "more files than the entry limit",
    paths: ["SKILL.md", "a.md", "b.md"],
    maxEntries: 2,
    detail: "HTTP file inventory exceeds the supported entry count",
  },
  {
    name: "a parent-relative path after a valid file",
    paths: ["SKILL.md", "notes.md", "../escape.md"],
    detail: "HTTP file inventory contains an unsafe path",
  },
  {
    name: "an absolute path after a valid file",
    paths: ["SKILL.md", "/etc/passwd"],
    detail: "HTTP file inventory contains an unsafe path",
  },
  {
    name: "a file without a path after a valid file",
    paths: ["SKILL.md", undefined],
    detail: "HTTP file inventory contains an unsafe path",
  },
  {
    name: "parent directories differing only in case",
    paths: ["SKILL.md", "Docs/a.md", "docs/b.md"],
    detail: "HTTP file inventory contains colliding parent paths",
  },
  {
    name: "files differing only in case",
    paths: ["SKILL.md", "guide.md", "GUIDE.md"],
    detail: "HTTP file inventory contains colliding parent paths",
  },
  {
    name: "files differing only in Unicode normalization",
    paths: ["SKILL.md", "caf\u00e9.md", "cafe\u0301.md"],
    detail: "HTTP file inventory contains colliding parent paths",
  },
  {
    name: "a repeated path",
    paths: ["SKILL.md", "guide.md", "guide.md"],
    detail: "HTTP file inventory contains duplicate paths",
  },
  {
    name: "an inventory without SKILL.md",
    paths: ["scripts/run.sh", "docs/guide.md"],
    detail: "HTTP file inventory is missing SKILL.md",
  },
  {
    name: "an inventory whose only skill file differs in case",
    paths: ["skill.md", "docs/guide.md"],
    detail: "HTTP file inventory is missing SKILL.md",
  },
  {
    name: "a missing SKILL.md before a file below another file",
    paths: ["a", "a/b"],
    detail: "HTTP file inventory is missing SKILL.md",
  },
  {
    name: "a file below another file",
    paths: ["SKILL.md", "a", "a/b"],
    detail: "HTTP file inventory places a file below another file",
  },
];

it.effect.each(inventoryRefusals)(
  "refuses $name before downloading any file",
  ({ paths, maxEntries, detail }) =>
    Effect.gen(function* () {
      const client = HttpClient.make(() => Effect.die("Refused inventory reached transport"));
      const failure = yield* acquireHttpOffer(
        {
          name: "review",
          format: "files",
          artifacts: paths.map((path, index) => ({
            ...(path === undefined ? {} : { path }),
            url: new URL(`https://example.test/artifact-${index}`),
          })),
        },
        maxEntries === undefined ? {} : { maxEntries },
      ).pipe(Effect.provideService(ArtifactHttpClient, client), Effect.flip);
      expect(failure._tag).toBe("SourceNotResolvable");
      expect(failure.detail).toBe(detail);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("reads each inventory path once while staging every offered file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const contents = new Map([
      ["SKILL.md", "# Review\n"],
      ["scripts/run.sh", "echo review\n"],
      ["docs/guide.md", "guide\n"],
    ]);
    const pathReads = new Map<string, number>();
    const artifacts = [...contents.keys()].map((relative) => ({
      url: new URL(`https://example.test/${relative}`),
      get path() {
        pathReads.set(relative, (pathReads.get(relative) ?? 0) + 1);
        return relative;
      },
    }));
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(contents.get(new URL(request.url).pathname.slice(1)) ?? "", {
            status: contents.has(new URL(request.url).pathname.slice(1)) ? 200 : 404,
          }),
        ),
      ),
    );

    const acquired = yield* acquireHttpOffer({ name: "review", format: "files", artifacts }).pipe(
      Effect.provideService(ArtifactHttpClient, client),
    );

    expect(Object.fromEntries(pathReads)).toEqual({
      "SKILL.md": 1,
      "scripts/run.sh": 1,
      "docs/guide.md": 1,
    });
    expect(acquired.snapshot.format).toBe("files");
    if (acquired.snapshot.format !== "files") return;
    expect(acquired.snapshot.files.map((file) => [file.path, file.url.href])).toEqual(
      [...contents.keys()].map((relative) => [relative, `https://example.test/${relative}`]),
    );
    for (const [relative, text] of contents)
      expect(yield* fs.readFileString(path.join(acquired.directory, relative))).toBe(text);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
