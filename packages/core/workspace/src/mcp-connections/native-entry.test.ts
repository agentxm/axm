import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { retireNativeMcpEntry } from "./native-entry.js";

describe("retireNativeMcpEntry", () => {
  const roots: Array<string> = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  const configWith = (contents: string): string => {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-native-mcp-"));
    roots.push(root);
    const filePath = nodePath.join(root, ".mcp.json");
    fs.writeFileSync(filePath, contents);
    return filePath;
  };

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it.effect("removes only the converted entry and leaves the rest of the file intact", () =>
    Effect.gen(function* () {
      const filePath = configWith(
        `${JSON.stringify(
          {
            mcpServers: { context: { url: "https://x.test" }, other: { url: "https://y.test" } },
            unrelated: { keep: true },
          },
          null,
          2,
        )}\n`,
      );

      yield* run(retireNativeMcpEntry({ filePath, serversKey: "mcpServers", name: "context" }));

      expect(JSON.parse(fs.readFileSync(filePath, "utf-8"))).toStrictEqual({
        mcpServers: { other: { url: "https://y.test" } },
        unrelated: { keep: true },
      });
    }),
  );

  it.effect("treats an already-absent entry as settled", () =>
    Effect.gen(function* () {
      const filePath = configWith(`${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);
      const before = fs.readFileSync(filePath, "utf-8");

      yield* run(retireNativeMcpEntry({ filePath, serversKey: "mcpServers", name: "context" }));

      expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
    }),
  );

  it.effect("refuses when the server collection changed shape and writes nothing", () =>
    Effect.gen(function* () {
      const filePath = configWith(`${JSON.stringify({ mcpServers: ["context"] }, null, 2)}\n`);
      const before = fs.readFileSync(filePath, "utf-8");

      const failure = yield* run(
        retireNativeMcpEntry({ filePath, serversKey: "mcpServers", name: "context" }),
      ).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "NativeMcpEntryRetirementFailed",
        category: "conflict",
        detail: `MCP server collection changed before package conversion: ${filePath}`,
      });
      expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
    }),
  );

  it.effect("reports an unparsable config as a validation failure", () =>
    Effect.gen(function* () {
      const filePath = configWith("{ not json");

      const failure = yield* run(
        retireNativeMcpEntry({ filePath, serversKey: "mcpServers", name: "context" }),
      ).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "NativeMcpEntryRetirementFailed",
        category: "validation",
      });
    }),
  );
});
