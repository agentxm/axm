import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vitest";

import { formatDeprecationWarning } from "./deprecation-warning.js";

const deprecatedAt = DateTime.makeUnsafe("2026-09-25T00:00:00.000Z");
const source = "@acme/skills/old";

describe("deprecation warning actions", () => {
  it("offers migration for an available successor or an obsolete extension", () => {
    expect(
      formatDeprecationWarning(source, {
        deprecatedAt,
        reason: "superseded",
        replacement: { status: "available", fqn: "@acme/skills/new" },
      }),
    ).toContain(`axm migrate ${source} --dry-run`);
    expect(
      formatDeprecationWarning(source, {
        deprecatedAt,
        reason: "obsolete",
        message: "No longer needed.",
      }),
    ).toContain(`axm migrate ${source} --dry-run`);
  });

  it("points manual decisions and unavailable successors to inspection", () => {
    for (const deprecation of [
      { deprecatedAt, reason: "superseded", replacement: { status: "unavailable" } },
      { deprecatedAt, reason: "unmaintained" },
      { deprecatedAt, reason: "other", message: "Choose a maintained extension." },
    ] as const) {
      const warning = formatDeprecationWarning(source, deprecation);
      expect(warning).toContain(`axm view ${source}`);
      expect(warning).not.toContain("axm migrate");
    }
  });
});
