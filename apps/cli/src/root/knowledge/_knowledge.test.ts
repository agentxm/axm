import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_DISCOVERY_OPERATIONS,
  KNOWLEDGE_QUERY_OPERATORS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
} from "@agentxm/workspace/knowledge/query";

import { captureHelpText as captureHelp } from "../../test-support/command-tree-test-helpers.js";

describe("knowledge command", () => {
  it.effect("exposes discovery, lifecycle, and publish commands", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["knowledge"]);
      expect(output).toContain("list");
      expect(output).toContain("concepts");
      expect(output).toContain("lint");
      expect(output).toContain("install");
      expect(output).toContain("update");
      expect(output).toContain("uninstall");
      expect(output).toContain("publish");
      expect(output).not.toMatch(/^\s+(?:search|open)\s/mu);

      const concepts = yield* captureHelp(["knowledge", "concepts"]);
      for (const operation of KNOWLEDGE_DISCOVERY_OPERATIONS) {
        expect(concepts).toMatch(new RegExp(`^\\s+${operation}\\s`, "mu"));
      }
    }),
  );

  it("keeps authored help aligned with the runtime operators and searchable fields", () => {
    const help = fs.readFileSync(
      fileURLToPath(new URL("../../../help/topics/knowledge.md", import.meta.url)),
      "utf8",
    );
    for (const operator of KNOWLEDGE_QUERY_OPERATORS) expect(help).toContain(`\`${operator}\``);
    for (const field of KNOWLEDGE_SEARCHABLE_FIELDS) expect(help).toContain(`\`${field}\``);
  });

  it.effect("supports linting a locally authored package path", () =>
    Effect.gen(function* () {
      const output = yield* captureHelp(["knowledge", "lint"]);
      expect(output).toContain("--path");
      expect(output).toContain("locally authored");
    }),
  );
});
