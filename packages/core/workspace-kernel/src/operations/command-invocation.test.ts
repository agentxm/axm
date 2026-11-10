import { describe, expect, it } from "@effect/vitest";
import {
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderCommandInvocation,
} from "./command-invocation.js";

describe("safe invocation rendering", () => {
  it("preserves policy-neutral switches and quotes each argument", () => {
    expect(
      renderCommandInvocation(
        {
          command: ["sync"],
          arguments: [
            recoveryPositional(publicRecoveryValue("O'Reilly guidance")),
            recoverySwitch("--preview", true),
            recoverySwitch("--yes", true),
            recoveryOption("--scope", publicRecoveryValue("user")),
          ],
        },
        "posix",
      ),
    ).toBe("axm sync --preview --yes --scope user 'O'\"'\"'Reilly guidance'");
  });

  it("quotes PowerShell apostrophes without changing argument boundaries", () => {
    expect(
      renderCommandInvocation(
        {
          command: ["setup"],
          arguments: [recoveryOption("--instructions", publicRecoveryValue("team's rules.md"))],
        },
        "powershell",
      ),
    ).toBe("axm setup --instructions 'team''s rules.md'");
  });

  it("keeps leading-dash option values and positionals as values", () => {
    expect(
      renderCommandInvocation({
        command: ["install"],
        arguments: [
          recoveryOption("--skill", publicRecoveryValue("--review")),
          recoveryPositional(publicRecoveryValue("--source")),
        ],
      }),
    ).toBe("axm install --skill=--review -- --source");
  });

  it("withholds values the public command contract cannot safely carry", () => {
    for (const value of ["name;other", "name\nother", "$(echo value)", "<name>"]) {
      expect(
        renderCommandInvocation({
          command: ["install"],
          arguments: [recoveryPositional(publicRecoveryValue(value))],
        }),
      ).toBeUndefined();
    }
  });

  it("rejects command or flag injection and withholds unknown values", () => {
    expect(
      renderCommandInvocation({ command: ["sync; echo exposed"], arguments: [] }),
    ).toBeUndefined();
    expect(
      renderCommandInvocation({
        command: ["sync"],
        arguments: [recoverySwitch("--preview; echo exposed", true)],
      }),
    ).toBeUndefined();
    expect(
      renderCommandInvocation({
        command: ["install"],
        arguments: [recoveryPositional({ _tag: "Unclassified" })],
      }),
    ).toBeUndefined();
  });
});
