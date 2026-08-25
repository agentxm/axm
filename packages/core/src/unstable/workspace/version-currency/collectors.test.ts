import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { decodeVersionSync, type Version } from "../../version-constraints/version-constraints.js";
import { handle } from "../../test-helpers.js";
import { decodeExtensionNameSync, type ExtensionRef } from "../../extensions/index.js";
import { normalizeHandle } from "../../extensions/handle.js";
import {
  configuredRow,
  makeBaseWorkspaceMock,
  rowsFor,
  makeRegistrySkillLockEntry,
  makeRegistryMcpServerLockEntry,
  makeRegistryPackLockEntry,
  TEST_CONTENT_IDENTITY,
  TEST_TREE_INTEGRITY,
} from "../test-stubs.js";
import { WorkspaceMutations } from "../service-interface.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../source-resolution/index.js";
import {
  collectSkillCurrency,
  collectSkillSourceFreshness,
  collectHookSourceFreshness,
  collectKnowledgeSourceFreshness,
  collectMcpServerSourceFreshness,
  collectMcpServerCurrency,
  collectSubagentCurrency,
  collectPackCurrency,
  collectRuleCurrency,
  collectHookCurrency,
  collectKnowledgeCurrency,
  collectAllCurrencyEntries,
} from "./collectors.js";
import { makeExtensionIndex, makeStubRegistryClient } from "./test-stubs.js";

const v = decodeVersionSync;
const owner = normalizeHandle("@acme");

/**
 * Registry lock fields shared verbatim by the rule/hook/knowledge lock unions,
 * none of which has a dedicated factory in workspace/test-stubs.ts.
 */
const makeRegistryLockFields = <const TType extends "rule" | "hook" | "knowledge">(opts: {
  readonly extensionType: TType;
  readonly name: string;
  readonly resolvedVersion?: Version;
}) => ({
  type: "registry" as const,
  sourceType: "registry" as const,
  endpoint: new URL("https://registry.agentxm.ai"),
  extensionType: opts.extensionType,
  workspaceName: decodeExtensionNameSync(opts.name),
  packageFormat: "agentxm" as const,
  owner,
  name: decodeExtensionNameSync(opts.name),
  resolvedVersion: opts.resolvedVersion ?? v("1.0.0"),
  integrity: "sha512-AAAA==",
  sourceName: "agentxm",
  publisherBindingId: "hbnd_test",
  treeIntegrity: TEST_TREE_INTEGRITY,
});

