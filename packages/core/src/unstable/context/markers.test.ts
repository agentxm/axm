import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import {
  commentStyleForTarget,
  parseRegionMarker,
  replaceManagedRegion,
  serializeRegionMarker,
  stripManagedRegion,
} from "./markers.js";

describe("file region markers", () => {
  it("uses markdown HTML comments", () => {
    const style = commentStyleForTarget("README.md");
    expect(Option.isSome(style)).toBe(true);
    if (Option.isNone(style)) return;

    const marker = serializeRegionMarker(
      { kind: "start", region: "toc", ext: "@acme/context/readme" },
      style.value,
    );

    expect(marker).toBe("<!-- axm:start region=toc ext=@acme/context/readme -->");
    const parsed = parseRegionMarker(marker, style.value);
    expect(Option.isSome(parsed)).toBe(true);
    if (Option.isSome(parsed)) {
      expect(parsed.value).toEqual({
        kind: "start",
        region: "toc",
        ext: "@acme/context/readme",
      });
    }
  });

  it("guards strict comment-less JSON targets", () => {
    expect(Option.isNone(commentStyleForTarget("package.json"))).toBe(true);
  });

  it("replaces existing managed regions", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const original = [
      "# Project",
      "<!-- axm:start region=toc ext=@acme/context/readme -->",
      "old",
      "<!-- axm:end region=toc ext=@acme/context/readme -->",
      "tail",
    ].join("\n");

    const replaced = replaceManagedRegion({
      content: original,
      marker: { region: "toc", ext: "@acme/context/readme" },
      rendered: "new",
      style: style.value,
    });

    expect(replaced).toContain("new");
    expect(replaced).not.toContain("old");
    expect(replaced).toContain("tail");
  });

  it("appends missing managed regions", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;

    const replaced = replaceManagedRegion({
      content: "# Project\n",
      marker: { region: "toc", generator: "file-index" },
      rendered: "- src/index.ts",
      style: style.value,
    });

    expect(replaced).toContain("<!-- axm:start region=toc generator=file-index -->");
    expect(replaced).toContain("- src/index.ts");
  });

  it("strips existing managed regions", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const original = [
      "# Project",
      "<!-- axm:start region=toc ext=@acme/context/readme -->",
      "generated",
      "<!-- axm:end region=toc ext=@acme/context/readme -->",
      "tail",
    ].join("\n");

    const stripped = stripManagedRegion(
      original,
      { region: "toc", ext: "@acme/context/readme" },
      style.value,
    );

    expect(stripped).toBe("# Project\ntail");
  });

  it("parses arbitrary key=value options on a start marker", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const parsed = parseRegionMarker(
      "<!-- axm:start region=docs-index generator=file-index include=docs/*.md format=table columns=fileName,title,description -->",
      style.value,
    );
    expect(Option.isSome(parsed)).toBe(true);
    if (Option.isSome(parsed)) {
      expect(parsed.value.region).toBe("docs-index");
      expect(parsed.value.generator).toBe("file-index");
      expect(parsed.value.options).toEqual({
        include: "docs/*.md",
        format: "table",
        columns: "fileName,title,description",
      });
    }
  });

  it("preserves the original start marker line when replacing a region", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const startLine =
      "<!-- axm:start region=docs generator=file-index format=table columns=path,description -->";
    const original = [
      "# Project",
      startLine,
      "old",
      "<!-- axm:end region=docs generator=file-index -->",
      "",
    ].join("\n");

    const replaced = replaceManagedRegion({
      content: original,
      marker: { region: "docs", generator: "file-index" },
      rendered: "new content",
      style: style.value,
      startLine,
    });

    expect(replaced).toContain(startLine);
    expect(replaced).toContain("new content");
    expect(replaced).not.toContain("old");
  });

  it("rejects duplicate matching region starts", () => {
    const style = commentStyleForTarget("README.md");
    if (Option.isNone(style)) return;
    const content = [
      "<!-- axm:start region=toc ext=@acme/context/readme -->",
      "<!-- axm:start region=toc ext=@acme/context/readme -->",
      "<!-- axm:end region=toc ext=@acme/context/readme -->",
    ].join("\n");

    expect(() =>
      replaceManagedRegion({
        content,
        marker: { region: "toc", ext: "@acme/context/readme" },
        rendered: "new",
        style: style.value,
      }),
    ).toThrow(/duplicate AXM region start/i);
  });
});
