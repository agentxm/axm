import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { npmDetector, npmReader } from "./npm.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write package.json, run detector, clean up. */
const detectInTempDir = (packageJson?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (packageJson !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "package.json"), packageJson);
    }
    return yield* npmDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("npmDetector", () => {
  it("has type npm", () => {
    expect(npmDetector.type).toBe(npmType);
  });

  describe("exact version produces versioned purl", () => {
    it.effect("exact version includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { react: "18.2.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "npm", name: "react", version: "18.2.0" }),
          );
        }),
      ),
    );
  });

  describe("semver ranges produce versionless purls", () => {
    it.effect("caret range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { react: "^18.2.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "react" }));
        }),
      ),
    );

    it.effect("tilde range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { lodash: "~4.17.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "lodash" }));
        }),
      ),
    );

    it.effect("star range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(JSON.stringify({ dependencies: { lodash: "*" } }));
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "lodash" }));
        }),
      ),
    );

    it.effect(">= range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { react: ">=17.0.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "react" }));
        }),
      ),
    );
  });

  describe("scoped packages", () => {
    it.effect("scoped package has namespace and name", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "@angular/core": "^17.0.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "npm", namespace: "@angular", name: "core" }),
          );
        }),
      ),
    );

    it.effect("deeply scoped package", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: { "@babel/plugin-transform-runtime": "^7.0.0" },
            }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "npm", namespace: "@babel", name: "plugin-transform-runtime" }),
          );
        }),
      ),
    );
  });

  describe("npm aliases resolve to real package", () => {
    it.effect("aliased dependency resolves to real package name", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "lodash-es": "npm:lodash@^4.17.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "lodash" }));
        }),
      ),
    );

    it.effect("aliased dependency with exact version", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "lodash-es": "npm:lodash@4.17.21" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "npm", name: "lodash", version: "4.17.21" }),
          );
        }),
      ),
    );

    it.effect("aliased scoped dependency", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: { "my-react": "npm:@preact/compat@^10.0.0" },
            }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "npm", namespace: "@preact", name: "compat" }),
          );
        }),
      ),
    );
  });

  describe("skipped specifiers", () => {
    it.effect("file: specifier is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "file:../my-lib" } }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("workspace: specifier is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "workspace:*" } }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git: specifier is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: {
                "my-lib": "git+https://github.com/org/my-lib.git",
              },
            }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("URL specifier is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: {
                "my-lib": "https://example.com/my-lib-1.0.0.tgz",
              },
            }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("link: specifier is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "link:../my-lib" } }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("peerDependencies included", () => {
    it.effect("detects peer dependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ peerDependencies: { react: ">=17.0.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "react" }));
        }),
      ),
    );
  });

  describe("dependencies from all sections", () => {
    it.effect("collects from dependencies, devDependencies, and peerDependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: { react: "^18.2.0" },
              devDependencies: { vitest: "^1.0.0" },
              peerDependencies: { "react-dom": "^18.0.0" },
            }),
          );
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("react");
          expect(names).toContain("vitest");
          expect(names).toContain("react-dom");
        }),
      ),
    );
  });

  describe("missing package.json", () => {
    it.effect("returns empty array when package.json is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed JSON", () => {
    it.effect("returns empty array and warns on malformed JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{ not valid json }");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency sections", () => {
    it.effect("returns empty array when no dependency sections exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ name: "my-package", version: "1.0.0" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// npm Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with node_modules for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  nodeModulesPackageJson?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root package.json (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "package.json"), "{}");

    if (nodeModulesPackageJson !== undefined) {
      // Reconstruct the node_modules path from purl
      const pkgName = pkgPurl.namespace ? `${pkgPurl.namespace}/${pkgPurl.name}` : pkgPurl.name;
      const pkgDir = path.join(tmpDir, "node_modules", pkgName);
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, "package.json"), nodeModulesPackageJson);
    }

    const detected = {
      purl: pkgPurl,
      type: npmType,
      source: path.join(tmpDir, "package.json"),
    };
    return yield* npmReader.read(detected);
  }).pipe(Effect.scoped);

describe("npmReader", () => {
  it("has type npm", () => {
    expect(npmReader.type).toBe(npmType);
  });

  describe("valid axm metadata", () => {
    it.effect("extracts extensions from axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "next" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "next",
              axm: {
                extensions: [{ ref: "@vercel/skills/nextjs", versionRange: "^1.0.0" }],
              },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@vercel/skills/nextjs", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              axm: { extensions: [] },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm field", () => {
    it.effect("returns Option.none when no axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "react" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({ name: "react", version: "18.2.0" }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none and warns on malformed axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              axm: { extensions: "not-an-array" },
            }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              axm: {
                extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
                futureField: true,
              },
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

  describe("scoped package path from purl parts", () => {
    it.effect("reads from scoped package path in node_modules", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", namespace: "@angular", name: "core" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "@angular/core",
              axm: {
                extensions: [{ ref: "@angular/skills/angular", versionRange: "^1.0.0" }],
              },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@angular/skills/angular", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing node_modules", () => {
    it.effect("returns Option.none when node_modules does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "react" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
