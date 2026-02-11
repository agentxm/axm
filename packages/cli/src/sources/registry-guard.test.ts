import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { SourceConfig } from "../settings/index.js";
import { makeTextInputTestLayer } from "../tui/index.js";
import { Workspace, type WorkspaceContextService } from "../workspace/index.js";
import { RegistryNotConfiguredError } from "./provider.js";
import { registryGuard } from "./registry-guard.js";

describe("registryGuard", () => {
  type RegistrySource = Extract<SourceConfig, { type: "registry" }>;

  const makeWorkspaceLayer = (opts: {
    registrySources?: ReadonlyArray<RegistrySource>;
    nonInteractive?: boolean;
    addSourceMock?: () => Effect.Effect<void, never>;
  }) => {
    const addSource = opts.addSourceMock ?? vi.fn(() => Effect.void);
    const registrySources: ReadonlyArray<RegistrySource> = opts.registrySources ?? [];

    const mockWorkspace: WorkspaceContextService = {
      global: false,
      path: "/test",
      nonInteractive: opts.nonInteractive ?? false,
      preview: false,
      resolvePlan: vi.fn(),
      getConfiguredSources: vi.fn(() => Effect.succeed([])),
      getConfiguredSourceByName: vi.fn(() => Effect.succeed(Option.none())),
      getConfiguredRegistrySources: () => Effect.succeed(registrySources),
      getConfiguredScope: () => Effect.succeed("default"),
      addConfiguredSource: addSource,
      getInstalledSkills: vi.fn(() => Effect.succeed({})),
      getConfiguredAgents: vi.fn(() => Effect.succeed([])),
      getLockedSkills: vi.fn(() => Effect.succeed({})),
      getLockedSkill: vi.fn(() => Effect.succeed(Option.none())),
      setSkill: vi.fn(() => Effect.void),
      removeSkill: vi.fn(() => Effect.void),
      addConfiguredAgent: vi.fn(() => Effect.void),
    };

    return Layer.succeed(Workspace, mockWorkspace);
  };

  it.effect("passes when registry sources already configured", () =>
    Effect.gen(function* () {
      const existingRegistry: SourceConfig = {
        name: "existing",
        type: "registry",
        url: new URL("file:///path/to/registry"),
      };

      const workspaceLayer = makeWorkspaceLayer({ registrySources: [existingRegistry] });
      const [textInputLayer] = makeTextInputTestLayer();
      const testLayer = Layer.mergeAll(workspaceLayer, textInputLayer, NodeContext.layer);

      yield* registryGuard.pipe(Effect.provide(testLayer));

      // Should not fail - guard passes when registry is configured
      expect(true).toBe(true);
    }),
  );

  it.effect("fails with RegistryNotConfiguredError in non-interactive mode", () =>
    Effect.gen(function* () {
      const workspaceLayer = makeWorkspaceLayer({
        registrySources: [],
        nonInteractive: true,
      });
      const [textInputLayer] = makeTextInputTestLayer();
      const testLayer = Layer.mergeAll(workspaceLayer, textInputLayer, NodeContext.layer);

      const result = yield* registryGuard.pipe(Effect.provide(testLayer), Effect.flip);

      expect(result).toBeInstanceOf(RegistryNotConfiguredError);
      expect(result.message).toContain("No registry source configured");
    }),
  );

  it.effect("prompts for path and persists in interactive mode", () =>
    Effect.gen(function* () {
      const addSourceMock = vi.fn(() => Effect.void);
      const workspaceLayer = makeWorkspaceLayer({
        registrySources: [],
        nonInteractive: false,
        addSourceMock,
      });

      const [textInputLayer] = makeTextInputTestLayer({
        type: "return",
        value: "/home/user/registry",
      });

      const testLayer = Layer.mergeAll(workspaceLayer, textInputLayer, NodeContext.layer);

      yield* registryGuard.pipe(Effect.provide(testLayer));

      // Verify addSource was called with normalized path
      expect(addSourceMock).toHaveBeenCalledWith({
        name: "local",
        type: "registry",
        url: new URL("file:///home/user/registry"),
      });
    }),
  );

  it.effect("expands tilde in path when prompting", () =>
    Effect.gen(function* () {
      const addSourceMock = vi.fn(() => Effect.void);
      const workspaceLayer = makeWorkspaceLayer({
        registrySources: [],
        nonInteractive: false,
        addSourceMock,
      });

      const [textInputLayer] = makeTextInputTestLayer({
        type: "return",
        value: "~/my-registry",
      });

      const testLayer = Layer.mergeAll(workspaceLayer, textInputLayer, NodeContext.layer);

      yield* registryGuard.pipe(Effect.provide(testLayer));

      // Verify addSource was called with expanded path
      expect(addSourceMock).toHaveBeenCalledTimes(1);
      const call = addSourceMock.mock.calls[0] as [SourceConfig] | undefined;
      expect(call).toBeDefined();
      if (call) {
        const config = call[0];
        if (config?.type === "registry") {
          expect(config.url.href).not.toContain("~");
          expect(config.url.href).toMatch(/^file:\/\/\/.*my-registry$/);
        } else {
          throw new Error("Expected registry source");
        }
      }
    }),
  );

  it.effect("guard changes visible to subsequent calls", () =>
    Effect.gen(function* () {
      // This test verifies that after the guard persists a source,
      // subsequent calls to getConfiguredRegistrySources would see it.
      // We test this by mocking addSource and verifying it was called with the correct args.

      const addSourceMock = vi.fn(() => Effect.void);
      const workspaceLayer = makeWorkspaceLayer({
        registrySources: [],
        nonInteractive: false,
        addSourceMock,
      });

      const [textInputLayer] = makeTextInputTestLayer({
        type: "return",
        value: "/new/registry",
      });

      const testLayer = Layer.mergeAll(workspaceLayer, textInputLayer, NodeContext.layer);

      yield* registryGuard.pipe(Effect.provide(testLayer));

      // Verify addSource was called
      expect(addSourceMock).toHaveBeenCalledTimes(1);
      expect(addSourceMock).toHaveBeenCalledWith({
        name: "local",
        type: "registry",
        url: new URL("file:///new/registry"),
      });
    }),
  );
});
