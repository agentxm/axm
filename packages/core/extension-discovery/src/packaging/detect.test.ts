import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import type { DetectedPackage, PackageDetector } from "./types.js";
import { detectPackages } from "./detect.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");
const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");

const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(
  effect: Effect.Effect<A, E, import("effect/FileSystem").FileSystem | import("effect/Path").Path>,
) => effect.pipe(Effect.provide(NodeServices.layer));

describe("detectPackages", () => {
  it.effect("returns empty array when no detectors provided", () =>
    withNodeContext(
      Effect.gen(function* () {
        const result = yield* detectPackages("/tmp/project", []);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("runs multiple detectors and flattens results", () =>
    withNodeContext(
      Effect.gen(function* () {
        const npmPkg: DetectedPackage = {
          purl: makePurl({ type: "npm", name: "lodash", version: "4.17.21" }),
          type: npmType,
          source: "package.json",
        };

        const pypiPkg: DetectedPackage = {
          purl: makePurl({ type: "pypi", name: "requests", version: "2.31.0" }),
          type: pypiType,
          source: "requirements.txt",
        };

        const npmDetector: PackageDetector = {
          type: npmType,
          detect: () => Effect.succeed([npmPkg]),
        };

        const pypiDetector: PackageDetector = {
          type: pypiType,
          detect: () => Effect.succeed([pypiPkg]),
        };

        const result = yield* detectPackages("/tmp/project", [npmDetector, pypiDetector]);
        expect(result).toHaveLength(2);
        expect(result).toContainEqual(npmPkg);
        expect(result).toContainEqual(pypiPkg);
      }),
    ),
  );

  it.effect("deduplicates by purl equivalence", () =>
    withNodeContext(
      Effect.gen(function* () {
        const purl = makePurl({ type: "npm", name: "lodash", version: "4.17.21" });

        const pkg1: DetectedPackage = {
          purl,
          type: npmType,
          source: "package.json",
        };

        const pkg2: DetectedPackage = {
          purl,
          type: npmType,
          source: "package-lock.json",
        };

        const detector1: PackageDetector = {
          type: npmType,
          detect: () => Effect.succeed([pkg1]),
        };

        const detector2: PackageDetector = {
          type: npmType,
          detect: () => Effect.succeed([pkg2]),
        };

        const result = yield* detectPackages("/tmp/project", [detector1, detector2]);
        expect(result).toHaveLength(1);
      }),
    ),
  );

  it.effect("keeps packages with different purls from same detector", () =>
    withNodeContext(
      Effect.gen(function* () {
        const pkg1: DetectedPackage = {
          purl: makePurl({ type: "npm", name: "lodash" }),
          type: npmType,
          source: "package.json",
        };

        const pkg2: DetectedPackage = {
          purl: makePurl({ type: "npm", name: "express" }),
          type: npmType,
          source: "package.json",
        };

        const detector: PackageDetector = {
          type: npmType,
          detect: () => Effect.succeed([pkg1, pkg2]),
        };

        const result = yield* detectPackages("/tmp/project", [detector]);
        expect(result).toHaveLength(2);
      }),
    ),
  );
});
