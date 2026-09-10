import { describe, expect, it } from "@effect/vitest";

import { formatMarkdown } from "./markdown-formatter.js";

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

describe("formatMarkdown", () => {
  it("returns raw markdown unchanged when colors are disabled", () => {
    const source = "# Title\n\n**Bold** and `code`\n";

    expect(formatMarkdown(source, 80, false)).toBe(source);
  });

  it("renders styled headings without markdown heading markers", () => {
    const output = formatMarkdown("# Title\n\n## Next\n\n### Detail\n", 80, true);

    expect(output).toContain("\u001b[1m\u001b[36m◇  Title\u001b[0m");
    expect(output).toContain("\u001b[1m\u001b[36m◆  Next\u001b[0m");
    expect(stripAnsi(output)).toContain("●  Detail");
    expect(stripAnsi(output)).not.toContain("# Title");
  });

  it("wraps paragraphs to the requested width", () => {
    const output = stripAnsi(
      formatMarkdown(
        "This paragraph should wrap across multiple lines when the available terminal width is narrow.\n",
        36,
        true,
      ),
    );

    expect(output).toContain("This paragraph should wrap across");
    expect(output).toContain("multiple lines when the available");
  });

  it("renders bullets, nested bullets, and code fences", () => {
    const rendered = formatMarkdown(
      ["- Install AXM", "  - Run `axm setup`", "", "```bash", "axm setup", "```", ""].join("\n"),
      80,
      true,
    );
    const output = stripAnsi(rendered);

    expect(output).toContain("• Install AXM\n");
    expect(output).toContain("  • Run axm setup\n");
    expect(rendered).toContain("\u001b[2maxm setup\u001b[0m");
    expect(output).toContain("  axm setup\n");
    expect(output).not.toContain("```");
  });

  it("renders inline code, bold text, links, and emphasis", () => {
    const output = formatMarkdown(
      "Use **AXM**, `axm setup`, _extensions_, and [settings](https://axm.sh/schemas/settings.schema.json).\n",
      120,
      true,
    );

    expect(output).toContain("\u001b[1mAXM\u001b[0m");
    expect(output).toContain("\u001b[2maxm setup\u001b[0m");
    expect(output).toContain("\u001b[2mextensions\u001b[0m");
    expect(output).toContain(
      "settings\u001b[2m (https://axm.sh/schemas/settings.schema.json)\u001b[0m",
    );
  });

  it("renders GFM tables through the shared table formatter", () => {
    const output = stripAnsi(
      formatMarkdown(
        "| Code | Meaning |\n| ---: | --- |\n| 0 | Success |\n| 1 | Problems |\n",
        80,
        true,
      ),
    );

    expect(output).toContain("Code  Meaning");
    expect(output).toContain("────  ───────");
    expect(output).toContain("   0  Success");
    expect(output).toContain("   1  Problems");
  });

  it("drops HTML comments but leaves other HTML intact", () => {
    const output = formatMarkdown("<!-- hidden -->\n\n<span>visible</span>\n", 80, true);

    expect(output).not.toContain("hidden");
    expect(output).toContain("<span>visible</span>");
  });
});
