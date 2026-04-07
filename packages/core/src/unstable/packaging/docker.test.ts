import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { dockerDetector, dockerReader } from "./docker.js";

const dockerType = Schema.decodeUnknownSync(PackageTypeSchema)("docker");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write files, run detector, clean up. */
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
    return yield* dockerDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("dockerDetector", () => {
  it("has type docker", () => {
    expect(dockerDetector.type).toBe(dockerType);
  });

  describe("Dockerfile FROM directives", () => {
    it.effect("simple FROM directive", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM node:18-alpine",
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "node", version: "18-alpine" }),
          );
        }),
      ),
    );

    it.effect("multi-stage build", () =>
      withNodeContext(
        Effect.gen(function* () {
          const dockerfile = [
            "FROM node:18 AS builder",
            "RUN npm install",
            "FROM nginx:alpine",
            "COPY --from=builder /app /usr/share/nginx/html",
          ].join("\n");
          const result = yield* detectInTempDir({ Dockerfile: dockerfile });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("node");
          expect(names).toContain("nginx");
        }),
      ),
    );

    it.effect("FROM with AS alias", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM python:3.11 AS base",
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "python", version: "3.11" }),
          );
        }),
      ),
    );

    it.effect("missing Dockerfile returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("docker-compose files", () => {
    it.effect("images from docker-compose.yml", () =>
      withNodeContext(
        Effect.gen(function* () {
          const compose = [
            "version: '3'",
            "services:",
            "  redis:",
            "    image: redis:7",
            "  db:",
            "    image: postgres:15",
          ].join("\n");
          const result = yield* detectInTempDir({ "docker-compose.yml": compose });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("redis");
          expect(names).toContain("postgres");
        }),
      ),
    );

    it.effect("docker-compose.yaml variant", () =>
      withNodeContext(
        Effect.gen(function* () {
          const compose = ["services:", "  app:", "    image: myapp:latest"].join("\n");
          const result = yield* detectInTempDir({ "docker-compose.yaml": compose });
          expect(result).toHaveLength(1);
          // latest → versionless
          expect(result[0]?.purl).toEqual(makePurl({ type: "docker", name: "myapp" }));
        }),
      ),
    );

    it.effect("missing compose files returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("image name parsing", () => {
    it.effect("official image without namespace", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM nginx:alpine",
          });
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "nginx", version: "alpine" }),
          );
          expect(result[0]?.purl.namespace).toBeUndefined();
        }),
      ),
    );

    it.effect("organization-scoped image", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM library/nginx:1.25",
          });
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "docker",
              namespace: "library",
              name: "nginx",
              version: "1.25",
            }),
          );
        }),
      ),
    );

    it.effect("custom registry image", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM ghcr.io/org/myapp:latest",
          });
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "docker",
              namespace: "ghcr.io/org",
              name: "myapp",
            }),
          );
        }),
      ),
    );
  });

  describe("tags as versions", () => {
    it.effect("exact tag produces versioned purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM node:18.17.0",
          });
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "node", version: "18.17.0" }),
          );
        }),
      ),
    );

    it.effect("named tag produces versioned purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM node:18-alpine",
          });
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "node", version: "18-alpine" }),
          );
        }),
      ),
    );

    it.effect("latest tag produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM nginx:latest",
          });
          expect(result[0]?.purl).toEqual(makePurl({ type: "docker", name: "nginx" }));
        }),
      ),
    );

    it.effect("no tag produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            Dockerfile: "FROM nginx",
          });
          expect(result[0]?.purl).toEqual(makePurl({ type: "docker", name: "nginx" }));
        }),
      ),
    );
  });

  describe("variable references", () => {
    it.effect("variable without default is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const dockerfile = ["ARG BASE_IMAGE", "FROM ${BASE_IMAGE}"].join("\n");
          const result = yield* detectInTempDir({ Dockerfile: dockerfile });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("variable with default is resolved", () =>
      withNodeContext(
        Effect.gen(function* () {
          const dockerfile = ["ARG BASE_IMAGE=node:18", "FROM ${BASE_IMAGE}"].join("\n");
          const result = yield* detectInTempDir({ Dockerfile: dockerfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "docker", name: "node", version: "18" }),
          );
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// docker Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with .axm-docker-annotations for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  annotationContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write root Dockerfile (source)
    yield* fs.writeFileString(path.join(tmpDir, "Dockerfile"), "FROM scratch");

    if (annotationContent !== undefined) {
      const imageName = pkgPurl.namespace ? `${pkgPurl.namespace}/${pkgPurl.name}` : pkgPurl.name;
      const imageRef = pkgPurl.version ? `${imageName}:${pkgPurl.version}` : imageName;
      const safeImageName = imageRef.replace(/[/:]/g, "_");

      const annotationsDir = path.join(tmpDir, ".axm-docker-annotations");
      yield* fs.makeDirectory(annotationsDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(annotationsDir, `${safeImageName}.json`),
        annotationContent,
      );
    }

    const detected = {
      purl: pkgPurl,
      type: dockerType,
      source: path.join(tmpDir, "Dockerfile"),
    };
    return yield* dockerReader.read(detected);
  }).pipe(Effect.scoped);

describe("dockerReader", () => {
  it("has type docker", () => {
    expect(dockerReader.type).toBe(dockerType);
  });

  describe("valid axm annotation", () => {
    it.effect("extracts recommendedExtensions from annotation file", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "docker", name: "nginx", version: "alpine" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@nginx/skills/nginx@^1.0.0"],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@nginx/skills/nginx@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "docker", name: "postgres", version: "16" });
          const result = yield* readInTempDir(purl, JSON.stringify({ recommendedExtensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing annotations", () => {
    it.effect("returns Option.none when no annotation file", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "docker", name: "redis" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none on malformed annotation", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "docker", name: "myimage", version: "1.0" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({ recommendedExtensions: "not-an-array" }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in annotation", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "docker", name: "myimage", version: "1.0" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
              futureField: true,
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });
});
