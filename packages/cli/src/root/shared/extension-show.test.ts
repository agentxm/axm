import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { CATALOG_EXTENSION_TYPES } from "@agentxm/client-core/unstable/extension-types";
import { makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { EXTENSION_SHOW_ITEM_FIELDS, handleExtensionShow } from "./extension-show.js";

const configured = { source: "@acme/skills/thing", enabled: true };

/**
 * Settings key per catalog type. Written by hand rather than derived so the
 * fixture pins the wire shape the read model actually parses.
 */
const settingsFor = {
  skill: { skills: { thing: configured } },
  "mcp-server": { mcps: { thing: configured } },
  subagent: { subagents: { thing: configured } },
  rule: { rules: { thing: configured } },
  hook: { hooks: { thing: configured } },
  knowledge: { knowledge: { thing: configured } },
} as const satisfies Record<
  (typeof CATALOG_EXTENSION_TYPES)[number],
  Parameters<typeof writeWorkspaceFiles>[1]
>;

describe("extension show", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "extension-show-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  for (const type of CATALOG_EXTENSION_TYPES) {
    it.effect(`emits the shared item field set for ${type}`, () => {
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), settingsFor[type]);

      return provide(
        Effect.gen(function* () {
          yield* handleExtensionShow({ type, name: "thing" });

          const document = rendererState.results[0]?.data;
          expect(document).toBeDefined();
          expect(Object.keys(document ?? {})).toStrictEqual(["item", "agents"]);
          expect(
            Object.keys((document as { readonly item: Record<string, unknown> }).item),
          ).toStrictEqual(EXTENSION_SHOW_ITEM_FIELDS);
          expect(document).toMatchObject({
            item: { type, name: "thing", locked: false, version: null },
          });
        }),
      );
    });

    it.effect(`reports an unknown ${type} as not found`, () => {
      const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), settingsFor[type]);

      return provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(handleExtensionShow({ type, name: "absent" }));

          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure.code).toBe("not_found");
          }
        }),
      );
    });
  }
});
