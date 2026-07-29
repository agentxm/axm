import { describe, expect, it } from "vitest";

import { checkLedgerShrinkOnly, countSeededRows } from "./parity-ledger-check-lib.js";

const row = (seeded: boolean): string =>
  `{ obligation: "2.6-source-hash", reason: "r", trackedBy: "AXM-985"${seeded ? ", seed: true" : ""} },`;

describe("countSeededRows", () => {
  it("counts only seed-tagged rows", () => {
    const source = [row(true), row(false), row(true)].join("\n");
    expect(countSeededRows(source)).toBe(2);
  });
});

describe("checkLedgerShrinkOnly", () => {
  it("passes when the count shrinks", () => {
    expect(checkLedgerShrinkOnly(row(true), [row(true), row(true)].join("\n"))).toEqual({
      ok: true,
      current: 1,
      baseline: 2,
    });
  });

  it("fails when the count rises", () => {
    expect(checkLedgerShrinkOnly([row(true), row(true)].join("\n"), row(true))).toEqual({
      ok: false,
      current: 2,
      baseline: 1,
    });
  });

  it("passes with no baseline on main yet", () => {
    expect(checkLedgerShrinkOnly(row(true), undefined)).toEqual({
      ok: true,
      current: 1,
      baseline: undefined,
    });
  });
});
