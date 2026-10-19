import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DiscoveryPostDiscovery200 } from "./__generated__/registry-client.js";
import { refineDiscoveryResponse } from "./discovery-response.js";

const registrySource = { type: "registry", url: "https://registry.example.test" };
const resolvedExtension = {
  owner: "@acme",
  type: "skill",
  name: "code-review",
  resolution: { type: "registry", version: "1.2.3" },
};
const extensionResult = {
  ref: "@acme/skills/code-review",
  source: registrySource,
  resolved: true,
  extension: resolvedExtension,
  attestedBy: ["package", "extension"],
  official: true,
  packageVersionInRange: true,
};

/** Decode as the generated transport does, then refine as the client does. */
const discover = (extensions: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownEffect(DiscoveryPostDiscovery200)({
    results: [{ purl: "pkg:npm/react", version: "18.2.0", status: "resolved", extensions }],
  }).pipe(
    Effect.flatMap(refineDiscoveryResponse),
    Effect.map((response) => response.results[0]?.extensions[0]),
  );

describe("refineDiscoveryResponse", () => {
  it.effect("refines a resolved Registry result into domain identities", () =>
    Effect.gen(function* () {
      const result = yield* discover([extensionResult]);
      expect(result?.source).toEqual({
        type: "registry",
        url: new URL("https://registry.example.test"),
      });
      expect(result?.extension?.resolution).toEqual({ type: "registry", version: "1.2.3" });
      expect(result?.official).toBe(true);
      expect(result?.attestedBy).toEqual(["package", "extension"]);
    }),
  );

  it.effect.each([
    { field: "plural type segment", extension: { ...resolvedExtension, type: "skills" } },
    { field: "owner slug", extension: { ...resolvedExtension, owner: "acme" } },
  ])("accepts a Registry $field", ({ extension }) =>
    Effect.gen(function* () {
      const result = yield* discover([{ ...extensionResult, extension }]);
      expect(result?.extension).toEqual(extension);
    }),
  );

  it.effect.each([
    { label: "absent", extension: {} },
    { label: "null", extension: { extension: null } },
  ])("leaves an unresolved result without an extension when it is $label", ({ extension }) =>
    Effect.gen(function* () {
      const { extension: _resolved, ...unresolved } = extensionResult;
      const result = yield* discover([
        { ...unresolved, ...extension, resolved: false, official: false },
      ]);
      expect(result?.extension).toBeUndefined();
      expect(result?.resolved).toBe(false);
    }),
  );

  it.effect.each([
    {
      source: {
        type: "git",
        url: "https://github.com/acme/extensions.git",
        path: "skills/code-review",
        revision: "v1.2.3",
      },
    },
    { source: { type: "path", path: "extensions/code-review" } },
  ])("accepts a resolved $source.type locator without a version", ({ source }) =>
    Effect.gen(function* () {
      const result = yield* discover([
        {
          ...extensionResult,
          source,
          extension: { ...resolvedExtension, resolution: source },
          official: false,
        },
      ]);
      expect(result?.extension?.resolution.type).toBe(source.type);
    }),
  );

  it.effect.each([
    {
      label: "official status for a non-Registry source",
      entry: {
        ...extensionResult,
        source: { type: "path", path: "extensions/code-review" },
        extension: {
          ...resolvedExtension,
          resolution: { type: "path", path: "extensions/code-review" },
        },
      },
    },
    {
      label: "a resolution that does not match the source",
      entry: {
        ...extensionResult,
        extension: {
          ...resolvedExtension,
          resolution: { type: "path", path: "extensions/code-review" },
        },
      },
    },
    {
      label: "an invalid owner",
      entry: { ...extensionResult, extension: { ...resolvedExtension, owner: "@" } },
    },
    {
      label: "an invalid version",
      entry: {
        ...extensionResult,
        extension: { ...resolvedExtension, resolution: { type: "registry", version: "latest" } },
      },
    },
  ])("rejects $label", ({ entry }) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(discover([entry]));
      expect(failure._tag).toBe("SchemaError");
    }),
  );
});
