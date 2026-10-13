import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  inspectManagedRegion,
  renderManagedRegion,
  verifyRenderedRegion,
  type WritableManagedRegionState,
} from "./managed-regions.js";
import { reconcilePatternList } from "./managed-regions-pattern-list.js";

const writable = (content: string): WritableManagedRegionState => {
  const state = inspectManagedRegion(content, "rules", "markdown");
  if (state.state === "malformed") throw new Error(state.message);
  return state;
};

const render = (content: string, body: string) =>
  Option.map(
    renderManagedRegion({
      content,
      state: writable(content),
      region: "rules",
      syntax: "markdown",
      body,
    }),
    ({ content: rendered }) => rendered,
  );

describe("renderManagedRegion", () => {
  it.each([
    ["an empty file", "", "<!-- axm:rules -->\nB\n<!-- /axm:rules -->\n"],
    ["a terminated file", "# A\n", "# A\n<!-- axm:rules -->\nB\n<!-- /axm:rules -->\n"],
    ["an unterminated file", "# A", "# A\n<!-- axm:rules -->\nB\n<!-- /axm:rules -->\n"],
    ["a CRLF file", "# A\r\n", "# A\r\n<!-- axm:rules -->\r\nB\r\n<!-- /axm:rules -->\r\n"],
  ])("appends a new region at the end of %s", (_label, content, expected) => {
    expect(render(content, "B")).toEqual(Option.some(expected));
  });

  it("writes nothing when withdrawing an absent region", () => {
    expect(render("# A\n", "")).toEqual(Option.none());
  });

  it("replaces only the body, canonicalizes fences and keeps each fence terminator", () => {
    const content = "# A\r\n<!--axm:rules-->\r\nold\r\n<!--  /axm:rules -->\nTail";
    expect(render(content, "new\nlines")).toEqual(
      Option.some("# A\r\n<!-- axm:rules -->\r\nnew\r\nlines\r\n<!-- /axm:rules -->\nTail"),
    );
  });

  it("terminates a close fence left at the end of the file", () => {
    expect(render("<!-- axm:rules -->\nold\n<!-- /axm:rules -->", "new")).toEqual(
      Option.some("<!-- axm:rules -->\nnew\n<!-- /axm:rules -->\n"),
    );
  });

  it("removes the whole fenced unit on withdrawal", () => {
    expect(render("# A\n<!-- axm:rules -->\nold\n<!-- /axm:rules -->\n# B\n", "")).toEqual(
      Option.some("# A\n# B\n"),
    );
  });
});

describe("verifyRenderedRegion", () => {
  const check = (before: string, body: string) => {
    const after = Option.getOrElse(render(before, body), () => before);
    return verifyRenderedRegion({
      before,
      after,
      region: "rules",
      syntax: "markdown",
      withdrawn: body.length === 0,
    });
  };

  it("accepts a body that keeps the fences intact", () => {
    expect(Result.isSuccess(check("# A\n", "```\ncode\n```"))).toBe(true);
  });

  it.each([
    ["an unclosed code block", "```\ncode"],
    ["a close fence", "text\n<!-- /axm:rules -->"],
    ["another region's fences", "<!-- axm:knowledge -->\nx\n<!-- /axm:knowledge -->"],
  ])("refuses a body containing %s", (_label, body) => {
    expect(Result.isFailure(check("# A\n", body))).toBe(true);
  });

  it("refuses a render that changes a sibling region", () => {
    const before = "<!-- axm:knowledge -->\nK\n<!-- /axm:knowledge -->\n";
    expect(Result.isSuccess(check(before, "R"))).toBe(true);
    const after = "<!-- axm:knowledge -->\nchanged\n<!-- /axm:knowledge -->\n";
    expect(
      Result.isFailure(
        verifyRenderedRegion({
          before,
          after: `${after}<!-- axm:rules -->\nR\n<!-- /axm:rules -->\n`,
          region: "rules",
          syntax: "markdown",
          withdrawn: false,
        }),
      ),
    ).toBe(true);
  });
});

describe("reconcilePatternList", () => {
  it("renders the alias region and returns the body as written", () => {
    expect(
      reconcilePatternList({ content: "node_modules\r\n", patterns: ["/CLAUDE.md", "/GEMINI.md"] }),
    ).toEqual(
      Option.some({
        state: { state: "absent", reasonCode: "managed-region-absent" },
        updated:
          "node_modules\r\n# axm:instruction-aliases\r\n/CLAUDE.md\r\n/GEMINI.md\r\n# /axm:instruction-aliases\r\n",
        writtenBody: "/CLAUDE.md\r\n/GEMINI.md\r\n",
      }),
    );
  });

  it("withdraws the region and leaves the rest of the file", () => {
    const content = "a\n# axm:instruction-aliases\n/CLAUDE.md\n# /axm:instruction-aliases\nb\n";
    expect(
      Option.map(reconcilePatternList({ content, patterns: [] }), ({ updated }) => updated),
    ).toEqual(Option.some("a\nb\n"));
  });

  it("refuses malformed fences", () => {
    expect(
      reconcilePatternList({ content: "# axm:instruction-aliases\n/CLAUDE.md\n", patterns: [] }),
    ).toEqual(Option.none());
  });
});
