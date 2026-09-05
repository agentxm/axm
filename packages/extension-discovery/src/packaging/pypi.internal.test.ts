/**
 * Unit tests for pypi detector and reader.
 *
 * @packageDocumentation
 */

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { pypiDetector, pypiReader } from "./pypi.js";

const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");
const encodePurl = Schema.encodeSync(PackageUrlSchema);

const TestLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const withTestLayer = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(TestLayer));

/** Create a temporary project directory with given files. */
const withProjectDir = <A, E>(
  files: Record<string, string>,
  fn: (dir: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(tmpDir, name);
      const dir = path.dirname(filePath);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(filePath, content);
    }
    return yield* fn(tmpDir);
  }).pipe(Effect.scoped);

// ---------------------------------------------------------------------------
// Detector tests
// ---------------------------------------------------------------------------

describe("pypiDetector", () => {
  it.effect("has type pypi", () => Effect.succeed(expect(pypiDetector.type).toBe(pypiType)));

  // --- pyproject.toml ---

  it.effect("parses pyproject.toml [project] dependencies", () =>
    withTestLayer(
      withProjectDir(
        {
          "pyproject.toml": ["[project]", 'dependencies = ["django>=4.0", "requests"]'].join("\n"),
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("django");
            expect(names).toContain("requests");
          }),
      ),
    ),
  );

  it.effect("parses pyproject.toml [project.optional-dependencies]", () =>
    withTestLayer(
      withProjectDir(
        {
          "pyproject.toml": [
            "[project.optional-dependencies]",
            'dev = ["pytest>=7.0", "black"]',
          ].join("\n"),
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("pytest");
            expect(names).toContain("black");
          }),
      ),
    ),
  );

  // --- requirements.txt ---

  it.effect("parses requirements.txt one-per-line", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "flask>=2.0\nrequests==2.31.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const flask = result.find((p) => p.purl.name === "flask");
            const requests = result.find((p) => p.purl.name === "requests");
            expect(flask).toBeDefined();
            expect(flask?.purl.version).toBeUndefined();
            expect(requests).toBeDefined();
            expect(requests?.purl.version).toBe("2.31.0");
          }),
      ),
    ),
  );

  it.effect("follows -r include directives in requirements.txt", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "-r requirements-dev.txt\nflask>=2.0\n",
          "requirements-dev.txt": "pytest>=7.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("flask");
            expect(names).toContain("pytest");
          }),
      ),
    ),
  );

  it.effect("warns and continues when -r include target is missing", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "-r missing.txt\nflask>=2.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("flask");
            expect(names).not.toContain("missing");
          }),
      ),
    ),
  );

  // --- setup.cfg ---

  it.effect("parses setup.cfg [options] install_requires", () =>
    withTestLayer(
      withProjectDir(
        {
          "setup.cfg": [
            "[options]",
            "install_requires =",
            "    sqlalchemy>=2.0",
            "    alembic",
          ].join("\n"),
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("sqlalchemy");
            expect(names).toContain("alembic");
          }),
      ),
    ),
  );

  // --- Pipfile ---

  it.effect("parses Pipfile [packages]", () =>
    withTestLayer(
      withProjectDir(
        {
          Pipfile: ["[packages]", 'django = ">=4.0"', 'requests = "*"'].join("\n"),
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("django");
            expect(names).toContain("requests");
          }),
      ),
    ),
  );

  // --- Name normalization ---

  it.effect("normalizes mixed case to lowercase", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "Flask\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.name).toBe("flask");
            const first = result[0];
            expect(first).toBeDefined();
            if (first !== undefined) {
              expect(encodePurl(first.purl)).toBe("pkg:pypi/flask");
            }
          }),
      ),
    ),
  );

  it.effect("normalizes underscores to dashes", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "Flask_RESTful\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.name).toBe("flask-restful");
          }),
      ),
    ),
  );

  it.effect("normalizes dots to dashes", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "zope.interface\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.name).toBe("zope-interface");
          }),
      ),
    ),
  );

  // --- Version handling ---

  it.effect("exact pin (==) produces versioned purl", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "requests==2.31.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.version).toBe("2.31.0");
          }),
      ),
    ),
  );

  it.effect("range (>=) produces versionless purl", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "django>=4.0,<5.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.version).toBeUndefined();
          }),
      ),
    ),
  );

  it.effect("compatible release (~=) produces versionless purl", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "flask~=2.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.version).toBeUndefined();
          }),
      ),
    ),
  );

  it.effect("wildcard pin (==1.24.*) produces versionless purl", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "numpy==1.24.*\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.version).toBeUndefined();
          }),
      ),
    ),
  );

  it.effect("no version specifier produces versionless purl", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "requests\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.version).toBeUndefined();
          }),
      ),
    ),
  );

  // --- Deduplication ---

  it.effect("deduplicates across files", () =>
    withTestLayer(
      withProjectDir(
        {
          "pyproject.toml": ["[project]", 'dependencies = ["requests>=2.0"]'].join("\n"),
          "requirements.txt": "requests==2.31.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            const requestsPkgs = result.filter((p) => p.purl.name === "requests");
            // First occurrence wins (pyproject.toml has priority)
            expect(requestsPkgs).toHaveLength(1);
          }),
      ),
    ),
  );

  // --- Missing files ---

  it.effect("returns empty array when no Python files present", () =>
    withTestLayer(
      withProjectDir({}, (dir) =>
        Effect.gen(function* () {
          const result = yield* pypiDetector.detect(dir);
          expect(result).toEqual([]);
        }),
      ),
    ),
  );

  // --- Malformed files ---

  it.effect("warns and skips malformed pyproject.toml", () =>
    withTestLayer(
      withProjectDir(
        {
          "pyproject.toml": "this is not valid toml {{{",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result).toEqual([]);
          }),
      ),
    ),
  );

  // --- Comments and blank lines ---

  it.effect("ignores comments and blank lines in requirements.txt", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": [
            "# this is a comment",
            "",
            "flask>=2.0",
            "  # another comment",
            "requests",
          ].join("\n"),
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result).toHaveLength(2);
            const names = result.map((p) => p.purl.name);
            expect(names).toContain("flask");
            expect(names).toContain("requests");
          }),
      ),
    ),
  );

  // --- Extras stripped ---

  it.effect("strips extras from dependency specifiers", () =>
    withTestLayer(
      withProjectDir(
        {
          "requirements.txt": "requests[security]==2.31.0\n",
        },
        (dir) =>
          Effect.gen(function* () {
            const result = yield* pypiDetector.detect(dir);
            expect(result[0]?.purl.name).toBe("requests");
            expect(result[0]?.purl.version).toBe("2.31.0");
          }),
      ),
    ),
  );
});

