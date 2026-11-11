import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { expect, it } from "@effect/vitest";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { testRegistryEndpoint } from "@agentxm/registry-client/testing";
import { NativePlatformTest } from "../../locations/testing.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { preflightPackagePlacement } from "./package-placement.js";

const ref = (version: string): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  name: decodeExtensionNameSync("review"),
  owner: decodeHandleSync("@acme"),
  version: decodeVersionSync(version),
  skill: {
    name: decodeExtensionNameSync("review"),
    description: Option.none(),
    metadata: Option.none(),
  },
  integrity: Option.some(`sha512-${"A".repeat(86)}==`),
  publisherBindingId: "publisher-1",
  packages: [],
  source: { type: "registry", name: "test", location: testRegistryEndpoint, owner: Option.none() },
});

it.effect("rejects two acquired snapshots for one retained package", () =>
  Effect.gen(function* () {
    const workspace = yield* makeSpecWorkspace("axm-placement-");
    const context = makeSpecContext(workspace.workspaceDir);
    const error = yield* preflightPackagePlacement([ref("1.0.0"), ref("1.1.0")], []).pipe(
      Effect.flip,
      Effect.provide(context.layer),
    );
    expect(error).toMatchObject({
      category: "conflict",
      detail: expect.stringContaining("disagree on the snapshot"),
    });
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect("allows an accepted exposure alongside a newer acquisition at the same address", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspace = yield* makeSpecWorkspace("axm-placement-");
    const context = makeSpecContext(workspace.workspaceDir);
    const paths = yield* preflightPackagePlacement([ref("1.1.0")], [ref("1.0.0")]).pipe(
      Effect.provide(context.layer),
    );
    expect(paths.some((target) => target.endsWith(path.join("@acme", "skills", "review")))).toBe(
      true,
    );
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
