import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  AgentCatalogReferenceSchema,
  makeAgentCatalogReference,
} from "@agentxm/extension-model/unstable/agent-capabilities";

const generatedPath = resolve(
  import.meta.dirname,
  "../site-content/__generated__/agent-catalog/agent-catalog.json",
);

describe("agent catalog reference", () => {
  it("contains one exact public projection for every catalog agent", () => {
    const generated = Schema.decodeUnknownSync(AgentCatalogReferenceSchema, {
      onExcessProperty: "error",
    })(JSON.parse(readFileSync(generatedPath, "utf8")));

    expect(generated).toEqual(makeAgentCatalogReference(AGENTS));
    expect(generated.schemaVersion).toBe(1);
    expect(generated.entries).toHaveLength(AGENTS.length);
    expect(new Set(generated.entries.map((agent) => agent.id)).size).toBe(AGENTS.length);
  });

  it("is deterministic and excludes operational catalog data", () => {
    const first = makeAgentCatalogReference(AGENTS);
    const second = makeAgentCatalogReference(AGENTS);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /"(?:writer|detection|permissions|rootDir|targeting|entryDialect)":/u,
    );
  });
});
