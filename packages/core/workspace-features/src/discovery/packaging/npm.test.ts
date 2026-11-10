import { withPackagingContext } from "./test-support/context.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { npmDetector, npmReader } from "./npm.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(JSON.stringify({ dependencies: { lodash: "*" } }));
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "npm", name: "lodash" }));
        }),
      ),
    );

    it.effect(">= range is versionless", () =>
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
    it.effect("file: specifier without local metadata remains unavailable", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "file:../my-lib" } }),
          );
          expect(result).toMatchObject([
            { purl: { name: "my-lib" }, resolution: { state: "unavailable" } },
          ]);
        }),
      ),
    );

    it.effect("workspace: specifier without local metadata remains unavailable", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "workspace:*" } }),
          );
          expect(result).toMatchObject([
            { purl: { name: "my-lib" }, resolution: { state: "unavailable" } },
          ]);
        }),
      ),
    );

    it.effect("git: specifier without local metadata remains unavailable", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: {
                "my-lib": "git+https://github.com/org/my-lib.git",
              },
            }),
          );
          expect(result).toMatchObject([
            { purl: { name: "my-lib" }, resolution: { state: "unavailable" } },
          ]);
        }),
      ),
    );

    it.effect("URL specifier without local metadata remains unavailable", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              dependencies: {
                "my-lib": "https://example.com/my-lib-1.0.0.tgz",
              },
            }),
          );
          expect(result).toMatchObject([
            { purl: { name: "my-lib" }, resolution: { state: "unavailable" } },
          ]);
        }),
      ),
    );

    it.effect("link: specifier without local metadata remains unavailable", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ dependencies: { "my-lib": "link:../my-lib" } }),
          );
          expect(result).toMatchObject([
            { purl: { name: "my-lib" }, resolution: { state: "unavailable" } },
          ]);
        }),
      ),
    );
  });

  describe("peerDependencies included", () => {
    it.effect("detects peer dependencies", () =>
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed JSON", () => {
    it.effect("returns empty array and warns on malformed JSON", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{ not valid json }");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency sections", () => {
    it.effect("returns empty array when no dependency sections exist", () =>
      withPackagingContext(
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
      const manifest: unknown = JSON.parse(nodeModulesPackageJson);
      const object = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        manifest,
      );
      yield* fs.writeFileString(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ version: "1.0.0", ...object }),
      );
    }

    const detected = {
      purl: { ...pkgPurl, version: "1.0.0" },
      type: npmType,
      source: path.join(tmpDir, "package.json"),
      resolution: {
        state: "resolved" as const,
        metadataPath: path.join(
          tmpDir,
          "node_modules",
          pkgPurl.namespace ?? "",
          pkgPurl.name,
          "package.json",
        ),
      },
    };
    return yield* npmReader.read(detected);
  }).pipe(Effect.scoped);

describe("npmReader", () => {
  it("has type npm", () => {
    expect(npmReader.type).toBe(npmType);
  });

  describe("valid agentExtensions metadata", () => {
    it.effect("extracts extensions from agentExtensions field", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "next" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "next",
              agentExtensions: [{ ref: "@vercel/skills/nextjs", versionRange: "^1.0.0" }],
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
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              agentExtensions: [],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );

    it.effect("keeps valid siblings when one recommendation is malformed", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "mixed-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "mixed-lib",
              agentExtensions: [
                { ref: "not-qualified" },
                {
                  ref: "@acme/skills/review",
                  source: {
                    type: "git",
                    url: "https://github.com/acme/review.git",
                    revision: "v1.0.0",
                  },
                },
              ],
            }),
          );

          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              {
                ref: "@acme/skills/review",
                source: {
                  type: "git",
                  url: new URL("https://github.com/acme/review.git"),
                  revision: "v1.0.0",
                },
              },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing agentExtensions field", () => {
    it.effect("returns Option.none when no agentExtensions field", () =>
      withPackagingContext(
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
    it.effect("returns Option.none and warns on malformed agentExtensions metadata", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              agentExtensions: "not-an-array",
            }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in agentExtensions metadata", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "some-lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some-lib",
              agentExtensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
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

  describe("scoped package path from purl parts", () => {
    it.effect("reads from scoped package path in node_modules", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", namespace: "@angular", name: "core" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "@angular/core",
              agentExtensions: [{ ref: "@angular/skills/angular", versionRange: "^1.0.0" }],
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
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "npm", name: "react" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
  it.effect("refuses metadata that changed identity after dependency resolution", () =>
    withPackagingContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const metadataPath = path.join(root, "node_modules/react/package.json");
        yield* fs.makeDirectory(path.dirname(metadataPath), { recursive: true });
        yield* fs.writeFileString(
          path.join(root, "package.json"),
          JSON.stringify({ dependencies: { react: "^18" } }),
        );
        yield* fs.writeFileString(
          metadataPath,
          JSON.stringify({ name: "react", version: "18.3.1" }),
        );
        const detected = yield* npmDetector.detect(root);
        const observed = detected[0];
        expect(observed).toMatchObject({
          purl: { name: "react", version: "18.3.1" },
          declaration: { name: "react", specifier: "^18" },
          source: path.join(root, "package.json"),
          resolution: { state: "resolved", metadataPath },
        });
        if (observed === undefined) throw new Error("Expected an observed dependency");
        yield* fs.writeFileString(
          metadataPath,
          JSON.stringify({
            name: "react",
            version: "19.0.0",
            agentExtensions: [{ ref: "@acme/skills/unrelated" }],
          }),
        );
        expect(Option.isNone(yield* npmReader.read(observed))).toBe(true);
      }).pipe(Effect.scoped),
    ),
  );
});
