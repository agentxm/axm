import { defineSpecification } from "@agentxm/specification-metadata";
import {
  StepFailure,
  publicRecoveryValue,
  protectedRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderCommandInvocation,
  type CommandInvocation,
} from "@agentxm/workspace-kernel/operations";
import { describe, expect, it } from "vitest";

import { AppError } from "../../app-error/index.js";
import { rootCommand } from "../../app.js";
import {
  commandForScope,
  failureForWorkspaceScope,
  scopedRoutesOf,
  suggestionsForScope,
} from "./scoped-command.js";

export const specification = defineSpecification({
  requirement: "cli/recovery-commands-preserve-classified-arguments",
  title: "Recovery commands preserve classified arguments when applying workspace scope",
  statement:
    "AXM shall apply workspace scope to classified recovery invocations without reinterpreting positional text, preserve an explicit scope, omit commands containing protected or unclassified values, and leave opaque external commands unchanged.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The production scope projection reads the registered CLI tree and renders classified invocation data without executing a subprocess.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const routes = scopedRoutesOf(rootCommand);
const invocation = (
  command: ReadonlyArray<string>,
  arguments_: CommandInvocation["arguments"] = [],
): CommandInvocation => ({ command, arguments: arguments_ });
const scoped = (command: CommandInvocation) =>
  renderCommandInvocation(commandForScope(command, "user", routes));

describe("scoped command suggestions", () => {
  it("reads the scope-taking routes from the command tree", () => {
    expect(routes.has("skills list")).toBe(true);
    expect(routes.has("sync")).toBe(true);
    expect(routes.has("upgrade")).toBe(false);
    expect(routes.has("agents")).toBe(false);
    expect(routes.has("")).toBe(false);
  });

  it("keeps project commands unchanged", () => {
    const command = invocation(["skills", "list"]);
    expect(commandForScope(command, "project", routes)).toBe(command);
  });

  it("adds user scope exactly once and preserves an explicit scope", () => {
    expect(scoped(invocation(["skills", "list"]))).toBe("axm skills list --scope user");
    expect(
      scoped(
        invocation(["skills", "list"], [recoveryOption("--scope", publicRecoveryValue("project"))]),
      ),
    ).toBe("axm skills list --scope project");
    const command = commandForScope(invocation(["skills", "list"]), "user", routes);
    expect(commandForScope(command, "user", routes)).toBe(command);
  });

  it("does not mistake positional text or option values for scope flags", () => {
    expect(
      scoped(
        invocation(
          ["skills", "enable"],
          [recoveryPositional(publicRecoveryValue("--scope project"))],
        ),
      ),
    ).toBe("axm skills enable --scope user -- '--scope project'");
    expect(
      scoped(
        invocation(
          ["update"],
          [
            recoveryPositional(publicRecoveryValue("skills/research")),
            recoverySwitch("--reinstall", true),
          ],
        ),
      ),
    ).toBe("axm update --reinstall --scope user skills/research");
  });

  it("leaves routes without workspace scope unchanged", () => {
    expect(scoped(invocation(["upgrade"]))).toBe("axm upgrade");
    expect(scoped(invocation(["login"]))).toBe("axm login");
    expect(
      scoped(invocation(["help"], [recoveryPositional(publicRecoveryValue("settings"))])),
    ).toBe("axm help settings");
  });

  it("projects structured suggestions and preserves opaque external commands", () => {
    expect(
      suggestionsForScope(
        [
          { description: "Inspect installed skills", invocation: invocation(["skills", "list"]) },
          { description: "External command", cmd: "axm skills list" },
          { description: "Review the error" },
        ],
        "user",
        routes,
      ),
    ).toEqual([
      { description: "Inspect installed skills", cmd: "axm skills list --scope user" },
      { description: "External command", cmd: "axm skills list" },
      { description: "Review the error" },
    ]);
  });

  it("scopes workspace suggestions, preserves global intent, and suppresses protected invocations", () => {
    expect(
      suggestionsForScope(
        [
          {
            description: "Preview",
            invocation: invocation(["sync"], [recoverySwitch("--preview", true)]),
            commandScope: "workspace",
          },
          { description: "Global", invocation: invocation(["sync"]), commandScope: "global" },
          {
            description: "Protected",
            invocation: invocation(["install"], [recoveryPositional(protectedRecoveryValue())]),
            cmd: "must not fall back",
          },
        ],
        "user",
        routes,
      ),
    ).toEqual([
      { description: "Preview", cmd: "axm sync --preview --scope user" },
      { description: "Global", cmd: "axm sync" },
      { description: "Protected" },
    ]);
  });

  it("keeps a workspace failure's diagnostic when its suggestions are scoped", () => {
    const diagnostic = { kind: "settings-invalid", operation: "workspace.configure" } as const;
    const failure = failureForWorkspaceScope(
      new StepFailure({
        category: "validation",
        detail: "The settings are invalid.",
        diagnostic,
        suggestions: [
          { description: "Inspect installed skills", invocation: invocation(["skills", "list"]) },
        ],
      }),
      "user",
      routes,
    );
    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      diagnostic,
      suggestions: [
        { description: "Inspect installed skills", cmd: "axm skills list --scope user" },
      ],
    });
  });
});
