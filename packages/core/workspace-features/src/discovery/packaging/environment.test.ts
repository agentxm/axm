import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { readLocalRecommendations } from "./read.js";
import { bazelReader } from "./bazel.js";
import { cargoReader } from "./cargo.js";
import { conanReader } from "./conan.js";
import { condaReader } from "./conda.js";
import { cpanReader } from "./cpan.js";
import { cranReader } from "./cran.js";
import { gemReader } from "./gem.js";
import { golangReader } from "./golang.js";
import { huggingfaceReader } from "./huggingface.js";
import { denoReader } from "./jsr.js";
import { nugetReader } from "./nuget.js";
import { pypiReader } from "./pypi.js";

const readers = [
  bazelReader,
  cargoReader,
  conanReader,
  condaReader,
  cpanReader,
  cranReader,
  gemReader,
  golangReader,
  huggingfaceReader,
  denoReader,
  nugetReader,
  pypiReader,
];
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

describe("package recommendation configuration", () => {
  it.effect.each(readers)(
    "preserves $type configuration failure without probing fallback storage",
    (reader) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const probes: string[] = [];
        const sourceError = new ConfigProvider.SourceError({
          message: "configuration unavailable",
        });
        const observedFs = {
          ...fs,
          exists: (path: string) =>
            Effect.sync(() => {
              probes.push(path);
              return false;
            }),
          readDirectory: (path: string) =>
            Effect.sync(() => {
              probes.push(path);
              return [];
            }),
          readFileString: (path: string) =>
            Effect.sync(() => {
              probes.push(path);
              return "";
            }),
        } satisfies FileSystem.FileSystem;
        const failure = yield* readLocalRecommendations(
          [
            {
              type: reader.type,
              purl: makePurl({
                type: reader.type,
                namespace: "acme",
                name: "example",
                version: "1.0.0",
              }),
              source: "/project/manifest",
            },
          ],
          [reader],
        ).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, observedFs),
              ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
            ),
          ),
          Effect.flip,
        );
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
        expect(probes).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses the injected package root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const probes: string[] = [];
      yield* nugetReader
        .read({
          type: nugetReader.type,
          purl: makePurl({ type: "nuget", name: "Example", version: "1.0.0" }),
          source: "/project/packages.config",
        })
        .pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(FileSystem.FileSystem, {
                ...fs,
                readFileString: (path: string) =>
                  Effect.sync(() => {
                    probes.push(path);
                    return "{}";
                  }),
              }),
              ConfigProvider.layer(
                ConfigProvider.fromEnv({ env: { NUGET_PACKAGES: "/injected/packages" } }),
              ),
            ),
          ),
        );
      expect(probes).toEqual(["/injected/packages/example/1.0.0/agent-extensions.json"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
