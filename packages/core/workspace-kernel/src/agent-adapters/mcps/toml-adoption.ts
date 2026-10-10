/** Parser-derived edits select native keys independently of comments or ownership tags. */
import * as Effect from "effect/Effect";
import { parseTOML, type AST } from "toml-eslint-parser";
import { McpConfigInvalid } from "../errors.js";
import { stringifyToml, stringifyTomlKey, stringifyTomlValue } from "../toml.js";

const inlineValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(inlineValue).join(", ")}]`;
  if (typeof value === "object" && value !== null)
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${stringifyTomlKey(key)} = ${inlineValue(item)}`)
      .join(", ")} }`;
  return stringifyTomlValue(value);
};

export const editNativeTomlMcpEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
  entry: Readonly<Record<string, unknown>> | undefined,
) =>
  Effect.try({
    try: () => {
      const document = parseTOML(raw);
      const target = [...serversPath, serverName];
      const owns = (keys: ReadonlyArray<string | number>) =>
        target.every((part, index) => keys[index] === part);
      const ancestor = (keys: ReadonlyArray<string | number>) =>
        keys.length < target.length && keys.every((part, index) => target[index] === part);
      const spans: Array<readonly [number, number]> = [];
      const inlineSelections: Array<{
        readonly node: AST.TOMLKeyValue;
        readonly table: AST.TOMLInlineTable;
        readonly parentKeys: ReadonlyArray<string | number>;
      }> = [];
      let inlineEdit:
        { readonly start: number; readonly end: number; readonly text: string } | undefined;
      const visit = (node: AST.TOMLKeyValue, parent: ReadonlyArray<string | number>) => {
        const keys = [
          ...parent,
          ...node.key.keys.map((key) => (key.type === "TOMLBare" ? key.name : key.value)),
        ];
        if (owns(keys)) {
          if (node.parent.type === "TOMLInlineTable") {
            if (entry !== undefined && keys.length === target.length) {
              inlineEdit = {
                start: node.value.range[0],
                end: node.value.range[1],
                text: inlineValue(entry),
              };
            } else {
              inlineSelections.push({ node, table: node.parent, parentKeys: parent });
            }
          } else spans.push(node.range);
          return;
        }
        if (ancestor(keys) && node.value.type === "TOMLInlineTable") {
          for (const child of node.value.body) visit(child, keys);
          // An inline ancestor is closed to table extensions. Insert into it directly.
          if (
            entry !== undefined &&
            inlineEdit === undefined &&
            inlineSelections.length === 0 &&
            spans.length === 0
          ) {
            const remaining = target.slice(keys.length);
            const key = remaining.map(stringifyTomlKey).join(".");
            inlineEdit = {
              start: node.value.range[1] - 1,
              end: node.value.range[1] - 1,
              text: `${node.value.body.length === 0 ? "" : ", "}${key} = ${inlineValue(entry)}`,
            };
          }
        }
      };
      for (const node of document.body[0].body) {
        if (node.type === "TOMLTable" && owns(node.resolvedKey)) {
          spans.push(node.range);
        } else if (node.type === "TOMLTable") {
          for (const child of node.body) visit(child, node.resolvedKey);
        } else visit(node, []);
      }
      const selectedInline = inlineSelections[0];
      if (selectedInline !== undefined) {
        const { table, parentKeys } = selectedInline;
        const selected = new Set(inlineSelections.map(({ node }) => node));
        const runs: Array<readonly [number, number]> = [];
        for (let index = 0; index < table.body.length; index++) {
          const first = table.body[index];
          if (first === undefined || !selected.has(first)) continue;
          let lastIndex = index;
          while (true) {
            const next = table.body[lastIndex + 1];
            if (next === undefined || !selected.has(next)) break;
            lastIndex++;
          }
          const last = table.body[lastIndex];
          if (last === undefined) continue;
          const after = table.body[lastIndex + 1];
          const before = table.body[index - 1];
          runs.push([
            after !== undefined || before === undefined ? first.range[0] : before.range[1],
            after === undefined ? last.range[1] : after.range[0],
          ]);
          index = lastIndex;
        }
        let text = raw.slice(table.range[0], table.range[1]);
        for (const [start, end] of runs.reverse())
          text = text.slice(0, start - table.range[0]) + text.slice(end - table.range[0]);
        if (entry !== undefined) {
          const key = target.slice(parentKeys.length).map(stringifyTomlKey).join(".");
          const remaining = table.body.some((node) => !selected.has(node));
          text = text.slice(0, -1) + `${remaining ? ", " : ""}${key} = ${inlineValue(entry)} }`;
        }
        inlineEdit = { start: table.range[0], end: table.range[1], text };
      }
      let result = raw;
      if (inlineEdit !== undefined) {
        result = raw.slice(0, inlineEdit.start) + inlineEdit.text + raw.slice(inlineEdit.end);
      } else {
        // Comments are separate tokens, so table replacement preserves surrounding annotations.
        const tokens = document.tokens.filter((token) =>
          spans.some(([start, end]) => token.range[0] >= start && token.range[1] <= end),
        );
        for (const token of tokens.reverse())
          result = result.slice(0, token.range[0]) + result.slice(token.range[1]);
        if (entry !== undefined) {
          const parentHeaders = new Set(
            serversPath.map(
              (_, index) =>
                `[${serversPath
                  .slice(0, index + 1)
                  .map(stringifyTomlKey)
                  .join(".")}]`,
            ),
          );
          const nested = serversPath.reduceRight<Readonly<Record<string, unknown>>>(
            (value, key) => Object.fromEntries([[key, value]]),
            Object.fromEntries([[serverName, entry]]),
          );
          const rendered = stringifyToml(nested)
            .split("\n")
            .filter((line) => !parentHeaders.has(line))
            .join("\n")
            .trim();
          result += `${result.endsWith("\n") || result.length === 0 ? "" : "\n"}${rendered}\n`;
        }
      }
      parseTOML(result);
      return result;
    },
    catch: (cause) =>
      new McpConfigInvalid({
        detail: "Cannot edit the selected native TOML MCP entry safely",
        cause,
      }),
  });

export const detachNativeTomlMcpEntry = (
  raw: string,
  serversPath: ReadonlyArray<string>,
  serverName: string,
) => editNativeTomlMcpEntry(raw, serversPath, serverName, undefined);
