/**
 * MCP server subject module tests.
 *
 * Scanner composition: canonical-extensions + mcp-config (workspace + agent).
 * Activation is "enabled" by policy — there is no declared `enabled` field.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedSettings } from "../../__fixtures__/decoders.js";
import {
  makeAgentMcpConfigOccurrence,
  makeCanonicalOccurrence,
  makeWorkspaceMcpConfigOccurrence,
} from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeMcpServerExtensionsApi } from "../../extensions/mcp-server.js";
import type { CanonicalExtensionOccurrence, McpConfigOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";

const settingsWithMcpServers = (
  mcpServers: Record<string, { source: string }>,
): Effect.Effect<Settings, never> => decodedSettings({ mcpServers }).pipe(Effect.orDie);

const harness = (params: {
  readonly settings?: Settings;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly mcpConfigOccurrences?: ReadonlyArray<McpConfigOccurrence>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    return yield* makeMcpServerExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.none()),
      },
      scanners: {
        canonical: Effect.succeed(params.canonicalOccurrences ?? []),
        mcpConfig: Effect.succeed(params.mcpConfigOccurrences ?? []),
      },
      installedPacks: Effect.succeed([]),
      diagnostics,
    });
  });

describe("makeMcpServerExtensionsApi", () => {
  it.effect("declared returns parsed mcpServers map", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithMcpServers({ tools: { source: "github:owner/tools" } });
      const api = yield* harness({ settings });
      const declared = yield* api.declared;
      const arr = Option.match(declared, { onNone: () => [], onSome: (d) => d });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("tools");
    }),
  );

  it.effect("actual composes canonical + mcp-config occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "mcp-server",
            origin: "canonical-axm",
            name: "tools",
            owner: "@owner",
            contentLocation: "/ws/agent_extensions/@owner/mcps/tools",
          }),
        ],
        mcpConfigOccurrences: [
          makeWorkspaceMcpConfigOccurrence({
            scope: "project",
            name: "tools",
            contentLocation: "/ws/.mcp.json",
          }),
          makeAgentMcpConfigOccurrence({
            scope: "project",
            agentId: "claude-code",
            name: "tools",
            contentLocation: "/ws/.claude/mcp.json",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(3);
      const origins = actual.map((a) => a.origin._tag).sort();
      expect(origins).toContain("canonical-axm-mcp-server");
      expect(origins).toContain("workspace-mcp-config");
      expect(origins).toContain("agent-mcp-config");
    }),
  );

  it.effect("installed activation is always enabled (policy)", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithMcpServers({ tools: { source: "github:owner/tools" } });
      const api = yield* harness({ settings });
      const installed = yield* api.installed;
      const active = yield* api.active;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.activation).toBe("enabled");
      expect(active).toHaveLength(1);
    }),
  );

  it.effect("unmanaged surfaces drift between settings and .mcp.json", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithMcpServers({
        declared: { source: "github:owner/declared" },
      });
      const api = yield* harness({
        settings,
        mcpConfigOccurrences: [
          makeWorkspaceMcpConfigOccurrence({
            scope: "project",
            name: "drifted",
            contentLocation: "/ws/.mcp.json",
          }),
        ],
      });
      const unmanaged = yield* api.unmanaged;
      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0]?.key.name).toBe("drifted");
    }),
  );
});
