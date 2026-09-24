import { describe, expect, it } from "vitest";

import { rootCommand } from "../../app.js";
import { commandForScope, scopedRoutesOf, suggestionsForScope } from "./scoped-command.js";

const routes = scopedRoutesOf(rootCommand);

describe("scoped command suggestions", () => {
  it("reads the scope-taking routes from the command tree", () => {
    expect(routes.has("skills list")).toBe(true);
    expect(routes.has("sync")).toBe(true);
    expect(routes.has("upgrade")).toBe(false);
    expect(routes.has("agents")).toBe(false);
    expect(routes.has("")).toBe(false);
  });

  it("keeps project commands unchanged", () => {
    expect(commandForScope("axm skills list", "project", routes)).toBe("axm skills list");
  });

  it("adds user scope exactly once", () => {
    expect(commandForScope("axm skills list", "user", routes)).toBe("axm skills list --scope user");
    expect(commandForScope("axm skills list --scope user", "user", routes)).toBe(
      "axm skills list --scope user",
    );
    expect(commandForScope("axm skills list --scope=user", "user", routes)).toBe(
      "axm skills list --scope=user",
    );
    expect(commandForScope("axm skills list --scopeful", "user", routes)).toBe(
      "axm skills list --scopeful --scope user",
    );
  });

  it("addresses a route by its leading words, past its arguments", () => {
    expect(commandForScope("axm update skills/research --refresh", "user", routes)).toBe(
      "axm update skills/research --refresh --scope user",
    );
    expect(commandForScope("axm skills enable code-review", "user", routes)).toBe(
      "axm skills enable code-review --scope user",
    );
  });

  it("leaves a command alone whose route takes no scope flag", () => {
    expect(commandForScope("axm upgrade", "user", routes)).toBe("axm upgrade");
    expect(commandForScope("axm login", "user", routes)).toBe("axm login");
    expect(commandForScope("axm agents --help", "user", routes)).toBe("axm agents --help");
    expect(commandForScope("axm help settings", "user", routes)).toBe("axm help settings");
    expect(commandForScope("npm install", "user", routes)).toBe("npm install");
  });

  it("preserves descriptions and actions without commands", () => {
    expect(
      suggestionsForScope(
        [
          { description: "Inspect installed skills", cmd: "axm skills list" },
          { description: "Review the error" },
        ],
        "user",
        routes,
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
        routes,
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
