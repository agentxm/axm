import { describe, expect, it } from "@effect/vitest";

import {
  confirmationRecoverySuggestions,
  credentialFreeLocatorRecoveryValue,
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  unclassifiedRecoveryValue,
  type ConfirmationRecovery,
} from "./confirmation-recovery.js";

const recovery = (arguments_: ConfirmationRecovery["arguments"]): ConfirmationRecovery => ({
  command: ["install"],
  arguments: arguments_,
});

describe("confirmation recovery", () => {
  it("renders a canonical semantic replay", () => {
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
      ),
    ).toBe(
      "axm install --scope user --filter one --filter two --json --yes '@acme/skills/code review'",
    );
  });

  it("protects option-like positionals from flag interpretation", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([recoveryPositional(publicRecoveryValue("--authored"))]),
      ),
    ).toBe("axm install --yes -- --authored");
  });

  it("suppresses the entire command for protected or unclassified values", () => {
    for (const value of [protectedRecoveryValue(), unclassifiedRecoveryValue()]) {
      const target = recovery([recoveryPositional(value), recoverySwitch("--json", true)]);
      expect(renderConfirmationRecoveryCommand(target)).toBeUndefined();
      expect(confirmationRecoverySuggestions(target)).toEqual([
        {
          description:
            "Rerun the original invocation with --yes; a retry command is unavailable because it contains protected or unclassified values.",
        },
      ]);
    }
  });

  it("fails closed for values that the suggested-action command schema rejects", () => {
    expect(
      renderConfirmationRecoveryCommand(
        recovery([recoveryPositional(publicRecoveryValue("skill(name)"))]),
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
