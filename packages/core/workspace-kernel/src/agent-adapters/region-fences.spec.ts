import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  fenceSyntaxForTarget,
  REGION_NAMES,
  scanFences,
  scanUnknownFences,
  serializeFence,
  type FenceSyntax,
} from "./region-fences.js";
import { inspectManagedRegion, renderManagedRegion } from "./managed-regions.js";

export const specification = defineSpecification({
  requirement: "workspace/projections/fences-are-name-only-and-top-level",
  title: "Region fences carry only a name and count only at the top level",
  statement:
    "AXM shall delimit a region it writes inside a human-authored file with a fence pair that carries only the region name in the file's native comment syntax, from the closed vocabulary rules, knowledge and instruction-aliases. In Markdown a fence shall count only as a whole line starting at column 0 that is exactly an HTML comment, outside any fenced code block; in hash-comment files only as a whole line starting with '#'. Whitespace inside the comment delimiters shall be tolerated, any other text shall make the line plain text, a fence name outside the vocabulary shall be left untouched, and duplicate, nested, interleaved or unpaired vocabulary fences shall be reported as malformed with the region and the problem.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "Fence recognition is a pure function of file bytes, so the rule is observable without a filesystem.",
  methods: ["example", "decision-table", "property"],
  derivedFrom: ["workspace/projections/native-regions-follow-planned-target"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const names = (content: string, syntax: FenceSyntax) =>
  scanFences(content, syntax).map(({ edge, name, line }) => `${line}:${edge}:${name}`);

describe("Region fence grammar", () => {
  it("has a closed runtime vocabulary written canonically in native comment syntax", () => {
    expect(REGION_NAMES).toEqual(["rules", "knowledge", "instruction-aliases"]);
    expect(serializeFence("rules", "open", "markdown")).toBe("<!-- axm:rules -->");
    expect(serializeFence("rules", "close", "markdown")).toBe("<!-- /axm:rules -->");
    expect(serializeFence("instruction-aliases", "open", "hash")).toBe("# axm:instruction-aliases");
    expect(serializeFence("instruction-aliases", "close", "hash")).toBe(
      "# /axm:instruction-aliases",
    );
  });

  it.each([
    ["AGENTS.md", Option.some("markdown")],
    ["docs/CLAUDE.MD", Option.some("markdown")],
    ["guide.mdx", Option.some("markdown")],
    [".gitignore", Option.some("hash")],
    ["nested/.gitignore", Option.some("hash")],
    ["settings.toml", Option.none()],
    ["notes.txt", Option.none()],
  ])("resolves the fence syntax of %s", (target, expected) => {
    expect(fenceSyntaxForTarget(target)).toEqual(expected);
  });

  it.each([
    [
      "canonical fences",
      "<!-- axm:rules -->\nbody\n<!-- /axm:rules -->\n",
      ["0:open:rules", "2:close:rules"],
    ],
    [
      "no inner whitespace",
      "<!--axm:rules-->\n<!--/axm:rules-->\n",
      ["0:open:rules", "1:close:rules"],
    ],
    [
      "extra inner whitespace",
      "<!--   axm:rules  -->\n<!--\t/axm:rules -->\n",
      ["0:open:rules", "1:close:rules"],
    ],
    [
      "an unknown name, reported for the caller to ignore",
      "<!-- axm:future -->\n",
      ["0:open:future"],
    ],
    ["leading whitespace", " <!-- axm:rules -->\n", []],
    ["trailing text", "<!-- axm:rules --> note\n", []],
    ["inner text beyond the name", "<!-- axm:rules extra -->\n", []],
    ["an attribute-bearing comment", "<!-- axm:start v=1 region=rules -->\n", []],
    ["a colon-qualified name", "<!-- axm:generated:commands -->\n", []],
    ["an uppercase name", "<!-- axm:Rules -->\n", []],
    ["inline HTML in a paragraph", "Text <!-- axm:rules --> more\n", []],
    ["a list item", "- <!-- axm:rules -->\n", []],
    ["a blockquote", "> <!-- axm:rules -->\n", []],
    ["indented code", "    <!-- axm:rules -->\n", []],
    ["a tab-indented line", "\t<!-- axm:rules -->\n", []],
  ])("Markdown: %s", (_label, content, expected) => {
    expect(names(content, "markdown")).toEqual(expected);
  });

  it.each([
    [
      "a backtick code block",
      "```\n<!-- axm:rules -->\n```\n<!-- axm:knowledge -->\n",
      ["3:open:knowledge"],
    ],
    ["a tilde code block", "~~~md\n<!-- axm:rules -->\n~~~\n", []],
    ["an indented opener", "   ```\n<!-- axm:rules -->\n   ```\n", []],
    [
      "a longer opener closed only by a long enough run",
      "````\n```\n<!-- axm:rules -->\n````\n<!-- axm:rules -->\n",
      ["4:open:rules"],
    ],
    ["a closer of the other character", "```\n~~~\n<!-- axm:rules -->\n", []],
    [
      "a closer with trailing spaces",
      "```\n<!-- axm:rules -->\n```   \n<!-- /axm:rules -->\n",
      ["3:close:rules"],
    ],
    ["a closer with an info string, which does not close", "```\n```js\n<!-- axm:rules -->\n", []],
    ["an unclosed block, which runs to EOF", "```\ncode\n\n<!-- axm:rules -->\n", []],
    [
      "a backtick info string with a backtick, which is not an opener",
      "``` a`b\n<!-- axm:rules -->\n",
      ["1:open:rules"],
    ],
    [
      "a four-space opener, which is indented code",
      "    ```\n<!-- axm:rules -->\n",
      ["1:open:rules"],
    ],
  ])("Markdown fenced code: %s", (_label, content, expected) => {
    expect(names(content, "markdown")).toEqual(expected);
  });

  it.each([
    [
      "canonical fences",
      "# axm:instruction-aliases\n/CLAUDE.md\n# /axm:instruction-aliases\n",
      ["0:open:instruction-aliases", "2:close:instruction-aliases"],
    ],
    [
      "no space and trailing spaces",
      "#axm:instruction-aliases  \n#  /axm:instruction-aliases\n",
      ["0:open:instruction-aliases", "1:close:instruction-aliases"],
    ],
    ["leading whitespace, a pattern not a comment", " # axm:instruction-aliases\n", []],
    ["an attribute-bearing comment", "# axm:start v=1 region=instruction-aliases\n", []],
    [
      "backticks, which are not code in a hash file",
      "```\n# axm:instruction-aliases\n",
      ["1:open:instruction-aliases"],
    ],
  ])("hash: %s", (_label, content, expected) => {
    expect(names(content, "hash")).toEqual(expected);
  });

  it("reports exact line offsets, including CRLF terminators and a final unterminated line", () => {
    const content = "intro\r\n<!-- axm:rules -->\r\nbody\r\n<!-- /axm:rules -->";
    expect(scanFences(content, "markdown")).toEqual([
      { name: "rules", edge: "open", line: 1, start: 7, end: 27 },
      { name: "rules", edge: "close", line: 3, start: 33, end: content.length },
    ]);
  });

  it("ignores unknown names while pairing vocabulary fences", () => {
    const content =
      "<!-- axm:future -->\n<!-- axm:rules -->\nbody\n<!-- /axm:rules -->\n<!-- /axm:other -->\n";
    expect(inspectManagedRegion(content, "rules", "markdown")).toMatchObject({
      state: "complete",
      body: "body\n",
    });
  });

  it("lists only fences outside the vocabulary as unknown, in either syntax", () => {
    const markdown =
      "<!-- axm:future -->\n<!-- axm:rules -->\nbody\n<!-- /axm:rules -->\n```\n<!-- axm:hidden -->\n```\n<!-- /axm:future -->\n";
    expect(
      scanUnknownFences(markdown, "markdown").map(
        ({ edge, name, line }) => `${line}:${edge}:${name}`,
      ),
    ).toEqual(["0:open:future", "7:close:future"]);
    expect(
      scanUnknownFences("# axm:instruction-aliases\n# axm:extra\n", "hash").map(
        ({ name, line }) => `${line}:${name}`,
      ),
    ).toEqual(["1:extra"]);
  });

  it.each([
    ["unpaired", "rules", "<!-- axm:rules -->\nbody\n"],
    ["unpaired", "rules", "body\n<!-- /axm:rules -->\n"],
    [
      "duplicate",
      "rules",
      "<!-- axm:rules -->\n<!-- /axm:rules -->\n<!-- axm:rules -->\n<!-- /axm:rules -->\n",
    ],
    [
      "nested",
      "rules",
      "<!-- axm:rules -->\n<!-- axm:rules -->\n<!-- /axm:rules -->\n<!-- /axm:rules -->\n",
    ],
    [
      "interleaved",
      "rules",
      "<!-- axm:rules -->\n<!-- axm:knowledge -->\n<!-- /axm:rules -->\n<!-- /axm:knowledge -->\n",
    ],
    ["interleaved", "knowledge", "<!-- axm:knowledge -->\n<!-- /axm:rules -->\n"],
  ] as const)("reports %s fences of region %s", (problem, region, content) => {
    // Any malformed vocabulary fence blocks every region in the file.
    for (const asked of ["rules", "knowledge"] as const)
      expect(inspectManagedRegion(content, asked, "markdown")).toMatchObject({
        state: "malformed",
        reasonCode: "managed-region-malformed",
        region,
        problem,
      });
  });

  const plainLine = FastCheck.stringMatching(/^[A-Za-z0-9 #*_.|-]{0,40}$/);
  const indentedFence = FastCheck.tuple(
    FastCheck.constantFrom(" ", "  ", "   ", "    ", "\t", "> ", "- ", "1. "),
    FastCheck.constantFrom(...REGION_NAMES),
    FastCheck.constantFrom("", "/"),
  ).map(([prefix, name, slash]) => `${prefix}<!-- ${slash}axm:${name} -->`);

  fastCheckIt.prop(
    { lines: FastCheck.array(FastCheck.oneof(plainLine, indentedFence), { maxLength: 20 }) },
    { numRuns: 200 },
  )("never treats an indented, listed or quoted comment as a Markdown fence", ({ lines }) => {
    expect(scanFences(lines.join("\n"), "markdown")).toEqual([]);
  });

  const bodyLine = FastCheck.stringMatching(/^[A-Za-z0-9#*_.|-][A-Za-z0-9 #*_.|-]{0,39}$/);

  fastCheckIt.prop(
    {
      prefix: FastCheck.array(plainLine, { maxLength: 6 }),
      body: FastCheck.array(bodyLine, { minLength: 1, maxLength: 6 }),
      crlf: FastCheck.boolean(),
    },
    { numRuns: 200 },
  )(
    "reads back exactly the body it wrote, in the file's line endings",
    ({ prefix, body, crlf }) => {
      const content = prefix.map((line) => `${line}${crlf ? "\r\n" : "\n"}`).join("");
      // A new region follows the file's line endings; an empty file is LF.
      const eol = content.includes("\r\n") ? "\r\n" : "\n";
      const state = inspectManagedRegion(content, "rules", "markdown");
      expect(state.state).toBe("absent");
      if (state.state !== "absent") return;
      const rendered = Option.getOrThrow(
        renderManagedRegion({
          content,
          state,
          region: "rules",
          syntax: "markdown",
          body: body.join("\n"),
        }),
      );
      expect(rendered.content.startsWith(content)).toBe(true);
      const written = inspectManagedRegion(rendered.content, "rules", "markdown");
      expect(written).toMatchObject({
        state: "complete",
        body: body.map((line) => `${line}${eol}`).join(""),
      });
      if (written.state !== "complete") return;
      const withdrawn = Option.getOrThrow(
        renderManagedRegion({
          content: rendered.content,
          state: written,
          region: "rules",
          syntax: "markdown",
          body: "",
        }),
      );
      expect(withdrawn.content).toBe(content);
    },
  );
});
