/** Parser-derived edits preserve every foreign token and comment during adoption. */
import * as Effect from "effect/Effect";
import { parseTOML } from "toml-eslint-parser";
import { McpConfigInvalid } from "../errors.js";

export const detachNativeTomlMcpEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
) =>
  Effect.try({
    try: () => {
      const document = parseTOML(raw);
      const target = [...serversPath, serverName];
      const owns = (keys: ReadonlyArray<string | number>) =>
        target.every((part, index) => keys[index] === part);
      const spans: Array<readonly [number, number]> = [];
      for (const node of document.body[0].body) {
        if (node.type === "TOMLTable" && owns(node.resolvedKey)) {
          spans.push(node.range);
          continue;
        }
        const parent = node.type === "TOMLTable" ? node.resolvedKey : [];
        for (const entry of node.type === "TOMLTable" ? node.body : [node]) {
          const keys = [
            ...parent,
            ...entry.key.keys.map((key) => (key.type === "TOMLBare" ? key.name : key.value)),
          ];
          if (owns(keys)) spans.push(entry.range);
        }
      }
      if (spans.length === 0)
        throw new Error("The native entry has no independently editable TOML table or key");
      // Comments are not tokens in this parser; removing token spans leaves them intact.
      const tokens = document.tokens.filter((token) =>
        spans.some(([start, end]) => token.range[0] >= start && token.range[1] <= end),
      );
      let result = raw;
      for (const token of tokens.reverse())
        result = result.slice(0, token.range[0]) + result.slice(token.range[1]);
      parseTOML(result);
      return result;
    },
    catch: () =>
      new McpConfigInvalid({
        detail:
          "TOML MCP entry cannot be adopted without affecting foreign syntax; give it a standalone table in the source",
      }),
  });
