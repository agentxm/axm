/**
 * Structural conformance gate for this kind's projection participant.
 *
 * The kind manager reaches projection through the kernel's shared plans rather
 * than constructing or applying ownership units itself.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const kindDir = nodePath.dirname(fileURLToPath(import.meta.url));

const kindSource = (relativePath: string): string =>
  nodeFs.readFileSync(nodePath.join(kindDir, relativePath), "utf8");

describe("mcp-connections projection conformance", () => {
  it("routes its ownership units through the shared plan", () => {
    expect(kindSource("manager.ts")).toContain("planSingletonProjection");
  });

  it("installs through the shared agent sync", () => {
    expect(kindSource("install/install-operation.ts")).toContain("syncManifestMcpServerToAgents");
  });
});
