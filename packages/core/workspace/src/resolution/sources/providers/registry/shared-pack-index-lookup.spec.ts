import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { defineSpecification } from "@agentxm/specification-metadata";
import { createLocalRegistryClient, RegistryOperationFailed } from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";

import {
  extensionName,
  exactVersion,
  handle,
  makeTestAxmSkillGate,
  makeTestRegistryResolutionPolicy,
} from "../../test-helpers.js";
import { createRemoteRegistrySourceHostProvider } from "./host-provider.js";
import { RegistryIndexMemo, makeRegistryIndexMemo } from "./index-memo.js";

export const specification = defineSpecification({
  requirement: "workspace/pack-member-index-is-shared-without-sharing-selection",
  title: "Shared pack members read metadata once while each constraint selects independently",
  statement:
    "During one pack-planning phase, concurrent lookups for the same Registry member shall share one index read while preserving each pack's own version and release-age selection, and a failed read shall be retried rather than retained as a successful observation.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "A controlled Registry provider and blocked index lookup expose in-flight sharing and independent policy decisions under two incoming constraints.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const source: RegistrySource = {
  type: "registry",
  name: "test",
  location: new URL("https://registry.example.test"),
  owner: Option.some(handle("@test")),
};

const index: ExtensionIndex = {
  owner: handle("@test"),
  type: "skill",
  name: extensionName("shared"),
  publisherBindingId: "hbnd_test",
  archival: null,
  deprecation: null,
  versions: [
    {
      version: exactVersion("1.0.0"),
      published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
      integrity: "sha512-one",
    },
    {
      version: exactVersion("2.0.0"),
      published: DateTime.makeUnsafe("2025-01-02T00:00:00Z"),
      integrity: "sha512-two",
    },
  ],
};

const options = (versionRange: string) => ({
  name: "shared",
  type: "skill" as const,
  owner: handle("@test"),
  versionRange: Option.some(versionRange),
  releaseAgeEvaluation: {
    minimumReleaseAge: Duration.zero,
    evaluatedAt: DateTime.makeUnsafe("2025-01-03T00:00:00Z"),
    mode: "enforce" as const,
  },
});

describe("Shared Registry index for pack planning", () => {
  it.effect("coalesces concurrent index reads and preserves both incoming ranges", () =>
    Effect.gen(function* () {
      const client = createLocalRegistryClient(
        "/tmp/axm-unused-index-provider",
        yield* FileSystem.FileSystem,
        yield* Path.Path,
      );
      const provider = createRemoteRegistrySourceHostProvider(client);
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let reads = 0;
      const memo = yield* makeRegistryIndexMemo(() =>
        Effect.gen(function* () {
          reads += 1;
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release);
          return Option.some(index);
        }),
      );
      const first = yield* provider
        .resolveNamed(source, options("^1.0.0"))
        .pipe(Effect.provideService(RegistryIndexMemo, memo), Effect.forkChild);
      yield* Deferred.await(started);
      const second = yield* provider
        .resolveNamed(source, options("^2.0.0"))
        .pipe(Effect.provideService(RegistryIndexMemo, memo), Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);
      const results = [yield* Fiber.join(first), yield* Fiber.join(second)];

      expect(reads).toBe(1);
      expect(
        results.map((result) => (result.kind === "selected" ? result.ref.version : null)),
      ).toEqual(["1.0.0", "2.0.0"]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          makeTestAxmSkillGate(),
          makeTestRegistryResolutionPolicy(),
        ),
      ),
    ),
  );

  it.effect("retries a transient index failure within the planning phase", () =>
    Effect.gen(function* () {
      let reads = 0;
      const memo = yield* makeRegistryIndexMemo(() => {
        reads += 1;
        return reads === 1
          ? Effect.fail(
              new RegistryOperationFailed({ category: "network", detail: "temporary failure" }),
            )
          : Effect.succeed(Option.some(index));
      });
      const args = { owner: index.owner, type: index.type, name: index.name };
      const failure = yield* memo.get(source.location.href, source.name, args).pipe(Effect.flip);
      expect(failure).toMatchObject({ category: "network" });
      expect(yield* memo.get(source.location.href, source.name, args)).toEqual(Option.some(index));
      expect(reads).toBe(2);
    }),
  );
});
