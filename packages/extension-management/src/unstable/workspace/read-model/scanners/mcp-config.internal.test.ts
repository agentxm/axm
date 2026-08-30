import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeMcpConfigScanner } from "./mcp-config.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("makeMcpConfigScanner", () => {
  it.effect("skips non-conforming server names instead of crashing the scan", () =>
    withNode(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-scan-"));
        try {
          // A workspace .mcp.json with one valid AXM name and one that is not a
          // valid extension name (uppercase + underscore). The invalid name must
          // not crash the read-model scan.
          writeFileSync(
            nodePath.join(workspaceRoot, ".mcp.json"),
            JSON.stringify({
              mcpServers: {
                "valid-server": { command: "npx" },
                Invalid_Name: { command: "npx" },
              },
            }),
          );

          const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
          const occurrences = yield* makeMcpConfigScanner({
            fs,
            path,
            workspaceRoot,
            scope: "project",
            diagnostics: makeDiagnostics(ref),
            agentRegistry: { "claude-code": AGENTS["claude-code"] },
          });

          const names = occurrences.map((occurrence) => occurrence.name);
          expect(names).toContain("valid-server");
          expect(names).not.toContain("Invalid_Name");
          expect(occurrences).toHaveLength(1);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
