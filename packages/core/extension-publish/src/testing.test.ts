import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { GitDirectoryComparison } from "@agentxm/extension-sources";
import { AuthClient, PendingPublishAuthorizationStore } from "@agentxm/registry-auth";

import { PUBLISHABLE_TYPES, type PublishableType } from "./publishable-types.js";
import {
  FIXTURE_OWNER,
  PublishPortsTest,
  authoredSettingsKey,
  makePublishTarget,
  publishRequest,
  writeAuthoredExtension,
} from "./testing.js";

describe("@agentxm/extension-publish/testing", () => {
  it("writes every publishable type as its `new` command leaves it", () => {
    const workspaceRoot = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-publish-testing-")),
    );
    try {
      const publishableTypes = [
        "skill",
        "mcp-server",
        "subagent",
        "rule",
        "hook",
        "knowledge",
        "pack",
      ] as const satisfies ReadonlyArray<PublishableType>;
      // The published table is the authority on how many rows there are, so a
      // new publishable type fails this example instead of slipping past it.
      expect(publishableTypes).toHaveLength(Object.keys(PUBLISHABLE_TYPES).length);
      for (const type of publishableTypes) {
        const packageDir = writeAuthoredExtension(workspaceRoot, type, { name: "review" });
        const manifestPath = nodePath.join(
          packageDir,
          fs.readdirSync(packageDir).filter((entry) => entry.endsWith(".json"))[0] ?? "",
        );
        const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest).toMatchObject({
          owner: FIXTURE_OWNER,
          type,
          name: "review",
          version: "1.0.0",
        });
        // Every settings key a fixture declares its authored entry under is a
        // real key of the seven-type table, not a guess per test.
        expect(typeof authoredSettingsKey[type]).toBe("string");
      }

      const target = makePublishTarget(workspaceRoot);
      // A publish target starts empty: a conflict has to be published into it.
      expect(target.storedFiles()).toEqual([]);

      const request = publishRequest(target.url);
      expect(request.preview).toBe(true);
      expect(Option.getOrThrow(request.registryUrl)).toBe(target.url);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it.effect("composes every port a publish statically requires", () =>
    Effect.gen(function* () {
      const auth = yield* AuthClient;
      expect(typeof auth.getMe).toBe("function");
      const pending = yield* PendingPublishAuthorizationStore;
      expect(typeof pending.load).toBe("function");
      const comparison = yield* GitDirectoryComparison;
      // A temporary fixture directory is inside no worktree, and the default
      // comparison says exactly that rather than inventing a clean tree.
      expect(
        Option.isNone(yield* comparison.compare({ directory: "/tmp/axm", currentPaths: [] })),
      ).toBe(true);
    }).pipe(Effect.provide(PublishPortsTest())),
  );
});
