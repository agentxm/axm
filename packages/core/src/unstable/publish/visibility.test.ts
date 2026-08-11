import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { PublishVisibilitySchema } from "./visibility.js";

const decodePublishVisibility = Schema.decodeUnknownSync(PublishVisibilitySchema);

describe("PublishVisibilitySchema", () => {
  it.each([
    { value: "public", disposition: "establish", source: "explicit" },
    { value: "private", disposition: "establish", source: "account" },
    { value: "public", disposition: "establish", source: "platform" },
    { value: "private", disposition: "preserve", source: "existing" },
  ])("decodes a complete visibility object", (visibility) => {
    expect(decodePublishVisibility(visibility)).toEqual(visibility);
  });

  it.each(["value", "disposition", "source"])("rejects an object missing %s", (field) => {
    const visibility: Record<string, string> = {
      value: "public",
      disposition: "establish",
      source: "platform",
    };
    delete visibility[field];

    expect(() => decodePublishVisibility(visibility)).toThrow();
  });

  it("rejects values outside the visibility vocabulary", () => {
    expect(() =>
      decodePublishVisibility({
        value: "unlisted",
        disposition: "establish",
        source: "platform",
      }),
    ).toThrow();
  });

  it.each([
    { value: "public", disposition: "establish", source: "existing" },
    { value: "private", disposition: "preserve", source: "account" },
  ])("rejects an inconsistent disposition and source", (visibility) => {
    expect(() => decodePublishVisibility(visibility)).toThrow();
  });
});
