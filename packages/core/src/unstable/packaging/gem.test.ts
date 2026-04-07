import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { gemDetector, gemReader } from "./gem.js";

const gemType = Schema.decodeUnknownSync(PackageTypeSchema)("gem");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write Gemfile and/or gemspec, run detector, clean up. */
const detectInTempDir = (opts?: {
  readonly gemfile?: string;
  readonly gemspecs?: ReadonlyArray<{ readonly name: string; readonly content: string }>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (opts?.gemfile !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "Gemfile"), opts.gemfile);
    }
    if (opts?.gemspecs !== undefined) {
      for (const spec of opts.gemspecs) {
        yield* fs.writeFileString(path.join(tmpDir, spec.name), spec.content);
      }
    }
    return yield* gemDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("gemDetector", () => {
  it("has type gem", () => {
    expect(gemDetector.type).toBe(gemType);
  });

  describe("Gemfile gem directives extracted", () => {
    it.effect("extracts gem directives from Gemfile", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = [
            "source 'https://rubygems.org'",
            "",
            "gem 'rails', '~> 7.0'",
            "gem 'puma', '>= 5.0'",
          ].join("\n");
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("rails");
          expect(names).toContain("puma");
        }),
      ),
    );

    it.effect("parses double-quoted gem names", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = 'gem "sidekiq"';
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("sidekiq");
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version pin includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'puma', '5.6.7'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "gem", name: "puma", version: "5.6.7" }),
          );
        }),
      ),
    );
  });

  describe("ranges produce versionless purls", () => {
    it.effect("pessimistic constraint is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'rails', '~> 7.0'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "gem", name: "rails" }));
        }),
      ),
    );

    it.effect(">= constraint is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'puma', '>= 5.0'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "gem", name: "puma" }));
        }),
      ),
    );

    it.effect("no version specified is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'sidekiq'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "gem", name: "sidekiq" }));
        }),
      ),
    );
  });

  describe("gemspec dependencies", () => {
    it.effect("add_dependency extracted", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemspec = [
            "Gem::Specification.new do |spec|",
            '  spec.add_dependency "nokogiri", "~> 1.15"',
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({
            gemspecs: [{ name: "test.gemspec", content: gemspec }],
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("nokogiri");
        }),
      ),
    );

    it.effect("add_runtime_dependency extracted", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemspec = [
            "Gem::Specification.new do |spec|",
            '  spec.add_runtime_dependency "faraday", ">= 1.0"',
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({
            gemspecs: [{ name: "test.gemspec", content: gemspec }],
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("faraday");
        }),
      ),
    );

    it.effect("add_development_dependency extracted", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemspec = [
            "Gem::Specification.new do |spec|",
            '  spec.add_development_dependency "rspec", "~> 3.0"',
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({
            gemspecs: [{ name: "test.gemspec", content: gemspec }],
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("rspec");
        }),
      ),
    );
  });

  describe("deduplication across Gemfile and gemspec", () => {
    it.effect("produces only one purl for duplicate gem", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'nokogiri'";
          const gemspec = [
            "Gem::Specification.new do |spec|",
            '  spec.add_dependency "nokogiri"',
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({
            gemfile,
            gemspecs: [{ name: "test.gemspec", content: gemspec }],
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("nokogiri");
        }),
      ),
    );
  });

  describe("path and git dependencies skipped", () => {
    it.effect("path dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'my-lib', path: '../my-lib'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'my-lib', git: 'https://github.com/org/my-lib'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("github shorthand is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gemfile = "gem 'my-lib', github: 'org/my-lib'";
          const result = yield* detectInTempDir({ gemfile });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing files", () => {
    it.effect("returns empty array when Gemfile is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when no gemspec files exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// gem Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp gem directory with gemspec for reader tests. */
const readInTempGemDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  gemspecContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Set up a fake gem directory structure
    const gemDir = path.join(tmpDir, "gems");

    if (gemspecContent !== undefined) {
      const specsDir = path.join(gemDir, "specifications");
      yield* fs.makeDirectory(specsDir, { recursive: true });

      const version = pkgPurl.version ?? "1.0.0";
      const gemspecPath = path.join(specsDir, `${pkgPurl.name}-${version}.gemspec`);
      yield* fs.writeFileString(gemspecPath, gemspecContent);
    }

    const detected = {
      purl: pkgPurl,
      type: gemType,
      source: path.join(tmpDir, "Gemfile"),
    };

    // Override GEM_HOME for this test
    const origGemHome = process.env["GEM_HOME"];
    process.env["GEM_HOME"] = gemDir;

    return yield* gemReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origGemHome === undefined) {
            delete process.env["GEM_HOME"];
          } else {
            process.env["GEM_HOME"] = origGemHome;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("gemReader", () => {
  it("has type gem", () => {
    expect(gemReader.type).toBe(gemType);
  });

  describe("valid axm metadata in gemspec", () => {
    it.effect("extracts recommendedExtensions from axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "rails", version: "7.1.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "rails"',
            '  s.version = "7.1.0"',
            "  s.metadata = {",
            '    "axm_recommended_extensions" => "[@rails/skills/rails@^1.0.0]"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@rails/skills/rails@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "some-gem", version: "1.0.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "some-gem"',
            "  s.metadata = {",
            '    "axm_recommended_extensions" => "[]"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm metadata", () => {
    it.effect("returns Option.none when no axm keys in gemspec", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "nokogiri", version: "1.15.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "nokogiri"',
            '  s.version = "1.15.0"',
            "  s.metadata = {",
            '    "rubygems_mfa_required" => "true"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing gemspec", () => {
    it.effect("returns Option.none when gemspec does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "nonexistent", version: "1.0.0" });
          const result = yield* readInTempGemDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none on unparseable axm metadata value", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "bad-gem", version: "1.0.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "bad-gem"',
            "  s.metadata = {",
            '    "axm_recommended_extensions" => "not-a-valid-value"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra axm-prefixed keys tolerated", () => {
    it.effect("ignores extra axm keys", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "some-gem", version: "1.0.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "some-gem"',
            "  s.metadata = {",
            '    "axm_recommended_extensions" => "[@acme/skills/foo@^1.0.0]",',
            '    "axm_future_field" => "true"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("multiple recommended extensions", () => {
    it.effect("parses multiple extensions from metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "gem", name: "some-gem", version: "1.0.0" });
          const gemspecContent = [
            "Gem::Specification.new do |s|",
            '  s.name = "some-gem"',
            "  s.metadata = {",
            '    "axm_recommended_extensions" => "[@acme/skills/foo@^1.0.0, @acme/skills/bar@^2.0.0]"',
            "  }",
            "end",
          ].join("\n");
          const result = yield* readInTempGemDir(purl, gemspecContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0", "@acme/skills/bar@^2.0.0"]);
          }
        }),
      ),
    );
  });
});
