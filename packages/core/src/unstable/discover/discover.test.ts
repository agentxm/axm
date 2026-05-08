/**
 * Tests for the discover pipeline.
 */

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";

import { makeAppError, type AppError } from "../app-error/index.js";
import type { PackageUrlParts } from "../packaging/package-url.js";
import { purlMatch } from "../packaging/purl-match.js";
import type { DiscoverExtensionsArgs, RegistryClient } from "../registry/client.js";
import type { DiscoverExtensionsResponse } from "../registry/discover-schema.js";
import { packageType } from "../test-helpers.js";
import { discover } from "./discover.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Build a stub RegistryClient that only implements discoverExtensions.
 * All other methods fail with a not-implemented error.
 */
const makeStubClient = (
  discoverImpl: (
    args: DiscoverExtensionsArgs,
  ) => Effect.Effect<DiscoverExtensionsResponse, AppError>,
): RegistryClient => {
  const notImplemented = Effect.fail(
    makeAppError({ code: "NOT_IMPLEMENTED", category: "internal", message: "stub" }),
  );

  return {
    getExtensionsByScope: () => notImplemented,
    ownerExists: () => notImplemented,
    getExtensionIndex: () => notImplemented,
    getExtensionPackage: () => notImplemented,
    publishExtension: () => notImplemented,
    extensionExists: () => notImplemented,
    discoverExtensions: discoverImpl,
    // Assertion needed: stub RegistryClient satisfies the interface
  } as unknown as RegistryClient;
};

const emptyResponse: DiscoverExtensionsResponse = {
  results: [],
  resolvedRecommendations: [],
};

// -----------------------------------------------------------------------------
// purlMatch in discover context
// -----------------------------------------------------------------------------

const makeParts = (overrides?: {
  readonly type?: string;
  readonly namespace?: string;
  readonly name?: string;
  readonly version?: string;
}): PackageUrlParts => ({
  type: packageType(overrides?.type ?? "npm"),
  name: overrides?.name ?? "react",
  ...(overrides?.namespace ? { namespace: overrides.namespace } : {}),
  ...(overrides?.version ? { version: overrides.version } : {}),
});

describe("purlMatch in discover context", () => {
  it("matches exact type, name, and version", () => {
    const detected = makeParts({ version: "18.2.0" });
    const declared = makeParts({ version: "18.2.0" });
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("matches scoped (namespaced) packages", () => {
    const detected = makeParts({ namespace: "@scope", name: "package", version: "2.0.0" });
    const declared = makeParts({ namespace: "@scope", name: "package", version: "2.0.0" });
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("matches when declared version is absent (compatible with any detected version)", () => {
    // A versionless declaration means "compatible with any version".
    // This is the typical discover scenario: the registry declares a package
    // type and name, and the user's project has a specific version installed.
    const detected = makeParts({ version: "18.2.0" });
    const declared = makeParts(); // no version
    expect(purlMatch(detected, declared)).toBe(true);
  });

  it("does not match when identity differs", () => {
    const detected = makeParts({ type: "npm", name: "react", version: "18.2.0" });
    const declared = makeParts({ type: "pypi", name: "flask", version: "3.0.0" });
    expect(purlMatch(detected, declared)).toBe(false);
  });
});

// Since detectors array is empty by default, the pipeline always detects 0 packages.
// This tests the pipeline orchestration and early-exit behavior.

describe("discover pipeline", () => {
  it.effect("returns empty result when no packages detected", () =>
    Effect.gen(function* () {
      const client = makeStubClient(() => Effect.succeed(emptyResponse));
      const result = yield* discover("/tmp/empty-project", client);

      expect(result.totalDetected).toBe(0);
      expect(result.packages).toEqual([]);
      expect(result.registryAvailable).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips registry query when no packages detected", () =>
    Effect.gen(function* () {
      let registryCalled = false;
      const client = makeStubClient(() => {
        registryCalled = true;
        return Effect.succeed(emptyResponse);
      });
      const result = yield* discover("/tmp/empty-project", client);

      expect(result.totalDetected).toBe(0);
      expect(registryCalled).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("returns registryAvailable true when no packages detected", () =>
    Effect.gen(function* () {
      // When there are no packages, we never call the registry,
      // so registryAvailable defaults to true (no failure occurred)
      const client = makeStubClient(() =>
        Effect.fail(
          makeAppError({
            code: "REGISTRY_FETCH_FAILED",
            category: "internal",
            message: "unreachable",
          }),
        ),
      );
      const result = yield* discover("/tmp/empty-project", client);

      expect(result.registryAvailable).toBe(true);
      expect(result.totalDetected).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
