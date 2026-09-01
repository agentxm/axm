import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging";
import type { DiscoverPackageResult, DiscoverResult } from "@agentxm/extension-discovery";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { expectNoPlanEnvelope, makeCliTestContext } from "../../test-helpers.js";
import { formatPackageName, handleDiscoverWith, toDiscoverOutput } from "./handler.js";

const packageType = Schema.decodeUnknownSync(PackageTypeSchema);

const sampleResult: DiscoverResult = {
  totalDetected: 2,
  registryAvailable: true,
  packages: [
    {
      detectedPackage: { type: packageType("npm"), name: "react" },
      extensions: [
        {
          ref: "@acme/skills/react-testing",
          resolved: true,
          extension: {
            type: "skill",
            name: decodeExtensionNameSync("react-testing"),
            owner: decodeHandleSync("@acme"),
            installVersion: decodeVersionSync("1.0.0"),
          },
          attestedBy: ["package", "extension"],
          official: true,
          packageVersionInRange: true,
        },
      ],
    },
    {
      detectedPackage: { type: packageType("npm"), name: "vitest", version: "3.2.1" },
      extensions: [
        {
          ref: "@acme/skills/effect-testing",
          resolved: true,
          extension: {
            type: "skill",
            name: decodeExtensionNameSync("effect-testing"),
            owner: decodeHandleSync("@acme"),
            installVersion: decodeVersionSync("1.0.0"),
          },
          attestedBy: ["extension"],
          official: false,
          packageVersionInRange: true,
        },
      ],
    },
  ],
};

describe("formatPackageName", () => {
  it("formats name only", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "react" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("react");
  });

  it("formats name with version", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "react", version: "18.2.0" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("react@18.2.0");
  });

  it("formats namespace/name", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: { type: packageType("npm"), name: "cli", namespace: "@effect" },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("@effect/cli");
  });

  it("formats namespace/name@version", () => {
    const pkg: DiscoverPackageResult = {
      detectedPackage: {
        type: packageType("npm"),
        name: "cli",
        namespace: "@effect",
        version: "1.0.0",
      },
      extensions: [],
    };
    expect(formatPackageName(pkg)).toBe("@effect/cli@1.0.0");
  });
});

describe("toDiscoverOutput", () => {
  it("maps a discover result to the machine output shape", () => {
    expect(toDiscoverOutput(sampleResult)).toMatchObject({
      count: 2,
      totalDetected: 2,
      registryAvailable: true,
      items: [
        {
          package: "pkg:npm/react",
          extensions: [{ name: "react-testing", official: true }],
        },
        {
          package: "pkg:npm/vitest@3.2.1",
          extensions: [{ name: "effect-testing", official: false }],
        },
      ],
    });
  });
});

describe("discover handler", () => {
  it.effect("renders compatible extensions as a single list payload in human mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(sampleResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 2,
            items: expect.arrayContaining([
              expect.objectContaining({
                package: "react",
                extension: "@acme/skills/react-testing",
                official: "yes",
              }),
              expect.objectContaining({
                package: "vitest@3.2.1",
                extension: "@acme/skills/effect-testing",
                official: "no",
              }),
            ]),
            summary: "Found 2 companion extensions for 2 of 2 detected packages.",
          });
          expect(rendererState.spinnerMessages).toEqual([
            "Scanning project dependencies",
            "Scanned project dependencies",
          ]);
        }),
      ),
    );
  });

  it.effect("emits a structured empty list when no companion extensions are found", () => {
    const { baseLayer, rendererState } = makeCliTestContext();
    const emptyResult: DiscoverResult = {
      totalDetected: 0,
      registryAvailable: true,
      packages: [],
    };

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(emptyResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 0,
            items: [],
            emptyMessage: "No companion extensions found.",
          });
        }),
      ),
    );
  });

  it.effect("keeps registry unavailable as warning context for empty results", () => {
    const { baseLayer, rendererState } = makeCliTestContext();
    const emptyResult: DiscoverResult = {
      totalDetected: 1,
      registryAvailable: false,
      packages: [],
    };

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(emptyResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 0,
            items: [],
            emptyMessage:
              "Registry unavailable. Showing local recommendations only. No companion extensions found.",
          });
        }),
      ),
    );
  });

  it.effect("keeps registry unavailable as summary context for non-empty results", () => {
    const { baseLayer, rendererState } = makeCliTestContext();
    const localOnlyResult: DiscoverResult = {
      ...sampleResult,
      registryAvailable: false,
    };

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(localOnlyResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results[1]?.data).toMatchObject({
            count: 2,
            summary:
              "Registry unavailable. Showing local recommendations only. Found 2 companion extensions for 2 of 2 detected packages.",
          });
        }),
      ),
    );
  });

  it.effect("emits machine-readable items in machine mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext({ machine: true });

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(sampleResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.results).toHaveLength(1);
          expect(rendererState.results[0]?.data).toMatchObject({
            count: 2,
            totalDetected: 2,
            registryAvailable: true,
          });
          expect(rendererState.results[0]?.data).toEqual(
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({
                  package: "pkg:npm/react",
                  extensions: expect.arrayContaining([
                    expect.objectContaining({ name: "react-testing" }),
                  ]),
                }),
              ]),
            }),
          );
          expectNoPlanEnvelope(rendererState.results[0]?.data);
        }),
      ),
    );
  });
});
