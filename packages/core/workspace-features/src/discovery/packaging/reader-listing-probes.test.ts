import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { vi } from "vitest";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { denoReader } from "./jsr.js";
import { mojoReader } from "./mojo.js";
import { pypiReader } from "./pypi.js";
import type { DetectedPackage, PackageReader } from "./types.js";
import { zigReader } from "./zig.js";

const decodeType = Schema.decodeUnknownSync(PackageTypeSchema);
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const detected = (
  type: string,
  source: string,
  purl: { readonly version?: string; readonly namespace?: string } = { version: "1.0.0" },
): DetectedPackage => ({
  purl: makePurl({ type, name: "alpha", ...purl }),
  type: decodeType(type),
  source,
});

const recommendation = JSON.stringify({ agentExtensions: [{ ref: "@acme/skills/alpha" }] });

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A real temporary tree whose `files` are written relative to its root; `""` makes a directory. */
const withTree = <A, E, R>(
  files: Readonly<Record<string, string>>,
  use: (root: string) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-reader-probes-"));
      for (const [relative, content] of Object.entries(files)) {
        const target = nodePath.join(root, relative);
        if (content === "") {
          nodeFs.mkdirSync(target, { recursive: true });
        } else {
          nodeFs.mkdirSync(nodePath.dirname(target), { recursive: true });
          nodeFs.writeFileSync(target, content);
        }
      }
      return root;
    }),
    use,
    (root) => Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
  );

/** Read one package over the live filesystem, recording only the read's own calls. */
const readRecorded = (
  reader: PackageReader,
  pkg: DetectedPackage,
  env: Readonly<Record<string, string>> = {},
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const result = yield* reader.read(pkg);
    return {
      refs: Option.map(result, (recommendations) => recommendations.map((entry) => entry.ref)),
      counts: recording.counts,
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        layerRecordingFileSystem(NodeFileSystem.layer),
        NodePath.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env })),
      ),
    ),
  );

const found = Option.some(["@acme/skills/alpha"]);

describe("zig cache listing", () => {
  const read = (root: string) => {
    vi.stubEnv("HOME", root);
    return readRecorded(zigReader, detected("zig", nodePath.join(root, "project/build.zig.zon")));
  };

  it.effect("lists a present cache without probing it first", () =>
    withTree({ ".cache/zig/p/1220abc/agent-extensions.json": recommendation }, (root) =>
      Effect.gen(function* () {
        const outcome = yield* read(root);
        expect(outcome.counts(nodePath.join(root, ".cache/zig/p"))).toEqual({ readDirectory: 1 });
        expect(outcome.refs).toEqual(found);
      }),
    ),
  );

  it.effect("costs one listing for a cache that is missing or a file", () =>
    withTree({ "elsewhere/.cache/zig/p": "not a directory" }, (root) =>
      Effect.gen(function* () {
        const missing = yield* read(root);
        expect(missing.counts(nodePath.join(root, ".cache/zig/p"))).toEqual({ readDirectory: 1 });
        expect(missing.refs).toEqual(Option.none());

        const file = yield* read(nodePath.join(root, "elsewhere"));
        expect(file.counts(nodePath.join(root, "elsewhere/.cache/zig/p"))).toEqual({
          readDirectory: 1,
        });
        expect(file.refs).toEqual(Option.none());
      }),
    ),
  );
});

