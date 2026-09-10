import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { nugetDetector, nugetReader } from "./nuget.js";

const nugetType = Schema.decodeUnknownSync(PackageTypeSchema)("nuget");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

// ──────────────────────────────────────────────────────────────────
// NuGet Detector tests
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
    return yield* nugetDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("nugetDetector", () => {
  it("has type nuget", () => {
    expect(nugetDetector.type).toBe(nugetType);
  });

  describe("csproj parsing", () => {
    it.effect("extracts PackageReference from csproj", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "nuget", name: "newtonsoft.json", version: "13.0.3" }),
          );
        }),
      ),
    );

    it.effect("PackageReference without version produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "nuget", name: "newtonsoft.json" }));
        }),
      ),
    );
  });

  describe("fsproj parsing", () => {
    it.effect("extracts PackageReference from fsproj", () =>
      withNodeContext(
        Effect.gen(function* () {
          const fsproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="FSharp.Core" Version="8.0.0" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.fsproj", content: fsproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "nuget", name: "fsharp.core", version: "8.0.0" }),
          );
        }),
      ),
    );
  });

  describe("vbproj parsing", () => {
    it.effect("extracts PackageReference from vbproj", () =>
      withNodeContext(
        Effect.gen(function* () {
          const vbproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.VisualBasic" Version="10.3.0" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.vbproj", content: vbproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "nuget", name: "microsoft.visualbasic", version: "10.3.0" }),
          );
        }),
      ),
    );
  });

  describe("case-insensitive name normalization", () => {
    it.effect("mixed case normalized to lowercase", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result[0]?.purl.name).toBe("newtonsoft.json");
        }),
      ),
    );

    it.effect("all uppercase normalized to lowercase", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="AWSSDK.S3" Version="3.7.0" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result[0]?.purl.name).toBe("awssdk.s3");
        }),
      ),
    );
  });

  describe("Directory.Packages.props parsing", () => {
    it.effect("extracts PackageVersion from Directory.Packages.props", () =>
      withNodeContext(
        Effect.gen(function* () {
          const props = `<Project>
  <ItemGroup>
    <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([
            { name: "Directory.Packages.props", content: props },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "nuget", name: "newtonsoft.json", version: "13.0.3" }),
          );
        }),
      ),
    );

    it.effect("missing Directory.Packages.props returns empty from props", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("packages.config parsing", () => {
    it.effect("extracts package from packages.config", () =>
      withNodeContext(
        Effect.gen(function* () {
          const config = `<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
</packages>`;
          const result = yield* detectInTempDir([{ name: "packages.config", content: config }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "nuget", name: "newtonsoft.json", version: "13.0.3" }),
          );
        }),
      ),
    );

    it.effect("missing packages.config returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("exact versions vs ranges", () => {
    it.effect("exact version produces versioned purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result[0]?.purl.version).toBe("13.0.3");
        }),
      ),
    );

    it.effect("version range produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="[1.0,2.0)" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );

    it.effect("floating version produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="1.0.*" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([{ name: "MyApp.csproj", content: csproj }]);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );
  });

  describe("deduplication across files", () => {
    it.effect("deduplicates across csproj and Directory.Packages.props", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const props = `<Project>
  <ItemGroup>
    <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([
            { name: "MyApp.csproj", content: csproj },
            { name: "Directory.Packages.props", content: props },
          ]);
          expect(result).toHaveLength(1);
        }),
      ),
    );

    it.effect("deduplicates across csproj and packages.config", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const config = `<packages>
  <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
</packages>`;
          const result = yield* detectInTempDir([
            { name: "MyApp.csproj", content: csproj },
            { name: "packages.config", content: config },
          ]);
          expect(result).toHaveLength(1);
        }),
      ),
    );
  });

  describe("missing project files", () => {
    it.effect("returns empty array when no project files exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed project file", () => {
    it.effect("returns empty array and warns on malformed csproj", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir([
            { name: "MyApp.csproj", content: "{{{{ not valid xml ????" },
          ]);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("multiple project files", () => {
    it.effect("collects from multiple project files", () =>
      withNodeContext(
        Effect.gen(function* () {
          const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>`;
          const fsproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="FSharp.Core" Version="8.0.0" />
  </ItemGroup>
</Project>`;
          const result = yield* detectInTempDir([
            { name: "MyApp.csproj", content: csproj },
            { name: "Lib.fsproj", content: fsproj },
          ]);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("newtonsoft.json");
          expect(names).toContain("fsharp.core");
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// NuGet Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp NuGet packages folder for reader tests. */
const readInTempNuget = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const packagesFolder = path.join(tmpDir, "nuget-packages");

    if (axmJsonContent !== undefined) {
      const pkgId = pkgPurl.name.toLowerCase();
      const version = pkgPurl.version ?? "0.0.0";
      const pkgDir = path.join(packagesFolder, pkgId, version);
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, "axm.json"), axmJsonContent);
    }

    const detected = {
      purl: pkgPurl,
      type: nugetType,
      source: "/tmp/fake/MyApp.csproj",
    };

    // Override NUGET_PACKAGES for this test
    const origNugetPackages = process.env["NUGET_PACKAGES"];
    process.env["NUGET_PACKAGES"] = packagesFolder;

    return yield* nugetReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origNugetPackages === undefined) {
            delete process.env["NUGET_PACKAGES"];
          } else {
            process.env["NUGET_PACKAGES"] = origNugetPackages;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("nugetReader", () => {
  it("has type nuget", () => {
    expect(nugetReader.type).toBe(nugetType);
  });

  describe("valid axm.json", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "newtonsoft.json",
            version: "13.0.3",
          });
          const result = yield* readInTempNuget(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@newtonsoft/skills/json", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@newtonsoft/skills/json", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });
          const result = yield* readInTempNuget(purl, JSON.stringify({ extensions: [] }));
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
            type: "nuget",
            name: "serilog",
            version: "3.1.1",
          });
          const result = yield* readInTempNuget(purl);
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
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });
          const result = yield* readInTempNuget(
            purl,
            JSON.stringify({ extensions: "not-an-array" }),
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
          const purl = makePurl({
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });
          const result = yield* readInTempNuget(
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

  describe("package ID lowercased in folder path", () => {
    it.effect("uses lowercased package ID for path lookup", () =>
      withNodeContext(
        Effect.gen(function* () {
          // Name already lowercased by detector, but test the reader path
          const purl = makePurl({
            type: "nuget",
            name: "newtonsoft.json",
            version: "13.0.3",
          });
          const result = yield* readInTempNuget(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@newtonsoft/skills/json", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
        }),
      ),
    );
  });

  describe("NUGET_PACKAGES environment variable", () => {
    it.effect("uses NUGET_PACKAGES when set", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });
          // readInTempNuget already sets NUGET_PACKAGES
          const result = yield* readInTempNuget(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
        }),
      ),
    );

    it.effect("defaults to ~/.nuget/packages when NUGET_PACKAGES is not set", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "nonexistent",
            version: "1.0.0",
          });

          // Unset NUGET_PACKAGES to test default
          const origNugetPackages = process.env["NUGET_PACKAGES"];
          delete process.env["NUGET_PACKAGES"];

          const detected = {
            purl,
            type: nugetType,
            source: "/tmp/fake/MyApp.csproj",
          };

          const result = yield* nugetReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origNugetPackages === undefined) {
                  delete process.env["NUGET_PACKAGES"];
                } else {
                  process.env["NUGET_PACKAGES"] = origNugetPackages;
                }
              }),
            ),
          );
          // Should return none since the package won't exist at ~/.nuget/packages
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing packages folder", () => {
    it.effect("returns Option.none when packages folder does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });

          const origNugetPackages = process.env["NUGET_PACKAGES"];
          process.env["NUGET_PACKAGES"] = "/tmp/nonexistent-nuget-packages-12345";

          const detected = {
            purl,
            type: nugetType,
            source: "/tmp/fake/MyApp.csproj",
          };

          const result = yield* nugetReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origNugetPackages === undefined) {
                  delete process.env["NUGET_PACKAGES"];
                } else {
                  process.env["NUGET_PACKAGES"] = origNugetPackages;
                }
              }),
            ),
          );
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
            type: "nuget",
            name: "some.lib",
            version: "1.0.0",
          });
          const result = yield* readInTempNuget(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("version from purl used for directory lookup", () => {
    it.effect("uses exact version for directory lookup", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "nuget",
            name: "microsoft.extensions.logging",
            version: "8.0.0",
          });
          const result = yield* readInTempNuget(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@microsoft/skills/logging", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@microsoft/skills/logging", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });
});
