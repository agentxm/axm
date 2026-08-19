import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FastCheck from "effect/testing/FastCheck";

import {
  commentStyleForTarget,
  parseMarker,
  serializeMarker,
  type FileCommentStyle,
  type ManagedMarker,
} from "./marker-grammar.js";
import {
  inspectManagedRegion,
  normalizeManagedBody,
  reconcileManagedRegionFile,
  renderManagedRegion,
} from "./managed-region-adapter.js";

const styles: ReadonlyArray<FileCommentStyle> = [
  { kind: "line", prefix: "#" },
  { kind: "line", prefix: "//" },
  { kind: "block", open: "<!--", close: "-->" },
  { kind: "block", open: "/*", close: "*/" },
];

const markerArbitrary = FastCheck.oneof(
  FastCheck.record({
    kind: FastCheck.constantFrom("axm:start", "axm:end"),
    region: FastCheck.constantFrom("rules", "knowledge", "hook-fallbacks", "instruction-aliases"),
    ext: FastCheck.string({ minLength: 1, maxLength: 80 }),
  }).map(({ kind, region, ext }) => ({ kind, v: 1, region, ext }) satisfies ManagedMarker),
  FastCheck.record({
    ext: FastCheck.string({ minLength: 1, maxLength: 80 }),
    src: FastCheck.string({ minLength: 1, maxLength: 80 }),
  }).map(({ ext, src }) => ({ kind: "axm:file", v: 1, ext, src }) satisfies ManagedMarker),
  FastCheck.record({
    ext: FastCheck.string({ minLength: 1, maxLength: 80 }),
    pointKind: FastCheck.string({ minLength: 1, maxLength: 40 }),
  }).map(
    ({ ext, pointKind }) => ({ kind: "axm:point", v: 1, ext, pointKind }) satisfies ManagedMarker,
  ),
);

