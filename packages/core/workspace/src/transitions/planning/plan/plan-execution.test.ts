import { describe, expect, it } from "@effect/vitest";

import {
  confirmationRecoverySuggestions,
  credentialFreeLocatorRecoveryValue,
  namedPolicyRecoverySuggestions,
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  unclassifiedRecoveryValue,
  type ConfirmationRecovery,
} from "./plan-execution.js";

const recovery = (arguments_: ConfirmationRecovery["arguments"]): ConfirmationRecovery => ({
  command: ["install"],
  arguments: arguments_,
});

describe("confirmation recovery", () => {
  it("renders a canonical semantic replay with preapproval appended", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([
          recoveryPositional(publicRecoveryValue("@acme/skills/code review")),
          recoveryOption("--scope", publicRecoveryValue("user")),
          recoveryOption("--filter", publicRecoveryValue("one")),
          recoveryOption("--filter", publicRecoveryValue("two")),
          recoverySwitch("--preview", true),
          recoverySwitch("--json", true),
          recoverySwitch("--yes", true),
        ]),
        { approval: "preapprovable" },
      ),
    ).toBe(
      "axm install --scope user --filter one --filter two --json --yes '@acme/skills/code review'",
    );
  });

  it("renders an interactive replay without prompt-prohibiting switches or preapproval", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([
          recoveryPositional(publicRecoveryValue("@acme/skills/review")),
          recoveryOption("--scope", publicRecoveryValue("user")),
          recoverySwitch("--json", true),
          recoverySwitch("--non-interactive", true),
          recoverySwitch("--quiet", true),
        ]),
        { approval: "interactive" },
      ),
    ).toBe("axm install --scope user --quiet @acme/skills/review");
  });

  it("renders a policy-override replay with neither preapproval nor mode changes", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([recoveryPositional(publicRecoveryValue("@acme/skills/review"))]),
        { approval: "none", additionalSwitches: ["--accept-warnings"] },
      ),
    ).toBe("axm install --accept-warnings @acme/skills/review");
    expect(
      namedPolicyRecoverySuggestions(recovery([recoverySwitch("--json", true)]), [
        "--accept-warnings",
      ]),
    ).toEqual([
      {
        description: "Retry with the required policy override",
        cmd: "axm install --json --accept-warnings",
      },
    ]);
  });

  it("protects option-like positionals from flag interpretation", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([recoveryPositional(publicRecoveryValue("--authored"))]),
        { approval: "preapprovable" },
      ),
    ).toBe("axm install --yes -- --authored");
  });

  it("suppresses the entire command for protected or unclassified values", () => {
    for (const value of [protectedRecoveryValue(), unclassifiedRecoveryValue()]) {
      const target = recovery([recoveryPositional(value), recoverySwitch("--json", true)]);
      expect(renderConfirmationRecoveryCommand(target, { approval: "preapprovable" })).toBe(
        undefined,
      );
      expect(confirmationRecoverySuggestions(target, "preapprovable")).toEqual([
        {
          description:
            "Rerun the original invocation with --yes; a retry command is unavailable because it contains protected or unclassified values.",
        },
      ]);
      const [interactive] = confirmationRecoverySuggestions(target, "interactive");
      expect(interactive?.cmd).toBeUndefined();
      expect(interactive?.description).toContain("Approve interactively");
    }
  });

  it("names interactive approval and the mode changes for an interactive-only recovery", () => {
    const suggestions = confirmationRecoverySuggestions(
      recovery([
        recoveryPositional(publicRecoveryValue("review")),
        recoverySwitch("--non-interactive", true),
      ]),
      "interactive",
    );
    expect(suggestions).toEqual([
      {
        description:
          "Approve interactively: rerun in a terminal without --json or --non-interactive and confirm the plan",
        cmd: "axm install review",
      },
    ]);
    expect(JSON.stringify(suggestions)).not.toContain("--yes");
  });

  it("fails closed for values that the suggested-action command schema rejects", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([recoveryPositional(publicRecoveryValue("skill(name)"))]),
        { approval: "preapprovable" },
      ),
    ).toBeUndefined();
  });

  it("classifies credential-bearing locators as protected without retaining their value", () => {
    expect(credentialFreeLocatorRecoveryValue("https://example.com/source")).toEqual({
      _tag: "Public",
      value: "https://example.com/source",
    });
    expect(credentialFreeLocatorRecoveryValue("https://secret@example.com/source")).toEqual({
      _tag: "Protected",
    });
    expect(
      credentialFreeLocatorRecoveryValue("https://example.com/source?access_token=secret"),
    ).toEqual({
      _tag: "Protected",
    });
  });
});
