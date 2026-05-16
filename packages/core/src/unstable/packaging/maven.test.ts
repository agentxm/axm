import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { mavenDetector, mavenReader } from "./maven.js";

const mavenType = Schema.decodeUnknownSync(PackageTypeSchema)("maven");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

// ──────────────────────────────────────────────────────────────────
// Maven Detector tests
// ──────────────────────────────────────────────────────────────────

/** Create a temp dir with specified files, run detector, clean up. */
const detectInTempDir = (
  files?: ReadonlyArray<{ readonly name: string; readonly content: string }>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (files !== undefined) {
      for (const file of files) {
        const filePath = path.join(tmpDir, file.name);
        const dir = path.dirname(filePath);
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(filePath, file.content);
      }
    }
    return yield* mavenDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("mavenDetector", () => {
  it("has type maven", () => {
    expect(mavenDetector.type).toBe(mavenType);
  });

  describe("pom.xml parsing", () => {
    it.effect("extracts standard Maven dependency", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<?xml version="1.0"?>
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>6.1.0</version>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.springframework",
              name: "spring-core",
              version: "6.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("dependency without version produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>org.slf4j</groupId>
      <artifactId>slf4j-api</artifactId>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "maven", namespace: "org.slf4j", name: "slf4j-api" }),
          );
        }),
      ),
    );

    it.effect("test-scoped dependency included", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("junit");
        }),
      ),
    );

    it.effect("missing pom.xml returns empty array", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("malformed pom.xml returns empty array", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir([
            { name: "pom.xml", content: "{{{{ not valid xml ????" },
          ]);
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("property reference resolves version", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <properties>
    <spring.version>6.1.0</spring.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>\${spring.version}</version>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.springframework",
              name: "spring-core",
              version: "6.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("unresolvable property reference produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>\${parent.version}</version>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "maven", namespace: "org.springframework", name: "spring-core" }),
          );
        }),
      ),
    );

    it.effect("version range produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>org.example</groupId>
      <artifactId>lib</artifactId>
      <version>[1.0,2.0)</version>
    </dependency>
  </dependencies>
</project>`;
          const result = yield* detectInTempDir([{ name: "pom.xml", content: pomXml }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "maven", namespace: "org.example", name: "lib" }),
          );
        }),
      ),
    );
  });

  describe("build.gradle parsing", () => {
    it.effect("extracts Groovy DSL dependency", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gradle = `
dependencies {
    implementation 'org.springframework:spring-core:6.1.0'
}`;
          const result = yield* detectInTempDir([{ name: "build.gradle", content: gradle }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.springframework",
              name: "spring-core",
              version: "6.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("extracts Kotlin DSL dependency from build.gradle.kts", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gradle = `
dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.0")
}`;
          const result = yield* detectInTempDir([{ name: "build.gradle.kts", content: gradle }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.jetbrains.kotlin",
              name: "kotlin-stdlib",
              version: "1.9.0",
            }),
          );
        }),
      ),
    );

    it.effect("extracts multiple configuration types", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gradle = `
dependencies {
    api 'com.google.guava:guava:32.0.0-jre'
    testImplementation 'org.mockito:mockito-core:5.0.0'
}`;
          const result = yield* detectInTempDir([{ name: "build.gradle", content: gradle }]);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("guava");
          expect(names).toContain("mockito-core");
        }),
      ),
    );

    it.effect("dependency without version in Gradle", () =>
      withNodeContext(
        Effect.gen(function* () {
          const gradle = `
dependencies {
    implementation 'org.springframework:spring-core'
}`;
          const result = yield* detectInTempDir([{ name: "build.gradle", content: gradle }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "maven", namespace: "org.springframework", name: "spring-core" }),
          );
        }),
      ),
    );

    it.effect("missing Gradle build files returns empty array", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("gradle version catalog parsing", () => {
    it.effect("module shorthand syntax", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = `[libraries]
spring-core = { module = "org.springframework:spring-core", version = "6.1.0" }
`;
          const result = yield* detectInTempDir([
            { name: "gradle/libs.versions.toml", content: toml },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.springframework",
              name: "spring-core",
              version: "6.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("separate group and name keys", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = `[libraries]
guava = { group = "com.google.guava", name = "guava", version = "32.0.0-jre" }
`;
          const result = yield* detectInTempDir([
            { name: "gradle/libs.versions.toml", content: toml },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "com.google.guava",
              name: "guava",
              version: "32.0.0-jre",
            }),
          );
        }),
      ),
    );

    it.effect("version reference from [versions] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = `[versions]
