import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { cargoDetector, cargoReader } from "./cargo.js";

const cargoType = Schema.decodeUnknownSync(PackageTypeSchema)("cargo");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write Cargo.toml, run detector, clean up. */
const detectInTempDir = (cargoToml?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (cargoToml !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "Cargo.toml"), cargoToml);
    }
    return yield* cargoDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("cargoDetector", () => {
  it("has type cargo", () => {
    expect(cargoDetector.type).toBe(cargoType);
  });

  describe("dependencies from all sections", () => {
    it.effect("collects from dependencies, dev-dependencies, and build-dependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = [
            "[package]",
            'name = "my-project"',
            'version = "0.1.0"',
            "",
            "[dependencies]",
            'serde = "1.0"',
            "",
            "[dev-dependencies]",
            'tokio-test = "0.4"',
            "",
            "[build-dependencies]",
            'cc = "1.0"',
          ].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("serde");
          expect(names).toContain("tokio-test");
          expect(names).toContain("cc");
        }),
      ),
    );
  });

  describe("shorthand string version", () => {
    it.effect("shorthand string parsed", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = "1.0.193"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );
  });

  describe("inline table with version", () => {
    it.effect("inline table parsed", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = [
            "[dependencies]",
            'serde = { version = "1.0", features = ["derive"] }',
          ].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );
  });

  describe("case-sensitive name preserved", () => {
    it.effect("preserves case of crate name", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'OpenSSL = "0.10"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("OpenSSL");
        }),
      ),
    );
  });

  describe("exact version produces versioned purl", () => {
    it.effect("exact version pin includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = "=1.0.193"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "cargo", name: "serde", version: "1.0.193" }),
          );
        }),
      ),
    );
  });

  describe("ranges produce versionless purls", () => {
    it.effect("caret range (bare version) is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = "1.0"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );

    it.effect("tilde range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = "~1.0.0"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );

    it.effect("wildcard is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = "*"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );

    it.effect(">= range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'serde = ">=1.0.0"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cargo", name: "serde" }));
        }),
      ),
    );
  });

  describe("renamed dependencies use real package name", () => {
    it.effect("renamed dependency uses package key", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = [
            "[dependencies]",
            'my-serde = { package = "serde", version = "1.0" }',
          ].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("serde");
        }),
      ),
    );

    it.effect("unrenamed dependency uses key name", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'tokio = { version = "1.0" }'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("tokio");
        }),
      ),
    );
  });

  describe("path and git dependencies skipped", () => {
    it.effect("path dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[dependencies]", 'my-lib = { path = "../my-lib" }'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = [
            "[dependencies]",
            'my-lib = { git = "https://github.com/org/my-lib" }',
          ].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git dependency with version still skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = [
            "[dependencies]",
            'my-lib = { git = "https://github.com/org/my-lib", version = "1.0" }',
          ].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing Cargo.toml", () => {
    it.effect("returns empty array when Cargo.toml is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed Cargo.toml", () => {
    it.effect("returns empty array and warns on malformed content", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{{{{ not valid TOML content ????");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency sections", () => {
    it.effect("returns empty array when no dependency sections exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cargoToml = ["[package]", 'name = "my-project"', 'version = "0.1.0"'].join("\n");
          const result = yield* detectInTempDir(cargoToml);
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// cargo Reader tests
// ──────────────────────────────────────────────────────────────────

/**
 * Helper to set up a temp CARGO_HOME with registry cache for reader tests.
 *
 * `cargoTomlContent`, when provided, is written to
 * `<CARGO_HOME>/registry/src/index.crates.io-mock/<crate>-<version>/Cargo.toml`.
 * Pass a full Cargo.toml (or just the `[package.metadata.axm]` table) — the
 * reader scans for the section header.
 */
const readInTempCargoHome = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  cargoTomlContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Set up a fake CARGO_HOME structure
    const cargoHome = path.join(tmpDir, "cargo-home");

    if (cargoTomlContent !== undefined) {
      // Reconstruct the crate directory path
      const crateName = pkgPurl.name;
      const version = pkgPurl.version ?? "0.0.0";
      const crateDir = path.join(
        cargoHome,
        "registry",
        "src",
        "index.crates.io-mock",
        `${crateName}-${version}`,
      );
      yield* fs.makeDirectory(crateDir, { recursive: true });
      yield* fs.writeFileString(path.join(crateDir, "Cargo.toml"), cargoTomlContent);
    }

    // Create a source file so the detector source path exists
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(
      path.join(sourceDir, "Cargo.toml"),
      '[package]\nname = "test"\nversion = "0.1.0"',
    );

    const detected = {
      purl: pkgPurl,
      type: cargoType,
      source: path.join(sourceDir, "Cargo.toml"),
    };

    // Override CARGO_HOME for this test
    const origCargoHome = process.env["CARGO_HOME"];
    process.env["CARGO_HOME"] = cargoHome;
    return yield* cargoReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origCargoHome === undefined) {
            delete process.env["CARGO_HOME"];
          } else {
            process.env["CARGO_HOME"] = origCargoHome;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("cargoReader", () => {
  it("has type cargo", () => {
    expect(cargoReader.type).toBe(cargoType);
  });

  describe("valid [package.metadata.axm] in Cargo.toml", () => {
    it.effect("extracts extensions from [package.metadata.axm]", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.193" });
          const result = yield* readInTempCargoHome(
            purl,
            [
              "[package]",
              'name = "serde"',
              'version = "1.0.193"',
              "",
              "[package.metadata.axm]",
              'extensions = [{ ref = "@serde/skills/serde", versionRange = "^1.0.0" }]',
            ].join("\n"),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@serde/skills/serde", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.0" });
          const result = yield* readInTempCargoHome(
            purl,
            ["[package.metadata.axm]", "extensions = []"].join("\n"),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );

    it.effect("extracts extensions from cargo-normalized array-of-tables", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.193" });
          const result = yield* readInTempCargoHome(
            purl,
            [
              "[package]",
              'name = "serde"',
              'version = "1.0.193"',
              "",
              "[[package.metadata.axm.extensions]]",
              'ref = "@serde/skills/serde"',
              'versionRange = "^1.0.0"',
              "",
              "[[package.metadata.axm.extensions]]",
              'ref = "@serde/packs/serde"',
            ].join("\n"),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@serde/skills/serde", versionRange: "^1.0.0" },
              { ref: "@serde/packs/serde" },
            ]);
          }
        }),
      ),
    );

    it.effect("stops parsing at the next section header", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.0" });
          const result = yield* readInTempCargoHome(
            purl,
            [
              "[package.metadata.axm]",
              'extensions = [{ ref = "@serde/skills/serde", versionRange = "^1.0.0" }]',
              "",
              "[package.metadata.other-tool]",
              'extensions = ["should-be-ignored"]',
            ].join("\n"),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@serde/skills/serde", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing [package.metadata.axm]", () => {
    it.effect("returns Option.none when Cargo.toml has no axm section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "tokio", version: "1.0.0" });
          const result = yield* readInTempCargoHome(
            purl,
            ["[package]", 'name = "tokio"', 'version = "1.0.0"'].join("\n"),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns Option.none when Cargo.toml does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "tokio", version: "1.0.0" });
          const result = yield* readInTempCargoHome(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm metadata", () => {
    it.effect("returns Option.none and warns on schema validation failure", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.0" });
          const result = yield* readInTempCargoHome(
            purl,
            ["[package.metadata.axm]", "extensions = 42"].join("\n"),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores unknown keys in [package.metadata.axm]", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "serde", version: "1.0.0" });
          const result = yield* readInTempCargoHome(
            purl,
            [
              "[package.metadata.axm]",
              'extensions = [{ ref = "@acme/skills/foo", versionRange = "^1.0.0" }]',
              "futureField = true",
            ].join("\n"),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing registry cache", () => {
    it.effect("returns Option.none when registry cache does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "nonexistent", version: "1.0.0" });
          const result = yield* readInTempCargoHome(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("CARGO_HOME defaults to ~/.cargo", () => {
    it.effect("uses ~/.cargo when CARGO_HOME is not set", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cargo", name: "nonexistent", version: "1.0.0" });

          // Unset CARGO_HOME to test default
          const origCargoHome = process.env["CARGO_HOME"];
          delete process.env["CARGO_HOME"];

          const detected = {
            purl,
            type: cargoType,
            source: "/tmp/fake/Cargo.toml",
          };

          const result = yield* cargoReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origCargoHome === undefined) {
                  delete process.env["CARGO_HOME"];
                } else {
                  process.env["CARGO_HOME"] = origCargoHome;
                }
              }),
            ),
          );
          // Should return none since the crate won't exist at ~/.cargo
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
