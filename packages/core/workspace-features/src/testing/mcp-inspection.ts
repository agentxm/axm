/**
 * MCP inspection observations for specifications outside the inspection
 * feature. A feature never imports another feature, so a reconciliation
 * specification that checks what `mcps list` and `mcps show` report reads them
 * through this shared test support.
 */
import * as Effect from "effect/Effect";

import { LocalInspection } from "../inspection/index.js";

/** The subject `mcps show --all` reports for one MCP server, if present. */
export const inspectedMcpServer = (name: string) =>
  LocalInspection.query({ selection: { kind: "all" }, types: ["mcp-server"] }).pipe(
    Effect.map((listed) => listed.items.find((candidate) => candidate.identity.name === name)),
  );

/** What `mcps show <name>` reports for one MCP server. */
export const shownMcpServer = (name: string) =>
  LocalInspection.query({
    selection: { kind: "identities", identities: [name] },
    types: ["mcp-server"],
  }).pipe(
    Effect.flatMap((document) => {
      const item = document.items[0];
      return item === undefined
        ? Effect.die(new Error(`Expected inspected MCP ${name}`))
        : Effect.succeed(item);
    }),
  );
