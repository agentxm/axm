/**
 * Every autofix operation the lint catalog can emit has an `adaptIntent` arm.
 *
 * `adaptIntent` used to fall through to a generic "unknown operation" for four
 * names that were already in the vocabulary, so a rule could emit an intent
 * `axm lint --fix` silently dropped. This is a static check rather than a
 * behavioural one because the failure mode is a missing `case`, and enumerating
 * every arm behaviourally would need a seeded workspace per extension type.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { PER_EXTENSION_OPERATION_NAMES } from "@agentxm/client-core/unstable/lint";

const handlerSource = fs.readFileSync(path.join(import.meta.dirname, "handler.ts"), "utf8");

describe("axm lint --fix adapter coverage", () => {
  it("has an adaptIntent arm for every operation name in the vocabulary", () => {
    const missing = PER_EXTENSION_OPERATION_NAMES.filter(
      (name) => !handlerSource.includes(`case "${name}":`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the unknown-operation fallback for names outside the vocabulary", () => {
    expect(handlerSource).toContain('return unmapped(op.name, "unknown operation");');
  });
});
