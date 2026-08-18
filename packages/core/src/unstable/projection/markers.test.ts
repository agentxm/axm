import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as FastCheck from "effect/testing/FastCheck";

import {
  parseRegionMarker,
  serializeRegionMarker,
  type FileCommentStyle,
  type FileRegionMarker,
} from "./markers.js";

describe("projection managed-region markers", () => {
  it.prop(
    "round-trips region identities and options containing whitespace",
    {
      region: FastCheck.string({ minLength: 1, maxLength: 80 }),
      owner: FastCheck.string({ minLength: 1, maxLength: 80 }),
      option: FastCheck.string({ minLength: 1, maxLength: 80 }),
      kind: FastCheck.constantFrom("start", "end"),
      prefix: FastCheck.constantFrom("#", "//"),
    },
    ({ region, owner, option, kind, prefix }) => {
      const style: FileCommentStyle = { kind: "line", prefix };
      const marker: FileRegionMarker = {
        kind,
        region,
        ext: owner,
        options: { target: option },
      };
      expect(
        Option.getOrThrow(parseRegionMarker(serializeRegionMarker(marker, style), style)),
      ).toEqual(marker);
    },
    { fastCheck: { numRuns: 250, seed: 0x41584d } },
  );

  it("round-trips whitespace in a named region", () => {
    const style: FileCommentStyle = { kind: "block", open: "<!--", close: "-->" };
    const marker: FileRegionMarker = { kind: "start", region: "generated hook fallbacks" };
    expect(
      Option.getOrThrow(parseRegionMarker(serializeRegionMarker(marker, style), style)),
    ).toEqual(marker);
  });
});
