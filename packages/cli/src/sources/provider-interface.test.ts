/**
 * Tests for SourceHostProvider and PublishableSourceHostProvider interface shape.
 *
 * Validates that the new interfaces have the correct fields and that
 * implementations satisfy the type constraints.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { BuiltinSource, GitHubSource, RegistrySource, SourceExtensionRef } from "./types.js";
import type { SourceHostProvider, PublishableSourceHostProvider, FindOptions } from "./provider.js";
import type { RegistryExtensionType, VersionEntry } from "../registry/index.js";

// -----------------------------------------------------------------------------
// Mock Providers
// -----------------------------------------------------------------------------

const makeGitHubProvider = (): SourceHostProvider<GitHubSource> => ({
  type: "github",
  match: (url: URL) => Effect.succeed(url.hostname === "github.com"),
  find: (_source, _options) => Effect.succeed([]),
  fetch: (_source, _ref) => Effect.succeed({ directory: "/tmp/clone" }),
});

const makeRegistryProvider = (): PublishableSourceHostProvider<RegistrySource> => ({
  type: "registry",
  match: (_url: URL) => Effect.succeed(false),
  find: (_source, _options) => Effect.succeed([]),
  fetch: (_source, _ref) => Effect.succeed({ directory: "/tmp/extract" }),
  publishVersion: (
    _scope: string,
    _type: RegistryExtensionType,
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

  it("has find method that returns Effect<ReadonlyArray<SourceExtensionRef>>", async () => {
    const provider = makeGitHubProvider();
    const source: GitHubSource = {
      type: "github",
      url: new URL("https://github.com"),
      owner: "test",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    };
    const options: FindOptions = { names: [], agents: [], type: "skill" };
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
    const ref = {} as SourceExtensionRef;
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
// PublishableSourceHostProvider
// -----------------------------------------------------------------------------

describe("PublishableSourceHostProvider", () => {
  it("extends SourceHostProvider with publishVersion", () => {
    const provider = makeRegistryProvider();
    expect(provider.type).toBe("registry");
    expect(typeof provider.match).toBe("function");
    expect(typeof provider.find).toBe("function");
    expect(typeof provider.fetch).toBe("function");
    expect(typeof provider.publishVersion).toBe("function");
  });

  it("publishVersion returns Effect<void>", async () => {
    const provider = makeRegistryProvider();
    const metadata: VersionEntry = {
      version: "1.0.0",
      published: "2025-01-01T00:00:00Z",
      agents: ["claude-code"],
      checksum: "sha256:0000",
    };
    const result = await Effect.runPromise(
      provider.publishVersion("@test", "skill", "my-skill", "1.0.0", new Uint8Array(), metadata),
    );
    expect(result).toBeUndefined();
  });

  it("is assignable to SourceHostProvider (base interface)", () => {
    const provider: PublishableSourceHostProvider<RegistrySource> = makeRegistryProvider();
    // A PublishableSourceHostProvider can be treated as a SourceHostProvider
    const base: SourceHostProvider<RegistrySource> = provider;
    expect(base.type).toBe("registry");
  });
});

// -----------------------------------------------------------------------------
// FindOptions
// -----------------------------------------------------------------------------

describe("FindOptions", () => {
  it("type field accepts FindableExtensionType", () => {
    const options: FindOptions = { names: [], agents: [], type: "skill" };
    expect(options.type).toBe("skill");

    const packOptions: FindOptions = { names: [], agents: [], type: "pack" };
    expect(packOptions.type).toBe("pack");

    const mcpOptions: FindOptions = { names: [], agents: [], type: "mcp-server" };
    expect(mcpOptions.type).toBe("mcp-server");
  });

  it("type field accepts '*' wildcard", () => {
    const options: FindOptions = { names: [], agents: [], type: "*" };
    expect(options.type).toBe("*");
  });
});
