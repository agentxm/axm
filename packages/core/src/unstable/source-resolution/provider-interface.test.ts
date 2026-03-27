/**
 * Tests for SourceHostProvider interface shape.
 *
 * Validates that the new interfaces have the correct fields and that
 * implementations satisfy the type constraints.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type {
  BuiltinSource,
  GitHostedSkillRef,
  GitHubSource,
  RegistrySource,
  SourceHostProvider,
  FindOptions,
} from "../sources/index.js";
import type { ExtensionType } from "../extensions/index.js";
import type { VersionEntry } from "../registry/index.js";

type RegistryProviderWithPublish = SourceHostProvider<RegistrySource> & {
  readonly publishExtension: (
    profile: string,
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

const makeBuiltinProvider = (): SourceHostProvider<BuiltinSource> => ({
  type: "builtin",
  match: (_url: URL) => Effect.succeed(false),
  find: (_source, _options) => Effect.succeed([]),
  fetch: (_source, _ref) => Effect.succeed({ directory: "/builtin" }),
});

// -----------------------------------------------------------------------------
// SourceHostProvider
// -----------------------------------------------------------------------------

describe("SourceHostProvider", () => {
  it("has type discriminator matching the Source variant", () => {
    const provider = makeGitHubProvider();
    expect(provider.type).toBe("github");
  });

  it("has match method that returns Effect<boolean>", async () => {
    const provider = makeGitHubProvider();
    const result = await Effect.runPromise(
      provider.match(new URL("https://github.com/owner/repo")),
    );
    expect(result).toBe(true);
  });

  it("match returns false for non-matching URLs", async () => {
    const provider = makeGitHubProvider();
    const result = await Effect.runPromise(
      provider.match(new URL("https://gitlab.com/owner/repo")),
    );
    expect(result).toBe(false);
  });

  it("has find method that returns Effect<ReadonlyArray<ExtensionRef>>", async () => {
    const provider = makeGitHubProvider();
    const source: GitHubSource = {
      type: "github",
      url: new URL("https://github.com"),
      owner: "test",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const options: FindOptions = {
      skillNames: [],
      type: "skill",
      profile: Option.none(),
      versionConstraint: Option.none(),
    };
    const result = await Effect.runPromise(provider.find(source, options));
    expect(Array.isArray(result)).toBe(true);
  });

  it("has fetch method that returns Effect<ExtensionFiles>", async () => {
    const provider = makeGitHubProvider();
    const source: GitHubSource = {
      type: "github",
      url: new URL("https://github.com"),
      owner: "test",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const ref: GitHostedSkillRef = {
      type: "skill",
      refType: "git-hosted",
      skill: { name: "test-skill", description: Option.none(), metadata: Option.none() },
      source,
      location: "file:///tmp/clone",
      gitTreeSha: Option.none(),
    };
    const result = await Effect.runPromise(provider.fetch(source, ref));
    expect(result.directory).toBe("/tmp/clone");
  });

  it("builtin provider type is 'builtin'", () => {
    const provider = makeBuiltinProvider();
    expect(provider.type).toBe("builtin");
  });

  it("builtin provider match always returns false", async () => {
    const provider = makeBuiltinProvider();
    const result = await Effect.runPromise(provider.match(new URL("https://example.com")));
    expect(result).toBe(false);
  });
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

  it("publishExtension returns Effect<void>", async () => {
    const provider = makeRegistryProvider();
    const metadata: VersionEntry = {
      version: "1.0.0",
      published: "2025-01-01T00:00:00Z",
      integrity: "sha512-AAAA==",
    };
    const result = await Effect.runPromise(
      provider.publishExtension("@test", "skill", "my-skill", "1.0.0", new Uint8Array(), metadata),
    );
    expect(result).toBeUndefined();
  });

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
      skillNames: [],
      type: "skill",
      profile: Option.none(),
      versionConstraint: Option.none(),
    };
    expect(options.type).toBe("skill");

    const packOptions: FindOptions = {
      skillNames: [],
      type: "pack",
      profile: Option.none(),
      versionConstraint: Option.none(),
    };
    expect(packOptions.type).toBe("pack");

    const mcpOptions: FindOptions = {
      skillNames: [],
      type: "mcp-server",
      profile: Option.none(),
      versionConstraint: Option.none(),
    };
    expect(mcpOptions.type).toBe("mcp-server");
  });

  it("type field accepts '*' wildcard", () => {
    const options: FindOptions = {
      skillNames: [],
      type: "*",
      profile: Option.none(),
      versionConstraint: Option.none(),
    };
    expect(options.type).toBe("*");
  });

  it("accepts versionConstraint", () => {
    const options: FindOptions = {
      skillNames: ["my-skill"],
      type: "skill",
      profile: Option.none(),
      versionConstraint: Option.some("^1.2.3"),
    };
    expect(Option.getOrNull(options.versionConstraint)).toBe("^1.2.3");
  });
});
