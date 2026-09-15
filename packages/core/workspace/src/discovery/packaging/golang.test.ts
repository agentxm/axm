import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { golangDetector, golangReader } from "./golang.js";

const golangType = Schema.decodeUnknownSync(PackageTypeSchema)("golang");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write go.mod, run detector, clean up. */
const detectInTempDir = (goMod?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (goMod !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "go.mod"), goMod);
    }
    return yield* golangDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("golangDetector", () => {
  it("has type golang", () => {
    expect(golangDetector.type).toBe(golangType);
  });

  describe("direct dependencies extracted", () => {
    it.effect("extracts direct dependencies from require block", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = [
            "module example.com/myproject",
            "",
            "go 1.21",
            "",
            "require (",
            "\tgithub.com/gin-gonic/gin v1.9.1",
            "\tgolang.org/x/sync v0.3.0",
            ")",
          ].join("\n");
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("gin");
          expect(names).toContain("sync");
        }),
      ),
    );
  });

  describe("indirect dependencies filtered", () => {
    it.effect("excludes dependencies marked as indirect", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = [
            "module example.com/myproject",
            "",
            "go 1.21",
            "",
            "require (",
            "\tgithub.com/gin-gonic/gin v1.9.1",
            "\tgolang.org/x/text v0.14.0 // indirect",
            ")",
          ].join("\n");
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("gin");
        }),
      ),
    );
  });

  describe("single-line require directive", () => {
    it.effect("parses single-line require", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = [
            "module example.com/myproject",
            "",
            "go 1.21",
            "",
            "require github.com/stretchr/testify v1.8.4",
          ].join("\n");
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "golang",
              namespace: "github.com/stretchr",
              name: "testify",
              version: "v1.8.4",
            }),
          );
        }),
      ),
    );
  });

  describe("module path to purl mapping", () => {
    it.effect("standard module path splits namespace and name", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire github.com/gin-gonic/gin v1.9.1";
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "golang",
              namespace: "github.com/gin-gonic",
              name: "gin",
              version: "v1.9.1",
            }),
          );
        }),
      ),
    );

    it.effect("v2+ major version suffix removed", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire github.com/foo/bar/v2 v2.1.0";
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "golang",
              namespace: "github.com/foo",
              name: "bar",
              version: "v2.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("v3+ major version suffix removed", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire github.com/example/lib/v3 v3.0.0";
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "golang",
              namespace: "github.com/example",
              name: "lib",
              version: "v3.0.0",
            }),
          );
        }),
      ),
    );

    it.effect("standard library style path", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire golang.org/x/sync v0.3.0";
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "golang",
              namespace: "golang.org/x",
              name: "sync",
              version: "v0.3.0",
            }),
          );
        }),
      ),
    );

    it.effect("namespace lowercased", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire GitHub.com/Foo/Bar v1.0.0";
          const result = yield* detectInTempDir(goMod);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.namespace).toBe("github.com/foo");
          expect(result[0]?.purl.name).toBe("bar");
        }),
      ),
    );
  });

  describe("exact versions from require directives", () => {
    it.effect("exact version included", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire github.com/gin-gonic/gin v1.9.1";
          const result = yield* detectInTempDir(goMod);
          expect(result[0]?.purl.version).toBe("v1.9.1");
        }),
      ),
    );

    it.effect("pseudo-version included", () =>
      withNodeContext(
        Effect.gen(function* () {
          const goMod = "module m\nrequire golang.org/x/exp v0.0.0-20231006140011-7918f672742d";
          const result = yield* detectInTempDir(goMod);
          expect(result[0]?.purl.version).toBe("v0.0.0-20231006140011-7918f672742d");
        }),
      ),
    );
  });

  describe("missing go.mod", () => {
    it.effect("returns empty array when go.mod is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed go.mod", () => {
    it.effect("returns empty array and warns on malformed content", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{{{{ not valid go.mod content ????");
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// golang Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp GOPATH with module cache for reader tests. */
const readInTempGopath = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Set up a fake GOPATH structure
    const gopath = path.join(tmpDir, "gopath");

    if (axmJsonContent !== undefined) {
      // Reconstruct the module path from purl
      const modulePath = pkgPurl.namespace ? `${pkgPurl.namespace}/${pkgPurl.name}` : pkgPurl.name;
      const version = pkgPurl.version ?? "v0.0.0";
      const modDir = path.join(gopath, "pkg", "mod", `${modulePath}@${version}`);
      yield* fs.makeDirectory(modDir, { recursive: true });
      yield* fs.writeFileString(path.join(modDir, "axm.json"), axmJsonContent);
    }

    // Create a source file so the detector source path exists
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "go.mod"), "module m");

    const detected = {
      purl: pkgPurl,
      type: golangType,
      source: path.join(sourceDir, "go.mod"),
    };

    // Override GOPATH for this test
    const origGopath = process.env["GOPATH"];
    process.env["GOPATH"] = gopath;
    return yield* golangReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origGopath === undefined) {
            delete process.env["GOPATH"];
          } else {
            process.env["GOPATH"] = origGopath;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("golangReader", () => {
  it("has type golang", () => {
    expect(golangReader.type).toBe(golangType);
  });

  describe("valid axm.json sidecar", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/gorilla",
            name: "mux",
            version: "v1.8.1",
          });
          const result = yield* readInTempGopath(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@gorilla/skills/mux", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@gorilla/skills/mux", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/some",
            name: "lib",
            version: "v0.5.0",
          });
          const result = yield* readInTempGopath(purl, JSON.stringify({ extensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json", () => {
    it.effect("returns Option.none when axm.json does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/gin-gonic",
            name: "gin",
            version: "v1.9.1",
          });
          const result = yield* readInTempGopath(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none and warns on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/some",
            name: "lib",
            version: "v1.0.0",
          });
          const result = yield* readInTempGopath(purl, JSON.stringify({ extensions: 42 }));
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/some",
            name: "lib",
            version: "v1.0.0",
          });
          const result = yield* readInTempGopath(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
              futureField: true,
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("module path reconstruction from purl parts", () => {
    it.effect("reconstructs module path with namespace", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/gorilla",
            name: "mux",
            version: "v1.8.1",
          });
          const result = yield* readInTempGopath(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@gorilla/skills/mux", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing module cache", () => {
    it.effect("returns Option.none when module cache does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/gin-gonic",
            name: "gin",
            version: "v1.9.1",
          });
          const result = yield* readInTempGopath(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/some",
            name: "lib",
            version: "v1.0.0",
          });
          const result = yield* readInTempGopath(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("GOPATH defaults to ~/go", () => {
    it.effect("uses ~/go when GOPATH is not set", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "golang",
            namespace: "github.com/nonexistent",
            name: "pkg",
            version: "v1.0.0",
          });

          // Unset GOPATH to test default
          const origGopath = process.env["GOPATH"];
          delete process.env["GOPATH"];

          const detected = {
            purl,
            type: golangType,
            source: "/tmp/fake/go.mod",
          };

          const result = yield* golangReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origGopath === undefined) {
                  delete process.env["GOPATH"];
                } else {
                  process.env["GOPATH"] = origGopath;
                }
              }),
            ),
          );
          // Should return none since the module won't exist at ~/go
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
