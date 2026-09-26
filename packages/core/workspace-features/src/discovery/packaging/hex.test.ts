import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { hexDetector, hexReader } from "./hex.js";

const hexType = Schema.decodeUnknownSync(PackageTypeSchema)("hex");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write mix.exs and/or gleam.toml, run detector, clean up. */
const detectInTempDir = (files?: { readonly mixExs?: string; readonly gleamToml?: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (files?.mixExs !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "mix.exs"), files.mixExs);
    }
    if (files?.gleamToml !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "gleam.toml"), files.gleamToml);
    }
    return yield* hexDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("hexDetector", () => {
  it("has type hex", () => {
    expect(hexDetector.type).toBe(hexType);
  });

  describe("mix.exs dependencies", () => {
    it.effect("extracts dependencies from deps function", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defmodule MyApp.MixProject do
  use Mix.Project

  defp deps do
    [
      {:phoenix, "~> 1.7"},
      {:ecto, "~> 3.10"}
    ]
  end
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("phoenix");
          expect(names).toContain("ecto");
        }),
      ),
    );

    it.effect("exact version in mix.exs", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defp deps do
  [{:jason, "1.4.1"}]
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "hex", name: "jason", version: "1.4.1" }),
          );
        }),
      ),
    );

    it.effect("approximate range in mix.exs is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defp deps do
  [{:phoenix, "~> 1.7"}]
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hex", name: "phoenix" }));
        }),
      ),
    );

    it.effect("comparison range in mix.exs is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defp deps do
  [{:ecto, ">= 3.10.0"}]
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hex", name: "ecto" }));
        }),
      ),
    );
  });

  describe("path and git dependencies skipped", () => {
    it.effect("path dependency skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defp deps do
  [{:my_lib, path: "../my_lib"}]
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git dependency skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defp deps do
  [{:my_lib, git: "https://github.com/org/my_lib.git"}]
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("gleam.toml dependencies", () => {
    it.effect("extracts from [dependencies] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gleamToml = `
name = "my_project"
version = "1.0.0"

[dependencies]
gleam_stdlib = ">= 0.34.0 and < 2.0.0"
gleam_json = "1.0.0"
`;
          const result = yield* detectInTempDir({ gleamToml });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("gleam_stdlib");
          expect(names).toContain("gleam_json");
        }),
      ),
    );

    it.effect("extracts from [dev-dependencies] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gleamToml = `
name = "my_project"

[dev-dependencies]
gleeunit = ">= 1.0.0 and < 2.0.0"
`;
          const result = yield* detectInTempDir({ gleamToml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hex", name: "gleeunit" }));
        }),
      ),
    );

    it.effect("exact version in gleam.toml", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gleamToml = `
[dependencies]
gleam_json = "1.0.0"
`;
          const result = yield* detectInTempDir({ gleamToml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "hex", name: "gleam_json", version: "1.0.0" }),
          );
        }),
      ),
    );

    it.effect("range in gleam.toml is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gleamToml = `
[dependencies]
gleam_stdlib = ">= 0.34.0 and < 2.0.0"
`;
          const result = yield* detectInTempDir({ gleamToml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hex", name: "gleam_stdlib" }));
        }),
      ),
    );
  });

  describe("missing files", () => {
    it.effect("returns empty array when no mix.exs or gleam.toml", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no deps function in mix.exs", () => {
    it.effect("returns empty array when mix.exs has no deps", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mixExs = `
defmodule MyApp.MixProject do
  use Mix.Project

  def project do
    [app: :my_app, version: "0.1.0"]
  end
end`;
          const result = yield* detectInTempDir({ mixExs });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// hex Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with deps dir for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  opts?: {
    readonly agentExtensionsJson?: string;
    readonly hexMetadataConfig?: string;
  },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root mix.exs (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "mix.exs"), "# mix.exs");

    const pkgName = pkgPurl.name;
    const pkgDir = path.join(tmpDir, "deps", pkgName);

    if (opts?.agentExtensionsJson !== undefined || opts?.hexMetadataConfig !== undefined) {
      yield* fs.makeDirectory(pkgDir, { recursive: true });
    }

    if (opts?.agentExtensionsJson !== undefined) {
      yield* fs.writeFileString(
        path.join(pkgDir, "agent-extensions.json"),
        opts.agentExtensionsJson,
      );
    }

    if (opts?.hexMetadataConfig !== undefined) {
      yield* fs.writeFileString(path.join(pkgDir, "hex_metadata.config"), opts.hexMetadataConfig);
    }

    const detected = {
      purl: pkgPurl,
      type: hexType,
      source: path.join(tmpDir, "mix.exs"),
    };
    return yield* hexReader.read(detected);
  }).pipe(Effect.scoped);

describe("hexReader", () => {
  it("has type hex", () => {
    expect(hexReader.type).toBe(hexType);
  });

  describe("valid agent-extensions.json sidecar", () => {
    it.effect("extracts extensions from agent-extensions.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "phoenix" });
          const result = yield* readInTempDir(purl, {
            agentExtensionsJson: JSON.stringify({
              agentExtensions: [
                { ref: "@phoenixframework/skills/phoenix", versionRange: "^1.0.0" },
              ],
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@phoenixframework/skills/phoenix", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "plug" });
          const result = yield* readInTempDir(purl, {
            agentExtensionsJson: JSON.stringify({ agentExtensions: [] }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("fallback to hex_metadata.config", () => {
    it.effect("reads from hex_metadata.config extra field when no agent-extensions.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "jason" });
          const hexMeta = `{<<"name">>,<<"jason">>}.\n{<<"extra">>, [{<<"agentExtensions">>, <<"[{\\"ref\\":\\"@hex/skills/jason\\",\\"versionRange\\":\\"^1.0.0\\"}]">>}]}.`;
          const result = yield* readInTempDir(purl, { hexMetadataConfig: hexMeta });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@hex/skills/jason", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("no metadata in either location", () => {
    it.effect(
      "returns Option.none when neither agent-extensions.json nor hex_metadata has axm",
      () =>
        withNodeContext(
          Effect.gen(function* () {
            const purl = makePurl({ type: "hex", name: "telemetry" });
            const hexMeta = `{<<"name">>,<<"telemetry">>}.`;
            const result = yield* readInTempDir(purl, { hexMetadataConfig: hexMeta });
            expect(Option.isNone(result)).toBe(true);
          }),
        ),
    );
  });

  describe("missing agent-extensions.json sidecar", () => {
    it.effect("returns Option.none when no agent-extensions.json and no hex_metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "ecto" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed agent-extensions.json", () => {
    it.effect("returns Option.none and warns on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "some_lib" });
          const result = yield* readInTempDir(purl, {
            agentExtensionsJson: JSON.stringify({ agentExtensions: "not-an-array" }),
          });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in agent-extensions.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "some_lib" });
          const result = yield* readInTempDir(purl, {
            agentExtensionsJson: JSON.stringify({
              agentExtensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
              futureField: true,
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing deps directory", () => {
    it.effect("returns Option.none when deps does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "phoenix" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed JSON in agent-extensions.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hex", name: "some_lib" });
          const result = yield* readInTempDir(purl, {
            agentExtensionsJson: "{ not valid json }",
          });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
