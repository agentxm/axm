/**
 * Unit tests for the commands install handler.
 *
 * Verifies preview rendering flows through plan sections rather than a
 * handler-local preview branch.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import type { RegistryCommandRef } from "@agentxm/client-core/unstable/commands";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import { exactVersion, extensionName, handle } from "../../../test-stubs.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { handleInstallCommand } from "./handler.js";
import {
  InstallCommandCommandWorkflowActions,
  type CommandInstallSourceRequest,
  type ParsedCommandInstallArgs,
} from "./command-actions.js";
import type { InstallCommandCommandIntent } from "./intent.js";

const commandRef: RegistryCommandRef = {
  type: "command",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL("file:///tmp/registry"),
    owner: Option.none(),
  },
  command: { name: extensionName("my-cmd") },
  owner: handle("@acme"),
  name: extensionName("my-cmd"),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  publisherBindingId: "hbnd_test",
  packages: [],
};

const parsedArgs: ParsedCommandInstallArgs = {
  source: {
    type: "registry",
    location: new URL("file:///tmp/registry"),
    owner: Option.none(),
  },
  owner: Option.some(handle("@acme")),
  commandNames: [extensionName("my-cmd")],
  versionRange: Option.none<VersionRange>(),
  force: false,
};

const sourceRequest: CommandInstallSourceRequest = {
  source: {
    type: "registry",
    location: new URL("file:///tmp/registry"),
    owner: Option.none(),
  },
  owner: Option.some(handle("@acme")),
  commandNames: [extensionName("my-cmd")],
  versionRange: Option.none<VersionRange>(),
};

const installIntent: InstallCommandCommandIntent = {
  refs: [{ ref: commandRef, versionRange: Option.none<VersionRange>() }],
  force: false,
};

describe("commands install.handler preview", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-install-handler-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext({
      wsOptions: {
        projectRoot: tempDir,
      },
    });
    const actionsLayer = Layer.succeed(InstallCommandCommandWorkflowActions, {
      parseArgs: () => Effect.succeed(parsedArgs),
      resolveSourceRequests: () => Effect.succeed([sourceRequest]),
      discoverRefs: () => Effect.succeed([commandRef]),
      finalizeIntent: () => Effect.succeed(installIntent),
      buildPlan: () =>
        Effect.succeed({
          _tag: "Plan" as const,
          name: "Install command",
          description: Option.some("Install command my-cmd"),
          jobs: [
            {
              concurrency: 1 as const,
              steps: [
                {
                  readiness: "ready" as const,
                  label: "my-cmd",
                  run: Effect.succeed({
                    result: "success" as const,
                    message: "Installed my-cmd",
                  }),
                },
              ],
            },
          ],
          sections: [
            {
              title: "Target agents",
              items: ["claude-code", "cursor"],
            },
          ],
        }),
    });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, actionsLayer);
    return { ...ctx, provide: makeEffectProvide(fullLayer) };
  };

  it.effect("renders preview sections from the plan", () => {
    const { provide, logs } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleInstallCommand({
          source: Option.some("my-cmd"),
          yes: false,
          force: false,
          preview: true,
        });

        expect(logs.message.some((message) => message.includes("Target agents"))).toBe(true);
        expect(logs.message.some((message) => message.includes("claude-code"))).toBe(true);
        expect(logs.message.some((message) => message.includes("cursor"))).toBe(true);
      }),
    );
  });

  it.effect("does not render preview sections when preview is false", () => {
    const { provide, logs } = makeLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleInstallCommand({
          source: Option.some("my-cmd"),
          yes: true,
          force: false,
          preview: false,
        });

        expect(logs.message.some((message) => message.includes("Target agents"))).toBe(false);
      }),
    );
  });
});
