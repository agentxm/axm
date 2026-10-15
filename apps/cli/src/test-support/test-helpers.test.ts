import * as fs from "node:fs";
import * as path from "node:path";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { onTestFinished } from "vitest";
import { makeNativeFileStore } from "@agentxm/test-support";
import {
  runWorkspaceTransaction,
  WorkspaceTransactionScope,
  WorkspaceTransactionScopes,
} from "@agentxm/workspace-kernel/settlement";

import { makeWorkspaceLifecycleTestContext } from "./test-helpers.js";

it.effect.each(["workspace", "setup"] as const)(
  "uses the fixture-owned admission table for %s transactions",
  (kind) => {
    const files = makeNativeFileStore();
    const root = files.makeTempDirectory("axm-handler-scope-");
    const home = files.makeTempDirectory("axm-handler-home-");
    onTestFinished(() => {
      files.remove(root);
      files.remove(home);
    });
    const context = makeWorkspaceLifecycleTestContext({ wsOptions: { projectRoot: root } });
    const output = path.join(root, "output.txt");
    const layer = Layer.provide(
      context.fullLayer,
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
    );
    return Effect.gen(function* () {
      const scope =
        kind === "workspace"
          ? yield* WorkspaceTransactionScope
          : yield* Effect.flatMap(WorkspaceTransactionScopes, (scopes) =>
              scopes.forWorkspace({
                workspaceDir: path.join(root, ".axm"),
                nativeRoot: root,
                settingsPath: path.join(root, "axm.json"),
                lockPath: path.join(root, "axm-lock.yaml"),
              }),
            );
      yield* runWorkspaceTransaction({
        targets: [output],
        transition: Effect.sync(() => {
          expect(fs.existsSync(path.join(context.boundaryClaimsDirectory, "active.json"))).toBe(
            true,
          );
          fs.writeFileSync(output, "committed through owned admission");
        }),
        validate: () => Effect.void,
      }).pipe(Effect.provideService(WorkspaceTransactionScope, scope));
      expect(fs.readFileSync(output, "utf8")).toBe("committed through owned admission");
      expect(fs.existsSync(path.join(context.boundaryClaimsDirectory, "active.json"))).toBe(false);
    }).pipe(Effect.provide(layer));
  },
);
