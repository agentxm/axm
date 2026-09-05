import { describe, expect, it } from "vitest";

import { commandForScope, suggestionsForScope } from "./scoped-command.js";

describe("scoped command suggestions", () => {
  it("keeps project commands unchanged", () => {
    expect(commandForScope("axm skills list", "project")).toBe("axm skills list");
  });

  it("adds user scope exactly once", () => {
    expect(commandForScope("axm skills list", "user")).toBe("axm skills list --scope user");
    expect(commandForScope("axm skills list --scope user", "user")).toBe(
      "axm skills list --scope user",
    );
    expect(commandForScope("axm skills list --scope=user", "user")).toBe(
      "axm skills list --scope=user",
    );
    expect(commandForScope("axm skills list --scopeful", "user")).toBe(
      "axm skills list --scopeful --scope user",
    );
  });

  it("preserves descriptions and actions without commands", () => {
    expect(
      suggestionsForScope(
        [
          { description: "Inspect installed skills", cmd: "axm skills list" },
          { description: "Review the error" },
        ],
        "user",
      ),
    ).toEqual([
      { description: "Inspect installed skills", cmd: "axm skills list --scope user" },
      { description: "Review the error" },
    ]);
  });

  it("scopes workspace commands but leaves global recovery commands unchanged", () => {
    expect(
      suggestionsForScope(
        [
          {
            description: "Preview workspace resolution",
            cmd: "axm sync --preview",
            commandScope: "workspace",
          },
          {
            description: "Upgrade AXM",
            cmd: "axm upgrade",
            commandScope: "global",
          },
        ],
        "user",
      ),
    ).toEqual([
      {
        description: "Preview workspace resolution",
        cmd: "axm sync --preview --scope user",
      },
      {
        description: "Upgrade AXM",
        cmd: "axm upgrade",
      },
    ]);
  });
});
