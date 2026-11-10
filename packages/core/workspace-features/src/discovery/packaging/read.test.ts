import { withPackagingContext } from "./test-support/context.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AgentExtensionRecommendationSchema } from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { readLocalRecommendations } from "./read.js";
import type { DetectedPackage, PackageReader } from "./types.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");
const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);
const makeDeclaration = Schema.decodeUnknownSync(AgentExtensionRecommendationSchema);

describe("readLocalRecommendations", () => {
  it.effect("returns empty HashMap when no readers provided", () =>
    withPackagingContext(
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
    withPackagingContext(
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
    withPackagingContext(
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
        const key = pkg;

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
    withPackagingContext(
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

        const npmKey = npmPkg;
        const pypiKey = pypiPkg;

        expect(HashMap.has(result, npmKey)).toBe(true);
        expect(HashMap.has(result, pypiKey)).toBe(true);
      }),
    ),
  );

  it.effect("skips packages with no matching reader", () =>
    withPackagingContext(
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
  it.effect("keeps recommendations attached to distinct observations of the same identity", () =>
    withPackagingContext(
      Effect.gen(function* () {
        const purl = makePurl({ type: "npm", name: "same", version: "1.0.0" });
        const first: DetectedPackage = { purl, type: npmType, source: "one/package.json" };
        const second: DetectedPackage = { purl, type: npmType, source: "two/package.json" };
        const firstRefs = [makeDeclaration({ ref: "@acme/skills/first" })];
        const secondRefs = [makeDeclaration({ ref: "@acme/skills/second" })];
        const reader: PackageReader = {
          type: npmType,
          read: (pkg) => Effect.succeed(Option.some(pkg === first ? firstRefs : secondRefs)),
        };
        const result = yield* readLocalRecommendations([first, second], [reader]);
        expect(Option.getOrUndefined(HashMap.get(result, first))).toEqual(firstRefs);
        expect(Option.getOrUndefined(HashMap.get(result, second))).toEqual(secondRefs);
      }),
    ),
  );
});
