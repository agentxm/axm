import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { computeIntegrity } from "@agentxm/host-primitives";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import { VerifiedArchive } from "./verified-archive.js";

it.effect("mints evidence only for bytes matching the expected integrity", () =>
  Effect.gen(function* () {
    const bytes = new Uint8Array([1, 2, 3]);
    const integrity = yield* computeIntegrity(bytes);
    const facts: WorkFact[] = [];
    const [matching, mismatching] = yield* Effect.all([
      VerifiedArchive.check(bytes, integrity),
      VerifiedArchive.check(bytes, yield* computeIntegrity(new Uint8Array([9]))),
    ]).pipe(
      Effect.provideService(CurrentWorkObserver, {
        record: (fact) => {
          facts.push(fact);
        },
        detailSelected: () => false,
      }),
    );

    const verified = Option.getOrThrow(matching);
    expect(verified.bytes).toBe(bytes);
    expect(verified.integrity).toBe(integrity);
    expect(Option.isNone(mismatching)).toBe(true);
    expect(facts.map((fact) => [fact.kind, fact.attributes["axm.archive.bytes"]])).toEqual([
      ["axm.archive.integrity", 3],
      ["axm.archive.integrity", 3],
    ]);
  }),
);

it.effect("covers only the checked buffer instance and integrity", () =>
  Effect.gen(function* () {
    const bytes = new Uint8Array([1, 2, 3]);
    const integrity = yield* computeIntegrity(bytes);
    const verified = Option.getOrThrow(yield* VerifiedArchive.check(bytes, integrity));

    expect(verified.covers(bytes, integrity)).toBe(true);
    expect(verified.covers(bytes.slice(), integrity)).toBe(false);
    expect(verified.covers(bytes, yield* computeIntegrity(new Uint8Array([9])))).toBe(false);
  }),
);

it("cannot be imitated by a structurally identical object", () => {
  const bytes = new Uint8Array([1]);
  // @ts-expect-error Evidence is nominal; only VerifiedArchive.check can create it.
  const forged: VerifiedArchive = { bytes, integrity: "sha512-x", covers: () => true };
  expect(forged instanceof VerifiedArchive).toBe(false);
});
