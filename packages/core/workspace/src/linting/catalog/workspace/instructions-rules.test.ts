import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  baseInstructionStatus,
  claudeInstructionItem,
  currentGitignore,
  instructionContext,
} from "./conformance/instructions/test-helpers.js";
import { instructionsGitignoreCurrentRule } from "./instructions-gitignore-current.js";
import { instructionsTargetCurrentRule } from "./instructions-target-current.js";
import { instructionsTargetUnownedRule } from "./instructions-target-unowned.js";

it.effect("partitions unowned instruction collisions from managed drift", () =>
  Effect.gen(function* () {
    const context = yield* instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        items: [
          claudeInstructionItem({
            health: "drift",
            ownership: "unowned",
            observedForm: "file",
          }),
        ],
      }),
    });

    expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([]);
    expect(
      (yield* instructionsTargetUnownedRule.check(context)).map(({ ruleId }) => ruleId),
    ).toEqual(["workspace/instructions-target-unowned"]);
  }),
);

it.effect("distinguishes a missing instruction target from a drifted copy", () =>
  Effect.gen(function* () {
    const context = yield* instructionContext({
      status: Option.some({
        ...baseInstructionStatus,
        items: [
          claudeInstructionItem({
            health: "missing-target",
            ownership: "absent",
            observedForm: "none",
          }),
        ],
      }),
    });

    expect(yield* instructionsTargetCurrentRule.check(context)).toEqual([
      {
        kind: "advisory",
        ruleId: "workspace/instructions-target-current",
        severity: "warning",
        message: "The Claude Code instruction file is missing.",
        location: { file: "CLAUDE.md" },
      },
    ]);
  }),
);

it.effect("distinguishes tracked aliases from a disabled managed gitignore block", () =>
  Effect.gen(function* () {
    const trackedContext = yield* instructionContext({
      gitignore: { ...currentGitignore, trackedAliases: ["CLAUDE.md"] },
    });
    expect(yield* instructionsGitignoreCurrentRule.check(trackedContext)).toEqual([
      {
        kind: "advisory",
        ruleId: "workspace/instructions-gitignore-current",
        severity: "info",
        message:
          "Managed ignore entries cover paths already present in the Git index (CLAUDE.md); set gitignoreAliases: false to reconcile tracked instruction aliases.",
        location: { file: ".gitignore" },
      },
    ]);

    const disabledContext = yield* instructionContext({
      gitignore: { ...currentGitignore, desired: false, current: false },
    });
    expect(yield* instructionsGitignoreCurrentRule.check(disabledContext)).toEqual([
      {
        kind: "advisory",
        ruleId: "workspace/instructions-gitignore-current",
        severity: "info",
        message: "Instruction-file ignore entries are disabled but a managed block remains.",
        location: { file: ".gitignore" },
      },
    ]);
  }),
);