spring = "6.1.0"

[libraries]
spring-core = { module = "org.springframework:spring-core", version.ref = "spring" }
`;
          const result = yield* detectInTempDir([
            { name: "gradle/libs.versions.toml", content: toml },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "maven",
              namespace: "org.springframework",
              name: "spring-core",
              version: "6.1.0",
            }),
          );
        }),
      ),
    );

    it.effect("missing version catalog returns empty array", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("deduplication across build files", () => {
    it.effect("deduplicates same dependency from pom.xml and build.gradle", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pomXml = `<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>6.1.0</version>
    </dependency>
  </dependencies>
</project>`;
          const gradle = `
dependencies {
    implementation 'org.springframework:spring-core:6.1.0'
}`;
          const result = yield* detectInTempDir([
            { name: "pom.xml", content: pomXml },
            { name: "build.gradle", content: gradle },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("spring-core");
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Maven Reader tests
// ──────────────────────────────────────────────────────────────────

/**
 * Create a minimal ZIP/JAR file containing a single STORED entry.
 * This creates a valid ZIP with one entry at the specified path.
 */
const createJarWithEntry = (entryName: string, entryContent: string): Uint8Array => {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(entryName);
  const contentBytes = encoder.encode(entryContent);

  const nameLen = nameBytes.length;
  const contentLen = contentBytes.length;

  // Calculate sizes
  const localHeaderSize = 30 + nameLen;
  const centralHeaderSize = 46 + nameLen;
  const endOfCentralSize = 22;
  const dataOffset = localHeaderSize;
  const centralDirOffset = dataOffset + contentLen;

  const totalSize = localHeaderSize + contentLen + centralHeaderSize + endOfCentralSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Local file header
  let offset = 0;
  view.setUint32(offset, 0x04034b50, true);
  offset += 4; // signature
  view.setUint16(offset, 20, true);
  offset += 2; // version needed
  view.setUint16(offset, 0, true);
  offset += 2; // flags
  view.setUint16(offset, 0, true);
  offset += 2; // compression (STORED)
  view.setUint16(offset, 0, true);
  offset += 2; // mod time
  view.setUint16(offset, 0, true);
  offset += 2; // mod date
  view.setUint32(offset, 0, true);
  offset += 4; // crc32 (skip for test)
  view.setUint32(offset, contentLen, true);
  offset += 4; // compressed size
  view.setUint32(offset, contentLen, true);
  offset += 4; // uncompressed size
  view.setUint16(offset, nameLen, true);
  offset += 2; // name length
  view.setUint16(offset, 0, true);
  offset += 2; // extra length
  bytes.set(nameBytes, offset);
  offset += nameLen;

  // File data
  bytes.set(contentBytes, offset);
  offset += contentLen;

  // Central directory entry
  view.setUint32(offset, 0x02014b50, true);
  offset += 4; // signature
  view.setUint16(offset, 20, true);
  offset += 2; // version made by
  view.setUint16(offset, 20, true);
  offset += 2; // version needed
  view.setUint16(offset, 0, true);
  offset += 2; // flags
  view.setUint16(offset, 0, true);
  offset += 2; // compression (STORED)
  view.setUint16(offset, 0, true);
  offset += 2; // mod time
  view.setUint16(offset, 0, true);
  offset += 2; // mod date
  view.setUint32(offset, 0, true);
  offset += 4; // crc32
  view.setUint32(offset, contentLen, true);
  offset += 4; // compressed size
  view.setUint32(offset, contentLen, true);
  offset += 4; // uncompressed size
  view.setUint16(offset, nameLen, true);
  offset += 2; // name length
  view.setUint16(offset, 0, true);
  offset += 2; // extra length
  view.setUint16(offset, 0, true);
  offset += 2; // comment length
  view.setUint16(offset, 0, true);
  offset += 2; // disk number
  view.setUint16(offset, 0, true);
  offset += 2; // internal attributes
  view.setUint32(offset, 0, true);
  offset += 4; // external attributes
  view.setUint32(offset, 0, true);
  offset += 4; // local header offset
  bytes.set(nameBytes, offset);
  offset += nameLen;

  // End of central directory
  view.setUint32(offset, 0x06054b50, true);
  offset += 4; // signature
  view.setUint16(offset, 0, true);
  offset += 2; // disk number
  view.setUint16(offset, 0, true);
  offset += 2; // central dir disk
  view.setUint16(offset, 1, true);
  offset += 2; // entries on disk
  view.setUint16(offset, 1, true);
  offset += 2; // total entries
  view.setUint32(offset, centralHeaderSize, true);
  offset += 4; // central dir size
  view.setUint32(offset, centralDirOffset, true);
  offset += 4; // central dir offset
  view.setUint16(offset, 0, true); // comment length

  return bytes;
};

/** Helper to set up a temp Maven repository with a JAR for reader tests. */
const readInTempM2 = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  jarContent?: { readonly entryName: string; readonly entryContent: string },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const groupId = pkgPurl.namespace ?? "";
    const artifactId = pkgPurl.name;
    const version = pkgPurl.version ?? "0.0.0";
    const groupIdPath = groupId.replace(/\./g, "/");

    const m2Dir = path.join(tmpDir, ".m2", "repository", groupIdPath, artifactId, version);
    yield* fs.makeDirectory(m2Dir, { recursive: true });

    if (jarContent !== undefined) {
      const jarName = `${artifactId}-${version}.jar`;
      const jarBytes = createJarWithEntry(jarContent.entryName, jarContent.entryContent);
      yield* fs.writeFile(path.join(m2Dir, jarName), jarBytes);
    }

    // Create a source file so the detector source path exists
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "pom.xml"), "<project/>");

    const detected = {
      purl: pkgPurl,
      type: mavenType,
      source: path.join(sourceDir, "pom.xml"),
    };

    // Override HOME for this test
    const origHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;

    return yield* mavenReader.read(detected).pipe(
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
  }).pipe(Effect.scoped);

describe("mavenReader", () => {
  it("has type maven", () => {
    expect(mavenReader.type).toBe(mavenType);
  });

  describe("valid META-INF/axm.json in JAR", () => {
    it.effect("extracts extensions from META-INF/axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "maven",
            namespace: "com.google.guava",
            name: "guava",
            version: "32.1.0-jre",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/axm.json",
            entryContent: JSON.stringify({
              extensions: [{ ref: "@google/skills/guava", versionRange: "^1.0.0" }],
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@google/skills/guava", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "maven",
            namespace: "org.example",
            name: "lib",
            version: "1.0.0",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/axm.json",
            entryContent: JSON.stringify({ extensions: [] }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("JAR without META-INF/axm.json", () => {
    it.effect("returns Option.none when JAR has no axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "maven",
            namespace: "org.example",
            name: "lib",
            version: "1.0.0",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/MANIFEST.MF",
            entryContent: "Manifest-Version: 1.0\n",
          });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing JAR", () => {
    it.effect("returns Option.none when no JAR exists", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "maven",
            namespace: "org.example",
            name: "nonexistent",
            version: "1.0.0",
          });
          const result = yield* readInTempM2(purl);
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
            type: "maven",
            namespace: "org.example",
            name: "lib",
            version: "1.0.0",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/axm.json",
            entryContent: JSON.stringify({ extensions: { invalid: true } }),
          });
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
            type: "maven",
            namespace: "org.example",
            name: "lib",
            version: "1.0.0",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/axm.json",
            entryContent: JSON.stringify({
              extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
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

  describe("groupId path conversion", () => {
    it.effect("converts dots in groupId to path separators", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "maven",
            namespace: "org.apache.commons",
            name: "commons-lang3",
            version: "3.14.0",
          });
          const result = yield* readInTempM2(purl, {
            entryName: "META-INF/axm.json",
            entryContent: JSON.stringify({
              extensions: [{ ref: "@apache/skills/commons", versionRange: "^1.0.0" }],
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@apache/skills/commons", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing repository", () => {
    it.effect("returns Option.none when .m2/repository does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const tmpDir = yield* fs.makeTempDirectoryScoped();

          const purl = makePurl({
            type: "maven",
            namespace: "org.example",
            name: "lib",
            version: "1.0.0",
          });

          const detected = {
            purl,
            type: mavenType,
            source: "/tmp/fake/pom.xml",
          };

          const origHome = process.env["HOME"];
          process.env["HOME"] = tmpDir;

          const result = yield* mavenReader.read(detected).pipe(
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
          expect(Option.isNone(result)).toBe(true);
        }).pipe(Effect.scoped),
      ),
    );
  });
});
