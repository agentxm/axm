import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { BreadcrumbSchema } from "./breadcrumb.js";

describe("BreadcrumbSchema", () => {
  it("requires cmd when description mentions an axm command", () => {
    const decode = Schema.decodeUnknownSync(BreadcrumbSchema);

    expect(() => decode({ description: "Run `axm skills list`" })).toThrow();
    expect(decode({ description: "Run `axm skills list`", cmd: "axm skills list" })).toEqual({
      description: "Run `axm skills list`",
      cmd: "axm skills list",
    });
  });
});
