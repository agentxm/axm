/**
 * MCP installation delegates native writes to the shared agent synchronization.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const kindDir = nodePath.dirname(fileURLToPath(import.meta.url));

const kindSource = (relativePath: string): string =>
  nodeFs.readFileSync(nodePath.join(kindDir, relativePath), "utf8");

describe("mcp-connections projection conformance", () => {
  it("installs through the shared agent sync", () => {
    expect(kindSource("install/install-operation.ts")).toContain("syncManifestMcpServerToAgents");
  });
});
