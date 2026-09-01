/**
 * Tests for SourceHostProvider interface shape.
 *
 * Validates that the new interfaces have the correct fields and that
 * implementations satisfy the type constraints.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import type { GitHostedSkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { GitHubSource, RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import type {
  SourceHostProvider,
  FindOptions,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry";
import { exactVersion, extensionName, handle, versionRange } from "../test-helpers.js";

type RegistryProviderWithPublish = SourceHostProvider<RegistrySource> & {
  readonly publishExtension: (
    owner: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void>;
};

// -----------------------------------------------------------------------------
// Mock Providers
// -----------------------------------------------------------------------------

const makeGitHubProvider = (): SourceHostProvider<GitHubSource> => ({
  type: "github",
  match: (url: URL) => Effect.succeed(url.hostname === "github.com"),
  find: (_source, _options) => Effect.succeed([]),
  fetch: (_source, _ref) => Effect.succeed({ directory: "/tmp/clone" }),
});

const makeRegistryProvider = (): RegistryProviderWithPublish => ({
  type: "registry",
  match: (_url: URL) => Effect.succeed(false),
  find: (_source, _options) => Effect.succeed([]),
  fetch: (_source, _ref) => Effect.succeed({ directory: "/tmp/extract" }),
  publishExtension: (
    _scope: string,
    _type: ExtensionType,
    _name: string,
    _version: string,
    _archive: Uint8Array,
    _metadata: VersionEntry,
  ) => Effect.void,
});

// -----------------------------------------------------------------------------
// SourceHostProvider
// -----------------------------------------------------------------------------

describe("SourceHostProvider", () => {
  it("has type discriminator matching the Source variant", () => {
    const provider = makeGitHubProvider();
    expect(provider.type).toBe("github");
  });

  it.effect("has match method that returns Effect<boolean>", () =>
    Effect.gen(function* () {
      const provider = makeGitHubProvider();
      const result = yield* provider.match(new URL("https://github.com/owner/repo"));
      expect(result).toBe(true);
    }),
  );

  it.effect("match returns false for non-matching URLs", () =>
    Effect.gen(function* () {
      const provider = makeGitHubProvider();
      const result = yield* provider.match(new URL("https://gitlab.com/owner/repo"));
      expect(result).toBe(false);
    }),
  );

  it.effect("has find method that returns Effect<ReadonlyArray<ExtensionRef>>", () =>
    Effect.gen(function* () {
      const provider = makeGitHubProvider();
      const source: GitHubSource = {
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "test",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      };
      const options: FindOptions = {
        names: [],
        type: "skill",
        owner: Option.none(),
        versionRange: Option.none(),
      };
      const result = yield* provider.find(source, options);
      expect(Array.isArray(result)).toBe(true);
    }),
  );

  it.effect("has fetch method that returns Effect<ExtensionFiles>", () =>
    Effect.gen(function* () {
      const provider = makeGitHubProvider();
      const source: GitHubSource = {
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "test",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      };
      const ref: GitHostedSkillRef = {
        type: "skill",
        refType: "git-hosted",
        owner: handle("@test"),
        name: extensionName("test-skill"),
        skill: {
          name: extensionName("test-skill"),
          description: Option.none(),
          metadata: Option.none(),
        },
        source,
        location: "file:///tmp/clone",
        gitTreeSha: "tree-1",
        gitCommitSha: "commit-1",
      };
      const result = yield* provider.fetch(source, ref);
      expect(result.directory).toBe("/tmp/clone");
    }),
  );
});

// -----------------------------------------------------------------------------
// Registry provider with publishExtension
// -----------------------------------------------------------------------------

describe("registry provider shape", () => {
  it("supports SourceHostProvider plus publishExtension", () => {
    const provider = makeRegistryProvider();
    expect(provider.type).toBe("registry");
    expect(typeof provider.match).toBe("function");
    expect(typeof provider.find).toBe("function");
    expect(typeof provider.fetch).toBe("function");
    expect(typeof provider.publishExtension).toBe("function");
  });

  it.effect("publishExtension returns Effect<void>", () =>
    Effect.gen(function* () {
      const provider = makeRegistryProvider();
      const metadata: VersionEntry = {
        version: exactVersion("1.0.0"),
        published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
        integrity: "sha512-AAAA==",
      };
      const result = yield* provider.publishExtension(
        "@test",
        "skill",
        "my-skill",
        "1.0.0",
        new Uint8Array(),
        metadata,
      );
      expect(result).toBeUndefined();
    }),
  );

  it("is assignable to SourceHostProvider", () => {
    const provider: RegistryProviderWithPublish = makeRegistryProvider();
    const base: SourceHostProvider<RegistrySource> = provider;
    expect(base.type).toBe("registry");
  });
});

// -----------------------------------------------------------------------------
// FindOptions
// -----------------------------------------------------------------------------

describe("FindOptions", () => {
  it("type field accepts ExtensionType", () => {
    const options: FindOptions = {
      names: [],
      type: "skill",
      owner: Option.none(),
      versionRange: Option.none(),
    };
    expect(options.type).toBe("skill");

    const packOptions: FindOptions = {
      names: [],
      type: "pack",
      owner: Option.none(),
      versionRange: Option.none(),
    };
    expect(packOptions.type).toBe("pack");

    const mcpOptions: FindOptions = {
      names: [],
      type: "mcp-server",
      owner: Option.none(),
      versionRange: Option.none(),
    };
    expect(mcpOptions.type).toBe("mcp-server");
  });

  it("type field accepts '*' wildcard", () => {
    const options: FindOptions = {
      names: [],
      type: "*",
      owner: Option.none(),
      versionRange: Option.none(),
    };
    expect(options.type).toBe("*");
  });

  it("accepts versionRange", () => {
    const options: FindOptions = {
      names: ["my-skill"],
      type: "skill",
      owner: Option.none(),
      versionRange: Option.some(versionRange("^1.2.3")),
    };
    expect(Option.getOrNull(options.versionRange)).toBe("^1.2.3");
  });
});