describe("collectSkillCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled skills", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        rows: rowsFor({
          skill: [
            configuredRow({
              type: "skill",
              name: "code-review",
              source: "agentxm:@acme/skills/code-review@^1.0.0",
              packagingKind: "non-native",
            }),
          ],
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
        rows: rowsFor({
          skill: [
            configuredRow({
              type: "skill",
              name: "code-review",
              source: "@acme/skills/code-review",
              enabled: false,
              packagingKind: "non-native",
            }),
          ],
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
        rows: rowsFor({
          skill: [
            configuredRow({
              type: "skill",
              name: "local-skill",
              source: "github:user/repo",
              packagingKind: "non-native",
            }),
          ],
        }),
        getLockedSkills: () =>
          Effect.succeed({
            "local-skill": {
              type: "github" as const,
              sourceType: "github" as const,
              sourceName: "github",
              endpoint: new URL("https://github.com"),
              extensionType: "skill" as const,
              workspaceName: decodeExtensionNameSync("local-skill"),
              packageFormat: "agentxm" as const,
              packageOwner: handle("@local"),
              packageName: decodeExtensionNameSync("local-skill"),
              owner: "user",
              repo: "repo",
              resolvedCommit: "commit-1",
              resolvedTree: "tree-1",
              contentIdentity: TEST_CONTENT_IDENTITY,
              treeIntegrity: TEST_TREE_INTEGRITY,
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
        rows: rowsFor({
          skill: [
            configuredRow({
              type: "skill",
              name: "find-skills",
              source: "github:vercel-labs/skills//skills/find-skills",
              packagingKind: "non-native",
            }),
          ],
        }),
        getLockedSkills: () =>
          Effect.succeed({
            "find-skills": {
              type: "github" as const,
              sourceType: "github" as const,
              sourceName: "github",
              endpoint: new URL("https://github.com"),
              extensionType: "skill" as const,
              workspaceName: decodeExtensionNameSync("find-skills"),
              packageFormat: "agentxm" as const,
              packageOwner: handle("@vercel-labs"),
              packageName: decodeExtensionNameSync("find-skills"),
              owner: "vercel-labs",
              repo: "skills",
              path: "skills/find-skills",
              resolvedCommit: "commit-1",
              resolvedTree: "old-tree",
              contentIdentity: TEST_CONTENT_IDENTITY,
              treeIntegrity: TEST_TREE_INTEGRITY,
            },
          }),
      });

      const sourceProviders: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () =>
          Effect.succeed([
            {
              type: "skill",
              refType: "git-hosted",
              owner: handle("@vercel-labs"),
              name: decodeExtensionNameSync("find-skills"),
              skill: {
                name: decodeExtensionNameSync("find-skills"),
                description: Option.some("Find skills"),
                metadata: Option.none(),
              },
              source: {
                type: "github",
                name: "github",
                url: new URL("https://github.com"),
                owner: "vercel-labs",
                repo: "skills",
                ref: Option.none(),
                subPath: Option.some("skills/find-skills"),
              },
              location: "file:///tmp/find-skills",
              sourcePath: "skills/find-skills",
              gitTreeSha: "new-tree",
              gitCommitSha: "commit-2",
            },
          ]),
        fetch: () => Effect.die(new Error("not used")),
        cloneUrl: () => Option.none(),
        origin: () => "https://github.com/vercel-labs/skills",
      };
      const layer = Layer.merge(
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          NodeServices.layer,
          FetchHttpClient.layer,
        ),
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

describe("git-source freshness beyond skills", () => {
  const gitLockEntry = <const TType extends "hook" | "knowledge">(
    extensionType: TType,
    repo: string,
    resolvedTree: string,
  ) => ({
    type: "github" as const,
    sourceType: "github" as const,
    sourceName: "github",
    endpoint: new URL("https://github.com"),
    extensionType,
    workspaceName: decodeExtensionNameSync(repo),
    packageFormat: "agentxm" as const,
    packageOwner: handle("@acme"),
    packageName: decodeExtensionNameSync(repo),
    owner: "acme",
    repo,
    resolvedCommit: "commit-1",
    resolvedTree,
    contentIdentity: TEST_CONTENT_IDENTITY,
    treeIntegrity: TEST_TREE_INTEGRITY,
  });

  const providersReturning = (refs: ReadonlyArray<ExtensionRef>): SourceHostProvidersService => ({
    resolveNamedRegistry: () => Effect.die("not used"),
    find: () => Effect.succeed(refs),
    fetch: () => Effect.die(new Error("not used")),
    cloneUrl: () => Option.none(),
    origin: () => "https://github.com/acme/pkg",
  });

  const gitSource = (repo: string) => ({
    type: "github" as const,
    name: "github",
    url: new URL("https://github.com"),
    owner: "acme",
    repo,
    ref: Option.none(),
    subPath: Option.none(),
  });

  const namePayload = (name: string) => ({
    name: decodeExtensionNameSync(name),
    description: Option.none(),
    metadata: Option.none(),
  });

  const configuredSources = () =>
    Effect.succeed([
      { name: "github", type: "github" as const, url: new URL("https://github.com") },
    ]);

  it.effect("reports a current hook whose upstream tree hash matches", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSources: configuredSources,
        getConfiguredHookEntries: () =>
          Effect.succeed({ guard: { source: "github:acme/guard", enabled: true } }),
        getLockedHooks: () => Effect.succeed({ guard: gitLockEntry("hook", "guard", "same-tree") }),
      });
      const layer = Layer.merge(
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          NodeServices.layer,
          FetchHttpClient.layer,
        ),
        Layer.succeed(
          SourceHostProviders,
          providersReturning([
            {
              type: "hook",
              refType: "git-hosted",
              owner: handle("@acme"),
              name: decodeExtensionNameSync("guard"),
              hook: namePayload("guard"),
              source: gitSource("guard"),
              location: "file:///tmp/guard",
              sourcePath: "guard",
              gitTreeSha: "same-tree",
              gitCommitSha: "commit-1",
            },
          ]),
        ),
      );

      const entries = yield* collectHookSourceFreshness().pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.type).toBe("hook");
      expect(entries[0]?.status).toBe("current");
    }),
  );

  it.effect("reports unknown for a knowledge bundle whose source cannot resolve", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSources: () => Effect.succeed([]),
        getConfiguredKnowledgeEntries: () =>
          Effect.succeed({
            "domain-model": { source: "unknown-host:acme/domain-model", enabled: true },
          }),
        getLockedKnowledge: () =>
          Effect.succeed({
            "domain-model": gitLockEntry("knowledge", "domain-model", "old-tree"),
          }),
      });
      const layer = Layer.merge(
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          NodeServices.layer,
          FetchHttpClient.layer,
        ),
        Layer.succeed(SourceHostProviders, providersReturning([])),
      );

      const entries = yield* collectKnowledgeSourceFreshness().pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.type).toBe("knowledge");
      expect(entries[0]?.status).toBe("unknown");
      expect(Option.isSome(entries[0]?.reason ?? Option.none())).toBe(true);
    }),
  );

  it.effect("skips inline MCP server lock entries", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSources: configuredSources,
        rows: rowsFor({
          "mcp-server": [
            configuredRow({
              type: "mcp-server",
              name: "local-server",
              source: "inline",
              packagingKind: "non-native",
            }),
          ],
        }),
        getLockedMcpServers: () => Effect.succeed({}),
      });
      const layer = Layer.merge(
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          NodeServices.layer,
          FetchHttpClient.layer,
        ),
        Layer.succeed(SourceHostProviders, providersReturning([])),
      );

      const entries = yield* collectMcpServerSourceFreshness().pipe(Effect.provide(layer));

      expect(entries).toHaveLength(0);
    }),
  );
});

