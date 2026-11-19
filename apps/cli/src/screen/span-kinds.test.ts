import { describe, expect, it } from "vitest";

import type { Text } from "./doc.js";
import { paintText } from "./paint-text.js";
import { invocation, pathSpan, urlSpan } from "./presenter-helpers.js";

const ESC = String.fromCharCode(27);

const paint = (text: Text, colors: boolean, width = 80) =>
  paintText([{ _tag: "paragraph", text }], { width, colors }).join("\n");

describe("span kinds", () => {
  it("links a URL with its text still visible, and only where colour is on", () => {
    const url = "https://agentxm.ai/@acme/packs/review-kit";
    expect(paint([urlSpan(url)], true)).toBe(`${ESC}]8;;${url}${ESC}\\${url}${ESC}]8;;${ESC}\\`);
    expect(paint([urlSpan(url)], false)).toBe(url);
  });

  it("tints a command and never breaks it", () => {
    expect(paint(invocation("axm lint"), true)).toBe(`${ESC}[36maxm lint${ESC}[0m`);
    const long = "axm update @acme-enterprise/skills/incident-review --reinstall";
    expect(paint([{ text: "Run " }, ...invocation(long)], false, 30).split("\n")).toContain(long);
  });

  it("starts a path under home at ~ and leaves other paths whole", () => {
    expect(pathSpan("/home/dev/work/app", "/home/dev").text).toBe("~/work/app");
    expect(pathSpan("/home/dev", "/home/dev").text).toBe("~");
    expect(pathSpan("/home/devops/app", "/home/dev").text).toBe("/home/devops/app");
    expect(pathSpan("/srv/app").text).toBe("/srv/app");
  });

  it("keeps an identifier whole at a narrow width", () => {
    const id = "req_01J8ZQ4M7TQX5Y6Z7A8B9C0D1E";
    expect(
      paint([{ text: "request " }, { text: id, kind: "identifier" }], false, 20).split("\n"),
    ).toContain(id);
  });
});
