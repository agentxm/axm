import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/client-core/unstable/extensions";
import { PackageTypeSchema } from "@agentxm/client-core/unstable/packaging";
import type { DiscoverPackageResult, DiscoverResult } from "@agentxm/client-core/unstable/discover";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

import { makeCliTestContext } from "../../test-helpers.js";
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
  it.effect("renders compatible extensions as a table in human mode", () => {
    const { baseLayer, rendererState } = makeCliTestContext();

    return handleDiscoverWith({ path: Option.none() }, () => Effect.succeed(sampleResult)).pipe(
      Effect.provide(baseLayer),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rendererState.tables).toHaveLength(1);
          expect(rendererState.tables[0]?.items).toEqual(
            expect.arrayContaining([
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
          );
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
        }),
      ),
    );
  });
});