describe("collectMcpServerCurrency", () => {
  it.effect("returns currency entries for registry-sourced mcps", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        rows: rowsFor({
          "mcp-server": [
            configuredRow({
              type: "mcp-server",
              name: "my-server",
              source: "@acme/mcps/my-server@^1.0.0",
              packagingKind: "non-native",
            }),
          ],
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
        rows: rowsFor({
          subagent: [
            configuredRow({
              type: "subagent",
              name: "my-agent",
              source: "@acme/subagents/my-agent",
              packagingKind: "non-native",
            }),
          ],
        }),
        getLockedSubagents: () =>
          Effect.succeed({
            "my-agent": {
              type: "registry" as const,
              sourceType: "registry" as const,
              endpoint: new URL("https://registry.agentxm.ai"),
              extensionType: "subagent" as const,
              workspaceName: decodeExtensionNameSync("my-agent"),
              packageFormat: "agentxm" as const,
              owner,
              name: decodeExtensionNameSync("my-agent"),
              resolvedVersion: v("1.0.0"),
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              treeIntegrity: TEST_TREE_INTEGRITY,
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
        rows: rowsFor({
          pack: [
            configuredRow({
              type: "pack",
              name: "starter",
              source: "@acme/packs/starter",
              packagingKind: "non-native",
            }),
          ],
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

describe("collectRuleCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled rules", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredRuleEntries: () =>
          Effect.succeed({
            "api-conventions": {
              source: "@acme/rules/api-conventions@^1.0.0",
              enabled: true,
            },
          }),
        getLockedRules: () =>
          Effect.succeed({
            "api-conventions": makeRegistryLockFields({
              extensionType: "rule",
              name: "api-conventions",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("api-conventions", "rule", ["1.3.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectRuleCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/rules/api-conventions");
      expect(entries[0]?.type).toBe("rule");
      expect(entries[0]?.currency.status).toBe("update-available");
      expect(Option.getOrThrow(entries[0]?.constraint ?? Option.none())).toBe("^1.0.0");
    }),
  );

  it.effect("skips disabled rules", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredRuleEntries: () =>
          Effect.succeed({
            "api-conventions": { source: "@acme/rules/api-conventions", enabled: false },
          }),
        getLockedRules: () =>
          Effect.succeed({
            "api-conventions": makeRegistryLockFields({
              extensionType: "rule",
              name: "api-conventions",
            }),
          }),
      });

      const index = makeExtensionIndex("api-conventions", "rule", ["1.3.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectRuleCurrency(client).pipe(Effect.provide(layer));
      expect(entries).toHaveLength(0);
    }),
  );

  it.effect("skips non-registry-sourced rules", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredRuleEntries: () =>
          Effect.succeed({
            "local-rule": { source: "github:user/repo", enabled: true },
          }),
        getLockedRules: () =>
          Effect.succeed({
            "local-rule": {
              type: "github" as const,
              sourceType: "github" as const,
              sourceName: "github",
              endpoint: new URL("https://github.com"),
              extensionType: "rule" as const,
              workspaceName: decodeExtensionNameSync("local-rule"),
              packageFormat: "agentxm" as const,
              packageOwner: handle("@local"),
              packageName: decodeExtensionNameSync("local-rule"),
              owner: "user",
              repo: "repo",
              resolvedCommit: "commit-1",
              resolvedTree: "tree-1",
              contentIdentity: TEST_CONTENT_IDENTITY,
              treeIntegrity: TEST_TREE_INTEGRITY,
            },
          }),
      });

      const client = makeStubRegistryClient([]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectRuleCurrency(client).pipe(Effect.provide(layer));
      expect(entries).toHaveLength(0);
    }),
  );
});

describe("collectHookCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled hooks", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredHookEntries: () =>
          Effect.succeed({
            "block-secrets": { source: "@acme/hooks/block-secrets@^1.0.0", enabled: true },
          }),
        getLockedHooks: () =>
          Effect.succeed({
            "block-secrets": makeRegistryLockFields({
              extensionType: "hook",
              name: "block-secrets",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("block-secrets", "hook", ["2.0.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectHookCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/hooks/block-secrets");
      expect(entries[0]?.type).toBe("hook");
      expect(entries[0]?.currency.status).toBe("major-update-available");
    }),
  );
});

describe("collectKnowledgeCurrency", () => {
  it.effect("returns currency entries for registry-sourced enabled knowledge bundles", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredKnowledgeEntries: () =>
          Effect.succeed({
            payments: { source: "@acme/knowledge/payments@^1.0.0", enabled: true },
          }),
        getLockedKnowledge: () =>
          Effect.succeed({
            payments: makeRegistryLockFields({
              extensionType: "knowledge",
              name: "payments",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("payments", "knowledge", ["1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectKnowledgeCurrency(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(1);
      expect(entries[0]?.ref).toBe("@acme/knowledge/payments");
      expect(entries[0]?.type).toBe("knowledge");
      expect(entries[0]?.currency.status).toBe("current");
    }),
  );
});

describe("collectAllCurrencyEntries", () => {
  it.effect("aggregates entries from all extension types", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        rows: rowsFor({
          skill: [
            configuredRow({
              type: "skill",
              name: "code-review",
              source: "@acme/skills/code-review",
              packagingKind: "non-native",
            }),
          ],
        }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
        getConfiguredRuleEntries: () =>
          Effect.succeed({
            "api-conventions": { source: "@acme/rules/api-conventions", enabled: true },
          }),
        getLockedRules: () =>
          Effect.succeed({
            "api-conventions": makeRegistryLockFields({
              extensionType: "rule",
              name: "api-conventions",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const skillIndex = makeExtensionIndex("code-review", "skill", ["1.1.0", "1.0.0"]);
      const ruleIndex = makeExtensionIndex("api-conventions", "rule", ["1.4.0", "1.0.0"]);
      const client = makeStubRegistryClient([skillIndex, ruleIndex]);
      const layer = Layer.succeed(WorkspaceMutations, ws);

      const entries = yield* collectAllCurrencyEntries(client).pipe(Effect.provide(layer));

      expect(entries).toHaveLength(2);
      const skill = entries.find((e) => e.type === "skill");
      const rule = entries.find((e) => e.type === "rule");
      expect(skill?.currency.status).toBe("update-available");
      expect(rule?.currency.status).toBe("update-available");
    }),
  );
});
