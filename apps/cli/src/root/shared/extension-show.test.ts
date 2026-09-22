import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { makeWorkspaceHandlerTestContext } from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { EXTENSION_SHOW_ITEM_FIELDS } from "@agentxm/workspace/inspection";
import { handleExtensionShow } from "./extension-show.js";
import { paintText } from "../../screen/index.js";

/**
 * Settings key per catalog type. Written by hand rather than derived so the
 * fixture pins the wire shape the read model actually parses.
 */
const settingsFor = {
  skill: { skills: { thing: { source: "@acme/skills/thing", enabled: true } } },
  "mcp-server": { mcps: { thing: { source: "@acme/mcps/thing", enabled: true } } },
  subagent: { subagents: { thing: { source: "@acme/subagents/thing", enabled: true } } },
  rule: { rules: { thing: { source: "@acme/rules/thing", enabled: true } } },
  hook: { hooks: { thing: { source: "@acme/hooks/thing", enabled: true } } },
  knowledge: { knowledge: { thing: { source: "@acme/knowledge/thing", enabled: true } } },
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
    it.effect(`prints the ${type} identity and source on stdout`, () => {
      const { provide, rendererState } = makeWorkspaceHandlerTestContext();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), settingsFor[type]);
      return provide(
        Effect.gen(function* () {
          yield* handleExtensionShow({ type, name: "thing" });
          const stdout = rendererState.docs
            .filter((entry) => entry.channel === "stdout")
            .flatMap((entry) => paintText(entry.doc, { width: "unbounded", colors: false }))
            .join("\n");
          expect(stdout).toContain("thing");
          expect(stdout).toContain("@acme/");
          expect(stdout).toContain("project");
          expect(rendererState.events.at(0)?._tag).toBe("OperationStarted");
          expect(rendererState.events.at(-1)?._tag).toBe("OperationSettled");
        }),
      );
    });

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
  }
});