// ---------------------------------------------------------------------------
// Reader tests
// ---------------------------------------------------------------------------

describe("pypiReader", () => {
  it.effect("has type pypi", () => Effect.succeed(expect(pypiReader.type).toBe(pypiType)));

  it.effect("returns Option.none when no .dist-info directory exists", () =>
    withTestLayer(
      withProjectDir({}, (_dir) =>
        Effect.gen(function* () {
          const pkg = {
            purl: {
              type: pypiType,
              name: "nonexistent",
              version: "1.0.0",
            },
            type: pypiType,
            source: "requirements.txt",
          };
          // Set VIRTUAL_ENV to our temp dir so reader looks there
          const result = yield* pypiReader
            .read(pkg)
            .pipe(
              Effect.provideService(FileSystem.FileSystem, yield* FileSystem.FileSystem),
              Effect.provideService(Path.Path, yield* Path.Path),
            );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    ),
  );

  it.effect("reads axm.json via entry_points.txt [axm] group", () =>
    withTestLayer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tmpDir = yield* fs.makeTempDirectoryScoped();

        // Create site-packages structure
        const sitePackages = path.join(tmpDir, "lib", "python3.11", "site-packages");
        const distInfo = path.join(sitePackages, "django-4.2.0.dist-info");
        const pkgData = path.join(sitePackages, "django");

        yield* fs.makeDirectory(distInfo, { recursive: true });
        yield* fs.makeDirectory(pkgData, { recursive: true });

        // Write entry_points.txt with [axm] group
        yield* fs.writeFileString(
          path.join(distInfo, "entry_points.txt"),
          "[axm]\nmetadata = django:axm.json\n",
        );

        // Write axm.json in the package data dir
        yield* fs.writeFileString(
          path.join(pkgData, "axm.json"),
          JSON.stringify({
            extensions: [{ ref: "@django/skills/django", versionRange: "^1.0.0" }],
          }),
        );

        // Write RECORD so we can find the package
        yield* fs.writeFileString(
          path.join(distInfo, "RECORD"),
          "django/axm.json,sha256=abc,123\n",
        );

        const pkg = {
          purl: { type: pypiType, name: "django", version: "4.2.0" },
          type: pypiType,
          source: "pyproject.toml",
        };

        const origVirtualEnv = process.env["VIRTUAL_ENV"];
        process.env["VIRTUAL_ENV"] = tmpDir;
        try {
          const result = yield* pypiReader.read(pkg);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@django/skills/django", versionRange: "^1.0.0" },
            ]);
          }
        } finally {
          if (origVirtualEnv === undefined) {
            delete process.env["VIRTUAL_ENV"];
          } else {
            process.env["VIRTUAL_ENV"] = origVirtualEnv;
          }
        }
      }).pipe(Effect.scoped),
    ),
  );

  it.effect("returns recommendations from .dist-info with [axm] entry point", () =>
    withTestLayer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tmpDir = yield* fs.makeTempDirectoryScoped();

        // Create site-packages structure
        const sitePackages = path.join(tmpDir, "lib", "python3.11", "site-packages");
        const distInfo = path.join(sitePackages, "django-4.2.0.dist-info");
        const pkgData = path.join(sitePackages, "django");

        yield* fs.makeDirectory(distInfo, { recursive: true });
        yield* fs.makeDirectory(pkgData, { recursive: true });

        yield* fs.writeFileString(
          path.join(distInfo, "entry_points.txt"),
          "[axm]\nmetadata = django:axm.json\n",
        );

        yield* fs.writeFileString(
          path.join(pkgData, "axm.json"),
          JSON.stringify({
            extensions: [{ ref: "@django/skills/django", versionRange: "^1.0.0" }],
          }),
        );

        yield* fs.writeFileString(
          path.join(distInfo, "RECORD"),
          "django/axm.json,sha256=abc,123\n",
        );

        const pkg = {
          purl: { type: pypiType, name: "django", version: "4.2.0" },
          type: pypiType,
          source: "pyproject.toml",
        };

        // Override VIRTUAL_ENV for this test
        const origVirtualEnv = process.env["VIRTUAL_ENV"];
        process.env["VIRTUAL_ENV"] = tmpDir;
        try {
          const result = yield* pypiReader.read(pkg);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@django/skills/django", versionRange: "^1.0.0" },
            ]);
          }
        } finally {
          if (origVirtualEnv === undefined) {
            delete process.env["VIRTUAL_ENV"];
          } else {
            process.env["VIRTUAL_ENV"] = origVirtualEnv;
          }
        }
      }).pipe(Effect.scoped),
    ),
  );

  it.effect("returns Option.none when entry_points.txt has no [axm] group", () =>
    withTestLayer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tmpDir = yield* fs.makeTempDirectoryScoped();

        const sitePackages = path.join(tmpDir, "lib", "python3.11", "site-packages");
        const distInfo = path.join(sitePackages, "requests-2.31.0.dist-info");

        yield* fs.makeDirectory(distInfo, { recursive: true });

        yield* fs.writeFileString(
          path.join(distInfo, "entry_points.txt"),
          "[console_scripts]\nsome-cmd = requests.cli:main\n",
        );

        const pkg = {
          purl: {
            type: pypiType,
            name: "requests",
            version: "2.31.0",
          },
          type: pypiType,
          source: "requirements.txt",
        };

        const origVirtualEnv = process.env["VIRTUAL_ENV"];
        process.env["VIRTUAL_ENV"] = tmpDir;
        try {
          const result = yield* pypiReader.read(pkg);
          expect(Option.isNone(result)).toBe(true);
        } finally {
          if (origVirtualEnv === undefined) {
            delete process.env["VIRTUAL_ENV"];
          } else {
            process.env["VIRTUAL_ENV"] = origVirtualEnv;
          }
        }
      }).pipe(Effect.scoped),
    ),
  );

  it.effect("returns Option.none when axm.json is malformed", () =>
    withTestLayer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tmpDir = yield* fs.makeTempDirectoryScoped();

        const sitePackages = path.join(tmpDir, "lib", "python3.11", "site-packages");
        const distInfo = path.join(sitePackages, "badpkg-1.0.0.dist-info");
        const pkgData = path.join(sitePackages, "badpkg");

        yield* fs.makeDirectory(distInfo, { recursive: true });
        yield* fs.makeDirectory(pkgData, { recursive: true });

        yield* fs.writeFileString(
          path.join(distInfo, "entry_points.txt"),
          "[axm]\nmetadata = badpkg:axm.json\n",
        );

        yield* fs.writeFileString(path.join(pkgData, "axm.json"), "{ invalid json }}}");

        yield* fs.writeFileString(
          path.join(distInfo, "RECORD"),
          "badpkg/axm.json,sha256=abc,123\n",
        );

        const pkg = {
          purl: { type: pypiType, name: "badpkg", version: "1.0.0" },
          type: pypiType,
          source: "requirements.txt",
        };

        const origVirtualEnv = process.env["VIRTUAL_ENV"];
        process.env["VIRTUAL_ENV"] = tmpDir;
        try {
          const result = yield* pypiReader.read(pkg);
          expect(Option.isNone(result)).toBe(true);
        } finally {
          if (origVirtualEnv === undefined) {
            delete process.env["VIRTUAL_ENV"];
          } else {
            process.env["VIRTUAL_ENV"] = origVirtualEnv;
          }
        }
      }).pipe(Effect.scoped),
    ),
  );

  it.effect("locates dist-info with normalized name matching", () =>
    withTestLayer(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tmpDir = yield* fs.makeTempDirectoryScoped();

        const sitePackages = path.join(tmpDir, "lib", "python3.11", "site-packages");
        // dist-info uses underscores but purl uses dashes
        const distInfo = path.join(sitePackages, "Flask_RESTful-0.3.10.dist-info");
        const pkgData = path.join(sitePackages, "flask_restful");

        yield* fs.makeDirectory(distInfo, { recursive: true });
        yield* fs.makeDirectory(pkgData, { recursive: true });

        yield* fs.writeFileString(
          path.join(distInfo, "entry_points.txt"),
          "[axm]\nmetadata = flask_restful:axm.json\n",
        );

        yield* fs.writeFileString(
          path.join(pkgData, "axm.json"),
          JSON.stringify({
            extensions: [{ ref: "@acme/skills/flask-rest", versionRange: "^1.0.0" }],
          }),
        );

        yield* fs.writeFileString(
          path.join(distInfo, "RECORD"),
          "flask_restful/axm.json,sha256=abc,123\n",
        );

        const pkg = {
          purl: {
            type: pypiType,
            name: "flask-restful",
          },
          type: pypiType,
          source: "requirements.txt",
        };

        const origVirtualEnv = process.env["VIRTUAL_ENV"];
        process.env["VIRTUAL_ENV"] = tmpDir;
        try {
          const result = yield* pypiReader.read(pkg);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@acme/skills/flask-rest", versionRange: "^1.0.0" },
            ]);
          }
        } finally {
          if (origVirtualEnv === undefined) {
            delete process.env["VIRTUAL_ENV"];
          } else {
            process.env["VIRTUAL_ENV"] = origVirtualEnv;
          }
        }
      }).pipe(Effect.scoped),
    ),
  );
});
