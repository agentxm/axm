import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { luarocksDetector, luarocksReader } from "./luarocks.js";

const luarocksType = Schema.decodeUnknownSync(PackageTypeSchema)("luarocks");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write rockspec files, run detector, clean up. */
const detectInTempDir = (files?: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (files !== undefined) {
      for (const [name, content] of Object.entries(files)) {
        yield* fs.writeFileString(path.join(tmpDir, name), content);
      }
    }
    return yield* luarocksDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("luarocksDetector", () => {
  it("has type luarocks", () => {
    expect(luarocksDetector.type).toBe(luarocksType);
  });

  describe("dependencies from dependencies table", () => {
    it.effect("extracts dependencies from rockspec", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = [
            'package = "mylib"',
            'version = "1.0-1"',
            "dependencies = {",
            '  "luasocket >= 3.0",',
            '  "luafilesystem"',
            "}",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("luasocket");
          expect(names).toContain("luafilesystem");
        }),
      ),
    );
  });

  describe("skip Lua runtime", () => {
    it.effect("lua runtime excluded", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = [
            'package = "mylib"',
            "dependencies = {",
            '  "lua >= 5.1",',
            '  "luasocket >= 3.0"',
            "}",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("luasocket");
        }),
      ),
    );

    it.effect("only lua in dependencies returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = ['package = "mylib"', "dependencies = {", '  "lua >= 5.1"', "}"].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("exact version produces versioned purl", () => {
    it.effect("== produces versioned purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = [
            'package = "mylib"',
            "dependencies = {",
            '  "luasocket == 3.1.0-1"',
            "}",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "luarocks", name: "luasocket", version: "3.1.0-1" }),
          );
        }),
      ),
    );
  });

  describe("version range produces versionless purl", () => {
    it.effect(">= produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = [
            'package = "mylib"',
            "dependencies = {",
            '  "luasocket >= 3.0"',
            "}",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "luarocks", name: "luasocket" }));
        }),
      ),
    );
  });

  describe("no version produces versionless purl", () => {
    it.effect("bare name produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = ['package = "mylib"', "dependencies = {", '  "luafilesystem"', "}"].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "luarocks", name: "luafilesystem" }));
        }),
      ),
    );
  });

  describe("multiple rockspec files deduplicated", () => {
    it.effect("deduplicates across rockspec files", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec1 = ['package = "mylib"', 'dependencies = { "luasocket" }'].join("\n");
          const rockspec2 = ['package = "mylib"', 'dependencies = { "luasocket", "cjson" }'].join(
            "\n",
          );
          const result = yield* detectInTempDir({
            "mylib-1.0-1.rockspec": rockspec1,
            "mylib-2.0-1.rockspec": rockspec2,
          });
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("luasocket");
          expect(names).toContain("cjson");
          expect(names.filter((n) => n === "luasocket")).toHaveLength(1);
        }),
      ),
    );
  });

  describe("missing rockspec files", () => {
    it.effect("returns empty array when no rockspec files", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependencies table", () => {
    it.effect("returns empty array when no dependencies table", () =>
      withNodeContext(
        Effect.gen(function* () {
          const rockspec = [
            'package = "mylib"',
            'version = "1.0-1"',
            'rockspec_format = "3.0"',
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib-1.0-1.rockspec": rockspec });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// luarocks Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp LuaRocks tree for reader tests. */
const readInTempLuarocks = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
  location?: "system" | "user",
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const pkgName = pkgPurl.name;
    const version = pkgPurl.version ?? "0.0.0-0";

    if (axmJsonContent !== undefined) {
      if (location === "user") {
        const userTree = path.join(
          tmpDir,
          ".luarocks",
          "lib",
          "luarocks",
          "rocks-5.4",
          pkgName,
          version,
        );
        yield* fs.makeDirectory(userTree, { recursive: true });
        yield* fs.writeFileString(path.join(userTree, "axm.json"), axmJsonContent);

        // Override HOME for user tree lookup
        const origHome = process.env["HOME"];
        process.env["HOME"] = tmpDir;

        const detected = {
          purl: pkgPurl,
          type: luarocksType,
          source: path.join(tmpDir, "project", "mylib.rockspec"),
        };
        return yield* luarocksReader.read(detected).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (origHome === undefined) {
                delete process.env["HOME"];
              } else {
                process.env["HOME"] = origHome;
              }
            }),
          ),
        );
      }

      // For system location - we can't easily write to /usr/local, so test user tree
      const userTree = path.join(
        tmpDir,
        ".luarocks",
        "lib",
        "luarocks",
        "rocks-5.4",
        pkgName,
        version,
      );
      yield* fs.makeDirectory(userTree, { recursive: true });
      yield* fs.writeFileString(path.join(userTree, "axm.json"), axmJsonContent);

      const origHome = process.env["HOME"];
      process.env["HOME"] = tmpDir;

      const detected = {
        purl: pkgPurl,
        type: luarocksType,
        source: path.join(tmpDir, "project", "mylib.rockspec"),
      };
      return yield* luarocksReader.read(detected).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (origHome === undefined) {
              delete process.env["HOME"];
            } else {
              process.env["HOME"] = origHome;
            }
          }),
        ),
      );
    }

    const detected = {
      purl: pkgPurl,
      type: luarocksType,
      source: path.join(tmpDir, "project", "mylib.rockspec"),
    };
    return yield* luarocksReader.read(detected);
  }).pipe(Effect.scoped);

describe("luarocksReader", () => {
  it("has type luarocks", () => {
    expect(luarocksReader.type).toBe(luarocksType);
  });

  describe("valid axm.json sidecar", () => {
    it.effect("extracts recommendedExtensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "luarocks", name: "luasocket", version: "3.1.0" });
          const result = yield* readInTempLuarocks(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@luarocks/skills/luasocket@^1.0.0"],
            }),
            "user",
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@luarocks/skills/luasocket@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "luarocks", name: "somelib", version: "1.0.0" });
          const result = yield* readInTempLuarocks(
            purl,
            JSON.stringify({ recommendedExtensions: [] }),
            "user",
          );
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
          const purl = makePurl({ type: "luarocks", name: "luasocket", version: "3.1.0" });
          const result = yield* readInTempLuarocks(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "luarocks", name: "somelib", version: "1.0.0" });
          const result = yield* readInTempLuarocks(
            purl,
            JSON.stringify({ recommendedExtensions: 42 }),
            "user",
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "luarocks", name: "somelib", version: "1.0.0" });
          const result = yield* readInTempLuarocks(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
              futureField: true,
            }),
            "user",
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "luarocks", name: "somelib", version: "1.0.0" });
          const result = yield* readInTempLuarocks(purl, "{ not valid json }", "user");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
