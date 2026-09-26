/**
 * MCP inspection observations for specifications outside the inspection
 * feature. A feature never imports another feature, so a reconciliation
 * specification that checks what `mcps list` and `mcps show` report reads them
 * through this shared test support.
 */
import * as Effect from "effect/Effect";

import { listMcpServers, ShowExtension } from "../inspection/index.js";

/** The row `mcps list` reports for one MCP server, if it lists one. */
export const listedMcpServer = (name: string) =>
  listMcpServers().pipe(
    Effect.map((listed) => listed.rows.find((candidate) => candidate.name === name)),
  );

/** What `mcps show <name>` reports for one MCP server. */
export const shownMcpServer = (name: string) => ShowExtension.query({ type: "mcp-server", name });
