import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";

import type { RegistrySourceHost } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";

import { AxmSkillCandidateGate } from "./axm-skill-gate.js";
import { GitDirectoryComparison } from "./git/directory-comparison.js";
import { RegistryResolutionPolicy } from "./registry-resolution-policy.js";
import { SourceHostProviders } from "./service.js";
import { exactVersion } from "./test-helpers.js";
import { WorkspaceCatalog } from "./workspace-catalog.js";
import {
  AxmSkillCandidateGateTest,
  GitDirectoryComparisonTest,
  RegistryResolutionPolicyTest,
  SourceHostProvidersTest,
  WorkspaceCatalogTest,
} from "./testing.js";

const registrySource = {
  name: "company",
  type: "registry",
  location: new URL("https://registry.example.test"),
} as const satisfies RegistrySourceHost;

const versionEntry = (version: string): VersionEntry => ({
  version: exactVersion(version),
  published: DateTime.makeUnsafe("1960-01-01T00:00:00Z"),
  integrity: `sha512-${version}`,
});

describe("@agentxm/extension-sources/testing", () => {
  it.effect("composes every declared seam and round-trips the catalog's facts", () =>
    Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      expect(catalog.workspaceRoot).toBe("/srv/project");
      // A registry-typed configured source is a registry source host without
      // the fixture restating it.
      expect(yield* catalog.registrySourceHosts).toEqual([registrySource]);

      const policy = yield* RegistryResolutionPolicy;
      const selected = yield* policy.selectVersion(
        [versionEntry("1.0.0"), versionEntry("1.1.0")],
        Option.some("^1.0.0"),
        Option.none(),
      );
      expect(Option.getOrThrow(selected).version).toBe("1.1.0");

      const comparison = yield* GitDirectoryComparison;
      expect(
        Option.isNone(yield* comparison.compare({ directory: "/srv/project", currentPaths: [] })),
      ).toBe(true);

      const providers = yield* SourceHostProviders;
      expect(
        yield* Effect.scoped(
          providers.find(
            { ...registrySource, owner: Option.none() },
            { names: ["review"], type: "skill", owner: Option.none(), versionRange: Option.none() },
          ),
        ),
      ).toEqual([]);
      expect(Option.isNone(providers.cloneUrl({ ...registrySource, owner: Option.none() }))).toBe(
        true,
      );

      // The gate reads the candidate's package from the platform file system,
      // so it composes over the same services the product gives it.
      const gate = yield* AxmSkillCandidateGate;
      expect(typeof gate.evaluate).toBe("function");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          WorkspaceCatalogTest({ workspaceRoot: "/srv/project", sources: [registrySource] }),
          AxmSkillCandidateGateTest(),
          RegistryResolutionPolicyTest,
          GitDirectoryComparisonTest(),
          SourceHostProvidersTest(),
          NodeServices.layer,
        ),
      ),
    ),
  );
});
