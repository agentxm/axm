import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";
import { decodeExtensionNameSync } from "../../extensions/index.js";
import { normalizeHandle } from "../../extensions/handle.js";
import {
  makeBaseWorkspaceMock,
  makeRegistrySkillLockEntry,
  makeRegistryCommandLockEntry,
  makeRegistryMcpServerLockEntry,
  makeRegistryPackLockEntry,
} from "../test-stubs.js";
import { WorkspaceMutations } from "../service-interface.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../source-resolution/index.js";
import {
  collectSkillCurrency,
  collectSkillSourceFreshness,
  collectCommandCurrency,
  collectMcpServerCurrency,
  collectSubagentCurrency,
  collectPackCurrency,
  collectAllCurrencyEntries,
} from "./collectors.js";
import { makeExtensionIndex, makeStubRegistryClient } from "./test-stubs.js";

const v = decodeVersionSync;
const owner = normalizeHandle("@acme");

describe("collectSkillCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled skills", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review@^1.0.0",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("code-review", "skill", ["1.2.0", "1.1.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectSkillCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/skills/code-review");
      expect(entries[0]?.type).toBe("skill");
      expect(entries[0]?.installedVersion).toBe("1.0.0");
      expect(entries[0]?.currency.status).toBe("update-available");
      expect(Option.getOrThrow(entries[0]?.currency.latestMatching ?? Option.none())).toBe("1.2.0");
    }),
  );

  it.effect("skips disabled skills", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review",
              enabled: false,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
            }),
          }),
      });

      const index = makeExtensionIndex("code-review", "skill", ["1.2.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectSkillCurrency(client).pipe(Effect.provide(layer));
      expect(entries).toHaveLength(0);
    }),
  );

  it.effect("skips non-registry-sourced skills", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "local-skill": {
              source: "github:user/repo",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "local-skill": {
              type: "github" as const,
              owner: "user",
              repo: "repo",
              agents: ["claude-code"],
              installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            },
          }),
      });

      const client = makeStubRegistryClient([]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectSkillCurrency(client).pipe(Effect.provide(layer));
      expect(entries).toHaveLength(0);
    }),
  );
});

describe("collectSkillSourceFreshness", () => {
  it.effect("returns changed freshness entries for Git-hosted skills with new tree hash", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSources: () =>
          Effect.succeed([
            { name: "github", type: "github" as const, url: new URL("https://github.com") },
          ]),
        getConfiguredSkills: () =>
          Effect.succeed({
            "find-skills": {
              source: "github:vercel-labs/skills//skills/find-skills",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "find-skills": {
              type: "github" as const,
              owner: "vercel-labs",
              repo: "skills",
              path: "skills/find-skills",
              gitTreeHash: "old-tree",
              agents: ["codex"],
              installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            },
          }),
      });

      const sourceProviders: SourceHostProvidersService = {
        find: () =>
          Effect.succeed([
            {
              type: "skill",
              refType: "git-hosted",
              skill: {
                name: decodeExtensionNameSync("find-skills"),
                description: Option.some("Find skills"),
                metadata: Option.none(),
              },
              source: {
                type: "github",
                url: new URL("https://github.com"),
                owner: "vercel-labs",
                repo: "skills",
                ref: Option.none(),
                subPath: Option.some("skills/find-skills"),
              },
              location: "file:///tmp/find-skills",
              sourcePath: "skills/find-skills",
              gitTreeSha: Option.some("new-tree"),
            },
          ]),
        fetch: () => Effect.die(new Error("not used")),
        cloneUrl: () => Option.none(),
        origin: () => "https://github.com/vercel-labs/skills",
      };
      const layer = Layer.merge(
        Layer.merge(Layer.succeed(WorkspaceMutations, ws), NodeServices.layer),
        Layer.succeed(SourceHostProviders, sourceProviders),
      );

      const entries = yield* collectSkillSourceFreshness().pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.kind).toBe("source-freshness");
      expect(entries[0]?.ref).toBe("skills/find-skills");
      expect(entries[0]?.status).toBe("changed");
      expect(entries[0]?.installedTreeHash).toEqual(Option.some("old-tree"));
      expect(entries[0]?.currentTreeHash).toEqual(Option.some("new-tree"));
    }),
  );
});

describe("collectCommandCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled commands", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredCommands: () =>
          Effect.succeed({
            formatter: {
              source: "@acme/commands/formatter",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedCommands: () =>
          Effect.succeed({
            formatter: makeRegistryCommandLockEntry({
              owner,
              name: "formatter",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("formatter", "command", ["2.0.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectCommandCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/commands/formatter");
      expect(entries[0]?.type).toBe("command");
      expect(entries[0]?.currency.status).toBe("major-update-available");
    }),
  );
});

describe("collectMcpServerCurrency", () => {
  it.effect("returns currency entries for registry-sourced mcps", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredMcpServers: () =>
          Effect.succeed({
            "my-server": {
              source: "@acme/mcps/my-server@^1.0.0",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedMcpServers: () =>
          Effect.succeed({
            "my-server": makeRegistryMcpServerLockEntry({
              owner,
              name: "my-server",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("my-server", "mcp-server", ["1.1.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectMcpServerCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/mcps/my-server");
      expect(entries[0]?.type).toBe("mcp-server");
      expect(entries[0]?.currency.status).toBe("update-available");
    }),
  );
});

describe("collectSubagentCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled subagents", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSubagents: () =>
          Effect.succeed({
            "my-agent": {
              source: "@acme/subagents/my-agent",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSubagents: () =>
          Effect.succeed({
            "my-agent": {
              type: "registry" as const,
              owner,
              name: decodeExtensionNameSync("my-agent"),
              resolvedVersion: v("1.0.0"),
              integrity: "sha512-AAAA==",
              sourceName: "default",

              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
              installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
              updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            },
          }),
      });

      const index = makeExtensionIndex("my-agent", "subagent", ["1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectSubagentCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/subagents/my-agent");
      expect(entries[0]?.type).toBe("subagent");
      expect(entries[0]?.currency.status).toBe("current");
    }),
  );
});

describe("collectPackCurrency", () => {
  it.effect("returns currency entries for registry-sourced packs", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredPacks: () =>
          Effect.succeed({
            starter: {
              source: "@acme/packs/starter",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedPacks: () =>
          Effect.succeed({
            starter: makeRegistryPackLockEntry({
              owner,
              name: "starter",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("starter", "pack", ["1.5.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectPackCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/packs/starter");
      expect(entries[0]?.type).toBe("pack");
      expect(entries[0]?.currency.status).toBe("update-available");
    }),
  );
});

describe("collectAllCurrencyEntries", () => {
  it.effect("aggregates entries from all extension types", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
        getConfiguredCommands: () =>
          Effect.succeed({
            formatter: {
              source: "@acme/commands/formatter",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedCommands: () =>
          Effect.succeed({
            formatter: makeRegistryCommandLockEntry({
              owner,
              name: "formatter",
              resolvedVersion: v("2.0.0"),
            }),
          }),
      });

      const skillIndex = makeExtensionIndex("code-review", "skill", ["1.1.0", "1.0.0"]);
      const cmdIndex = makeExtensionIndex("formatter", "command", ["2.0.0"]);
      const client = makeStubRegistryClient([skillIndex, cmdIndex]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectAllCurrencyEntries(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(2);
      const skill = entries.find((e) => e.type === "skill");
      const command = entries.find((e) => e.type === "command");
      expect(skill?.currency.status).toBe("update-available");
      expect(command?.currency.status).toBe("current");
    }),
  );
});