describe("pixi environment listings", () => {
  const read = (root: string) => readRecorded(mojoReader, detected("mojo", `${root}/pixi.toml`));

  it.effect("lists present environments and conda-meta without probing them first", () =>
    withTree(
      { ".pixi/envs/default/conda-meta/alpha-1.0.0/agent-extensions.json": recommendation },
      (root) =>
        Effect.gen(function* () {
          const outcome = yield* read(root);
          expect(outcome.counts(nodePath.join(root, ".pixi/envs"))).toEqual({ readDirectory: 1 });
          expect(outcome.counts(nodePath.join(root, ".pixi/envs/default/conda-meta"))).toEqual({
            readDirectory: 1,
          });
          expect(outcome.refs).toEqual(found);
        }),
    ),
  );

  it.effect("costs one listing for environments that are missing or a file", () =>
    withTree({ "file/.pixi/envs": "not a directory" }, (root) =>
      Effect.gen(function* () {
        const missing = yield* read(root);
        expect(missing.counts(nodePath.join(root, ".pixi/envs"))).toEqual({ readDirectory: 1 });
        expect(missing.refs).toEqual(Option.none());

        const file = yield* read(nodePath.join(root, "file"));
        expect(file.counts(nodePath.join(root, "file/.pixi/envs"))).toEqual({ readDirectory: 1 });
        expect(file.refs).toEqual(Option.none());
      }),
    ),
  );

  it.effect("moves past environments whose conda-meta is missing or a file", () =>
    withTree({ ".pixi/envs/one": "", ".pixi/envs/two": "", ".pixi/envs/three": "" }, (root) =>
      Effect.gen(function* () {
        const envs = nodePath.join(root, ".pixi/envs");
        // The reader visits environments in listing order; only the last one listed holds the match.
        const [first, second, last] = nodeFs.readdirSync(envs);
        if (first === undefined || second === undefined || last === undefined) {
          throw new Error("Expected three environments");
        }
        nodeFs.writeFileSync(nodePath.join(envs, second, "conda-meta"), "not a directory");
        const match = nodePath.join(envs, last, "conda-meta/alpha-1.0.0");
        nodeFs.mkdirSync(match, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(match, "agent-extensions.json"), recommendation);

        const outcome = yield* read(root);
        for (const env of [first, second, last]) {
          expect(outcome.counts(nodePath.join(envs, env, "conda-meta"))).toEqual({
            readDirectory: 1,
          });
        }
        expect(outcome.refs).toEqual(found);
      }),
    ),
  );
});

describe("Deno package cache listing", () => {
  const read = (root: string) =>
    readRecorded(
      denoReader,
      detected("jsr", `${root}/project/deno.json`, { namespace: "@acme", version: "1.0.0" }),
      { DENO_DIR: nodePath.join(root, "deno") },
    );

  it.effect("lists a present package cache without probing it first", () =>
    withTree({ "deno/registries/jsr.io/@acme/alpha/1.0.0/deno.json": recommendation }, (root) =>
      Effect.gen(function* () {
        const outcome = yield* read(root);
        const registry = nodePath.join(root, "deno/registries/jsr.io");
        expect(outcome.counts(nodePath.join(root, "deno"))).toEqual({ access: 1 });
        expect(outcome.counts(registry)).toEqual({ access: 1 });
        expect(outcome.counts(nodePath.join(registry, "@acme/alpha"))).toEqual({
          readDirectory: 1,
        });
        expect(outcome.refs).toEqual(found);
      }),
    ),
  );

  it.effect("costs one listing for a package cache that is missing or a file", () =>
    withTree(
      {
        "missing/deno/registries/jsr.io": "",
        "file/deno/registries/jsr.io/@acme/alpha": "not a directory",
      },
      (root) =>
        Effect.gen(function* () {
          for (const tree of ["missing", "file"]) {
            const outcome = yield* read(nodePath.join(root, tree));
            expect(
              outcome.counts(nodePath.join(root, tree, "deno/registries/jsr.io/@acme/alpha")),
            ).toEqual({ readDirectory: 1 });
            expect(outcome.refs).toEqual(Option.none());
          }
        }),
    ),
  );
});

describe("virtual environment lib listing", () => {
  const read = (root: string) =>
    readRecorded(pypiReader, detected("pypi", `${root}/project/requirements.txt`), {
      VIRTUAL_ENV: nodePath.join(root, "venv"),
    });

  it.effect("lists a present lib without probing it first", () =>
    withTree(
      {
        "venv/lib/python3.12/site-packages/alpha-1.0.0.dist-info/entry_points.txt":
          "[agentExtensions]\nalpha = alpha:agent-extensions.json\n",
        "venv/lib/python3.12/site-packages/alpha/agent-extensions.json": recommendation,
      },
      (root) =>
        Effect.gen(function* () {
          const outcome = yield* read(root);
          const lib = nodePath.join(root, "venv/lib");
          expect(outcome.counts(lib)).toEqual({ readDirectory: 1 });
          expect(outcome.counts(nodePath.join(lib, "python3.12/site-packages"))).toEqual({
            access: 1,
            readDirectory: 1,
          });
          expect(outcome.refs).toEqual(found);
        }),
    ),
  );

  it.effect("costs one listing for a lib that is missing or a file", () =>
    withTree({ "missing/venv": "", "file/venv/lib": "not a directory" }, (root) =>
      Effect.gen(function* () {
        for (const tree of ["missing", "file"]) {
          const outcome = yield* read(nodePath.join(root, tree));
          expect(outcome.counts(nodePath.join(root, tree, "venv/lib"))).toEqual({
            readDirectory: 1,
          });
          expect(outcome.refs).toEqual(Option.none());
        }
      }),
    ),
  );
});
