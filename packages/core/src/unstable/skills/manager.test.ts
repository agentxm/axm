import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "../agents/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { exactVersion, extensionName, handle, makeCodingAgentStub } from "../test-helpers.js";
import type { SkillLockEntry } from "../lockfile/schema.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import type { SetSkillArgs } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { SkillManager, SkillManagerLive } from "./manager.js";
import type { RegistrySkillRef } from "./refs.js";

const registryRef = (name: string): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL("http://localhost:4300"),
    owner: Option.some(handle("@acme")),
  },
  skill: {
    name: extensionName(name),
    description: Option.none(),
    metadata: Option.none(),
  },
  owner: handle("@acme"),
  name: extensionName(name),
  version: exactVersion("1.0.0"),
  integrity: Option.some("sha512-stub"),
  packages: [],
});

const testLayer = (setSkillLock: (args: SetSkillArgs) => Effect.Effect<void>) =>
  SkillManagerLive.pipe(
    Layer.provide(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock("/tmp/project/.axm", {
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          setSkillLock,
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(CodingAgentRepository, {
        get: () => Effect.succeed(makeCodingAgentStub("claude-code")),
        all: Effect.succeed([makeCodingAgentStub("claude-code")]),
        getConfiguredAgents: () => Effect.succeed([makeCodingAgentStub("claude-code")]),
        getMaterializationAgents: () => Effect.succeed([makeCodingAgentStub("claude-code")]),
        getUnknownConfiguredAgentIds: () => Effect.succeed([]),
      }),
    ),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        find: () => Effect.succeed([]),
        fetch: () => Effect.die(new Error("unused")),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      }),
    ),
    Layer.provide(NodeServices.layer),
  );

describe("SkillManager", () => {
  it.effect("stamps lockfile entries as retained by pack when requested", () => {
    let captured: SkillLockEntry | undefined;
    const setSkillLock = vi.fn((args: SetSkillArgs) => {
      captured = args.lockEntry;
      return Effect.void;
    });

    return Effect.gen(function* () {
      const manager = yield* SkillManager;
      yield* manager.upsertLockfileEntry({
        ref: registryRef("reviewer"),
        retainedByPack: true,
      });

      expect(setSkillLock).toHaveBeenCalledOnce();
      expect(captured?.retainedByPack).toBe(true);
    }).pipe(Effect.provide(testLayer(setSkillLock)));
  });
});
