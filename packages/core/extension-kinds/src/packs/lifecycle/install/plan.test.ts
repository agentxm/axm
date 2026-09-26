/**
 * The pack source grammar.
 *
 * `packs install` accepts the shared source grammar, including a registry
 * pattern or a bare name resolved against the configured owner. Reading the
 * grammar is a decision the settled request carries, so these examples parse
 * the request and read the parsed fields — or the refusal — back.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { RegistryClientFactory } from "@agentxm/registry-client";

import { createDefaultSettings } from "@agentxm/workspace-kernel/workspace-state";
import { handle, WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import { parsePackInstallRequest } from "./plan.js";

describe("pack install source grammar", () => {
  /**
   * A workspace whose only relevant setting is the owner a bare name resolves
   * to. Reading the grammar resolves no source, so the source, catalog, and
   * Registry ports refuse any use.
   */
  const workspaceOwnedBy = (owner: string) =>
    Layer.mergeAll(
      WorkspaceReadTest({
        baseDir: "/workspace",
        settings: { ...createDefaultSettings(), owner: handle(owner), agents: [] },
      }),
      Layer.mock(SourceHostProviders, {
        cloneUrl: () => Option.none(),
        origin: () => "unused",
      }),
      Layer.mock(WorkspaceCatalog, { workspaceRoot: "/workspace" }),
      Layer.mock(RegistryClientFactory, {}),
      NodeServices.layer,
    );

  const parse = (owner: string, source: string) =>
    Effect.scoped(parsePackInstallRequest({ source, nonInteractive: true })).pipe(
      Effect.provide(workspaceOwnedBy(owner)),
    );

  it.effect("accepts @owner/packs/pack-name format", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "@acme/packs/my-pack");
      expect(parsed.owner).toEqual(Option.some("@acme"));
      expect(parsed.packName).toEqual(Option.some("my-pack"));
      expect(parsed.versionRange).toEqual(Option.none());
      expect(parsed.inputKind).toBe("registry-pattern-input");
    }),
  );

  it.effect("accepts @owner/packs/pack-name@^2.0.0 with version constraint", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "@acme/packs/my-pack@^2.0.0");
      expect(parsed.owner).toEqual(Option.some("@acme"));
      expect(parsed.packName).toEqual(Option.some("my-pack"));
      expect(parsed.versionRange).toEqual(Option.some("^2.0.0"));
    }),
  );

  it.effect("resolves bare pack-name to @defaultScope/packs/pack-name", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@myorg", "my-pack");
      expect(parsed.owner).toEqual(Option.some("@myorg"));
      expect(parsed.packName).toEqual(Option.some("my-pack"));
      expect(parsed.resolvedInput).toBe("@myorg/packs/my-pack");
    }),
  );

  it.effect("resolves bare pack-name@version with default owner", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@myorg", "my-pack@^2.0.0");
      expect(parsed.owner).toEqual(Option.some("@myorg"));
      expect(parsed.packName).toEqual(Option.some("my-pack"));
      expect(parsed.versionRange).toEqual(Option.some("^2.0.0"));
      expect(parsed.resolvedInput).toBe("@myorg/packs/my-pack@^2.0.0");
    }),
  );

  it.effect("routes non-FQN slash input through source resolution", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "@acme/my-pack");
      expect(parsed.inputKind).toBe("source-locator-input");
    }),
  );

  it.effect("accepts local path sources", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "./local-path");
      expect(parsed.inputKind).toBe("source-locator-input");
      expect(parsed.resolvedInput).toBe("./local-path");
    }),
  );

  it.effect("accepts github shorthand sources", () =>
    Effect.gen(function* () {
      const parsed = yield* parse("@acme", "github:owner/repo");
      expect(parsed.inputKind).toBe("source-locator-input");
      expect(parsed.resolvedInput).toBe("github:owner/repo");
    }),
  );
});
