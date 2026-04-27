/**
 * Pure `indexByName` / `findByName` helpers for projection rows that carry an
 * `ExtensionKey`. The helpers are exported once from a shared utility so every
 * subject module reuses the same lookup ergonomics without re-implementing.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import { findByName, indexByName } from "../../extensions/indexByName.js";
import type { ExtensionKey } from "../../types.js";

interface Row {
  readonly key: ExtensionKey<"skill">;
  readonly extra: string;
}

const row = (name: string, extra: string): Row => ({
  key: { scope: "project", type: "skill", name },
  extra,
});

describe("indexByName / findByName", () => {
  it("indexByName returns an immutable lookup keyed by name", () => {
    const rows: ReadonlyArray<Row> = [row("alpha", "a"), row("beta", "b")];
    const index = indexByName(rows);
    expect(index.size).toBe(2);
    expect(index.get("alpha")?.extra).toBe("a");
    expect(index.get("beta")?.extra).toBe("b");
  });

  it("indexByName: first row wins on duplicate names", () => {
    const rows: ReadonlyArray<Row> = [row("alpha", "first"), row("alpha", "second")];
    const index = indexByName(rows);
    expect(index.size).toBe(1);
    expect(index.get("alpha")?.extra).toBe("first");
  });

  it("findByName returns Option.some for existing name", () => {
    const rows: ReadonlyArray<Row> = [row("alpha", "a")];
    const found = findByName(rows, "alpha");
    expect(Option.isSome(found)).toBe(true);
    expect(Option.match(found, { onNone: () => null, onSome: (r) => r.extra })).toBe("a");
  });

  it("findByName returns Option.none for missing name", () => {
    const rows: ReadonlyArray<Row> = [row("alpha", "a")];
    const found = findByName(rows, "beta");
    expect(Option.isNone(found)).toBe(true);
  });

  it("findByName returns Option.none for empty rows", () => {
    const found = findByName<Row>([], "alpha");
    expect(Option.isNone(found)).toBe(true);
  });
});