describe("projection managed-region markers", () => {
  it.prop(
    "round-trips region identities and options containing whitespace",
    {
      owner: FastCheck.string({ minLength: 1, maxLength: 80 }),
      kind: FastCheck.constantFrom("axm:start", "axm:end"),
      prefix: FastCheck.constantFrom("#", "//"),
    },
    ({ owner, kind, prefix }) => {
      const style: FileCommentStyle = { kind: "line", prefix };
      const marker: ManagedMarker = {
        kind,
        v: 1,
        region: "rules",
        ext: owner,
      };
      const parsed = parseMarker(serializeMarker(marker, style), style);
      expect(parsed.state).toBe("complete");
      if (parsed.state === "complete") expect(parsed.marker).toEqual(marker);
    },
    { fastCheck: { numRuns: 250, seed: 0x41584d } },
  );

  it.prop(
    "round-trips every valid marker canonically across every comment style",
    {
      marker: markerArbitrary,
      style: FastCheck.constantFrom<FileCommentStyle>(
        { kind: "line", prefix: "#" },
        { kind: "line", prefix: "//" },
        { kind: "block", open: "<!--", close: "-->" },
        { kind: "block", open: "/*", close: "*/" },
      ),
    },
    ({ marker, style }) => {
      const first = serializeMarker(marker, style);
      const parsed = parseMarker(first, style);
      expect(parsed.state).toBe("complete");
      if (parsed.state === "complete") {
        expect(parsed.marker).toEqual(marker);
        expect(serializeMarker(parsed.marker, style)).toBe(first);
      }
    },
    { fastCheck: { numRuns: 250, seed: 0x41584d } },
  );

  it("round-trips whitespace in a named region", () => {
    const style: FileCommentStyle = { kind: "block", open: "<!--", close: "-->" };
    const marker: ManagedMarker = {
      kind: "axm:start",
      v: 1,
      region: "hook-fallbacks",
    };
    const parsed = parseMarker(serializeMarker(marker, style), style);
    expect(parsed.state).toBe("complete");
    if (parsed.state === "complete") expect(parsed.marker).toEqual(marker);
  });

  it("ignores unknown v1 attributes and reports unsupported versions distinctly", () => {
    const style: FileCommentStyle = { kind: "block", open: "<!--", close: "-->" };
    const extended = parseMarker("<!-- axm:start v=1 region=rules zzz=1 -->", style);
    expect(extended.state).toBe("complete");
    if (
      extended.state === "complete" &&
      (extended.marker.kind === "axm:start" || extended.marker.kind === "axm:end")
    ) {
      expect(extended.marker.region).toBe("rules");
    }

    const unsupported = parseMarker("<!-- axm:start v=2 region=rules -->", style);
    expect(unsupported).toMatchObject({
      state: "unsupported-version",
      reasonCode: "marker-unsupported-version",
    });
    if (unsupported.state === "unsupported-version") {
      expect(unsupported.message).toContain("upgrade AXM");
    }
  });

  it("matches region identity independently of provenance and replaces in place", () => {
    const style: FileCommentStyle = { kind: "block", open: "<!--", close: "-->" };
    const content = [
      "before",
      "<!-- axm:start v=1 region=rules ext=@acme/rules/old -->",
      "old",
      "<!-- axm:end v=1 region=rules -->",
      "after",
    ].join("\n");
    const state = inspectManagedRegion(content, "rules", style);
    const updated = renderManagedRegion({
      content,
      state,
      region: "rules",
      owner: "@acme/rules/new",
      rendered: "new",
      style,
    });
    expect(updated).toContain("ext=@acme/rules/new");
    expect(updated.match(/region=rules/gu)).toHaveLength(2);
    expect(updated).not.toContain("ext=@acme/rules/old");
  });

  it("normalizes prose wrapping, list continuations, and Markdown table padding", () => {
    const compact = [
      "A paragraph that a formatter may wrap.",
      "",
      "- A list item that a formatter may wrap.",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| alpha | beta |",
    ].join("\n");
    const formatted = [
      "A paragraph that a formatter",
      "may wrap.",
      "",
      "- A list item that a formatter",
      "  may wrap.",
      "",
      "| Name  | Value |",
      "| ---   | ---   |",
      "| alpha | beta  |",
    ].join("\n");
    expect(normalizeManagedBody(`\n${formatted}\n`)).toBe(normalizeManagedBody(compact));
  });

  it.each(styles)("reports all four region states with distinct reason codes for %j", (style) => {
    const start = serializeMarker({ kind: "axm:start", v: 1, region: "rules" }, style);
    const end = serializeMarker({ kind: "axm:end", v: 1, region: "rules" }, style);
    const unsupported = start.replace("v=1", "v=2");
    expect(inspectManagedRegion("user", "rules", style).reasonCode).toBe("managed-region-absent");
    expect(inspectManagedRegion(`${start}\nbody\n${end}`, "rules", style).reasonCode).toBe(
      "managed-region-complete",
    );
    expect(inspectManagedRegion(`${start}\nbody`, "rules", style).reasonCode).toBe(
      "managed-region-malformed",
    );
    expect(inspectManagedRegion(`${unsupported}\nbody\n${end}`, "rules", style).reasonCode).toBe(
      "managed-region-unsupported-version",
    );
  });

  it.each([
    [".gitignore", "#"],
    [".dockerignore", "#"],
    [".npmignore", "#"],
    [".prettierignore", "#"],
    [".nxignore", "#"],
    ["Dockerfile", "#"],
    ["Makefile", "#"],
  ])("uses hash comments for %s", (target, prefix) => {
    expect(commentStyleForTarget(target)).toEqual(Option.some({ kind: "line", prefix }));
  });

  it.each([".prettierrc", ".babelrc", ".eslintrc", "file.json", "file.jsonc", "x.png", "x.qqq"])(
    "fails closed for %s",
    (target) => expect(Option.isNone(commentStyleForTarget(target))).toBe(true),
  );

  it("uses block comments for CSS", () => {
    expect(commentStyleForTarget("styles.css")).toEqual(
      Option.some({ kind: "block", open: "/*", close: "*/" }),
    );
  });

  it.effect("refuses an uncommentable target without writing it", () =>
    Effect.gen(function* () {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-marker-target-"));
      const target = path.join(root, ".prettierrc");
      try {
        fs.writeFileSync(target, '{"proseWrap":"always"}\n');
        const before = fs.readFileSync(target, "utf8");
        const error = yield* reconcileManagedRegionFile({
          targetPath: target,
          displayPath: ".prettierrc",
          region: "rules",
          owner: "@acme/rules/instructions",
          rendered: "body",
        }).pipe(Effect.flip, Effect.provide(NodeServices.layer));
        expect(error.code).toBe("validation");
        expect(fs.readFileSync(target, "utf8")).toBe(before);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});
