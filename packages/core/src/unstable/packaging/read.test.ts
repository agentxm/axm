import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { PackageExtensionDeclarationSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema, PackageUrlSchema } from "./package-url.js";
import { readLocalRecommendations } from "./read.js";
import type { DetectedPackage, PackageReader } from "./types.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");
const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);
const makeDeclaration = Schema.decodeUnknownSync(PackageExtensionDeclarationSchema);
const encodePurl = Schema.encodeSync(PackageUrlSchema);

const withNodeContext = <A, E>(
  effect: Effect.Effect<A, E, import("effect/FileSystem").FileSystem | import("effect/Path").Path>,
) => effect.pipe(Effect.provide(NodeServices.layer));

describe("readLocalRecommendations", () => {
  it.effect("returns empty HashMap when no readers provided", () =>
    withNodeContext(
      Effect.gen(function* () {
        const pkg: DetectedPackage = {
          purl: makePurl({ type: "npm", name: "lodash" }),
          type: npmType,
          source: "package.json",
        };

        const result = yield* readLocalRecommendations([pkg], []);
        expect(HashMap.size(result)).toBe(0);
      }),
    ),
  );

  it.effect("returns empty HashMap when reader returns Option.none", () =>
    withNodeContext(
      Effect.gen(function* () {
        const pkg: DetectedPackage = {
          purl: makePurl({ type: "npm", name: "lodash" }),
          type: npmType,
          source: "package.json",
        };

        const reader: PackageReader = {
          type: npmType,
          read: () => Effect.succeed(Option.none()),
        };

        const result = yield* readLocalRecommendations([pkg], [reader]);
        expect(HashMap.size(result)).toBe(0);
      }),
    ),
  );

  it.effect("collects refs when reader returns Option.some", () =>
    withNodeContext(
      Effect.gen(function* () {
        const purl = makePurl({ type: "npm", name: "lodash" });
        const pkg: DetectedPackage = {
          purl,
          type: npmType,
          source: "package.json",
        };

        const refs = [makeDeclaration({ ref: "@acme/skills/code-review" })];

        const reader: PackageReader = {
          type: npmType,
          read: () => Effect.succeed(Option.some(refs)),
        };

        const result = yield* readLocalRecommendations([pkg], [reader]);
        const key = encodePurl(purl);

        expect(HashMap.size(result)).toBe(1);
        expect(HashMap.has(result, key)).toBe(true);
        const value = HashMap.get(result, key);
        expect(Option.isSome(value)).toBe(true);
        if (Option.isSome(value)) {
          expect(value.value).toEqual(refs);
        }
      }),
    ),
  );

  it.effect("collects results from multiple packages into HashMap", () =>
    withNodeContext(
      Effect.gen(function* () {
        const npmPurl = makePurl({ type: "npm", name: "lodash" });
        const pypiPurl = makePurl({ type: "pypi", name: "requests" });

        const npmPkg: DetectedPackage = {
          purl: npmPurl,
          type: npmType,
          source: "package.json",
        };

        const pypiPkg: DetectedPackage = {
          purl: pypiPurl,
          type: pypiType,
          source: "requirements.txt",
        };

        const npmRefs = [makeDeclaration({ ref: "@acme/skills/code-review" })];
        const pypiRefs = [makeDeclaration({ ref: "@acme/skills/python-lint" })];

        const npmReader: PackageReader = {
          type: npmType,
          read: () => Effect.succeed(Option.some(npmRefs)),
        };

        const pypiReader: PackageReader = {
          type: pypiType,
          read: () => Effect.succeed(Option.some(pypiRefs)),
        };

        const result = yield* readLocalRecommendations([npmPkg, pypiPkg], [npmReader, pypiReader]);

        expect(HashMap.size(result)).toBe(2);

        const npmKey = encodePurl(npmPurl);
        const pypiKey = encodePurl(pypiPurl);

        expect(HashMap.has(result, npmKey)).toBe(true);
        expect(HashMap.has(result, pypiKey)).toBe(true);
      }),
    ),
  );

  it.effect("skips packages with no matching reader", () =>
    withNodeContext(
      Effect.gen(function* () {
        const pkg: DetectedPackage = {
          purl: makePurl({ type: "pypi", name: "requests" }),
          type: pypiType,
          source: "requirements.txt",
        };

        const npmReader: PackageReader = {
          type: npmType,
          read: () =>
            Effect.succeed(Option.some([makeDeclaration({ ref: "@acme/skills/code-review" })])),
        };

        const result = yield* readLocalRecommendations([pkg], [npmReader]);
        expect(HashMap.size(result)).toBe(0);
      }),
    ),
  );
});
