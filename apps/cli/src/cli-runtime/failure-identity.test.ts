import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { CliError } from "effect/unstable/cli";
import { StepFailure } from "@agentxm/workspace-kernel/operations";

import { makeAppError } from "../app-error/index.js";
import { OutputWriteFailed } from "../screen/streams.js";
import {
  defectIdentity,
  handledFailureIdentity,
  processTerminalFailure,
} from "./failure-identity.js";

const SENTINEL = "SYNTHETIC_PRIVATE_TEXT_93";

class TaggedDefect extends Error {
  readonly _tag = "LockTableCorrupted";
}

class NarrowTypeError extends TypeError {}

describe("handled failure identity", () => {
  it("names an application error by its problem when it carries one", () => {
    const error = makeAppError({
      code: "validation",
      detail: SENTINEL,
      problem: {
        code: "workspace-lockfile-version-unsupported",
        path: `/home/${SENTINEL}/axm-lock.yaml`,
        observedVersion: 3,
        supportedVersion: 2,
        direction: "newer",
      },
    });
    expect(handledFailureIdentity(error)).toEqual({
      kind: "workspace-lockfile-version-unsupported",
      code: "validation",
      handled: true,
    });
  });

  it("names an application error by its code otherwise", () => {
    expect(handledFailureIdentity(makeAppError({ code: "not_found", detail: SENTINEL }))).toEqual({
      kind: "not_found",
      code: "not_found",
      handled: true,
    });
  });

  it("names a workspace failure by its tag", () => {
    const failure = new StepFailure({ category: "network", detail: SENTINEL });
    expect(handledFailureIdentity(failure)).toEqual({
      kind: "step-failure",
      code: "network",
      handled: true,
    });
  });

  it("names a parse failure by its tag and output failure by its own kind", () => {
    const parse = new CliError.UnrecognizedOption({ option: `--${SENTINEL}`, suggestions: [] });
    expect(handledFailureIdentity(parse)).toEqual({
      kind: "unrecognized-option",
      code: "usage",
      handled: true,
    });
    expect(
      handledFailureIdentity(new OutputWriteFailed({ channel: "stdout", reason: "EPIPE" })),
    ).toEqual({ kind: "output-write-failed", code: "internal", handled: true });
  });

  it("names anything else unknown", () => {
    expect(handledFailureIdentity(SENTINEL)).toEqual({
      kind: "unknown",
      code: "internal",
      handled: true,
    });
  });
});

describe("defect identity", () => {
  it.each([
    [new TypeError(SENTINEL), "defect.type-error"],
    [new RangeError(SENTINEL), "defect.range-error"],
    [new URIError(SENTINEL), "defect.uri-error"],
    [new AggregateError([], SENTINEL), "defect.aggregate-error"],
    [new NarrowTypeError(SENTINEL), "defect.type-error"],
    [new Error(SENTINEL), "defect.error"],
    [new TaggedDefect(SENTINEL), "defect.lock-table-corrupted"],
    [{ _tag: "Not a safe tag", message: SENTINEL }, "defect.unknown"],
    [{ _tag: "A".repeat(49) }, "defect.unknown"],
    [SENTINEL, "defect.unknown"],
  ])("derives %s as %s", (defect, kind) => {
    const identity = defectIdentity(defect);
    expect(identity).toEqual({ kind, code: "internal", handled: false });
    expect(JSON.stringify(identity)).not.toContain(SENTINEL);
  });

  it("keeps the category a died application error states", () => {
    expect(defectIdentity(makeAppError({ code: "conflict", detail: SENTINEL }))).toEqual({
      kind: "defect.app-error",
      code: "conflict",
      handled: false,
    });
  });
});

describe("process terminal failure", () => {
  it("places a workspace failure in the configuration phase", () => {
    const failure = processTerminalFailure(
      Cause.fail(new StepFailure({ category: "validation", detail: SENTINEL })),
    );
    expect(Option.getOrUndefined(failure)).toEqual({
      kind: "step-failure",
      code: "validation",
      handled: true,
      phase: "configuration",
    });
  });

  it("places a defect beside an output failure in the output phase", () => {
    const failure = processTerminalFailure(
      Cause.combine(
        Cause.fail(new OutputWriteFailed({ channel: "stdout", reason: "EPIPE" })),
        Cause.die(new TypeError(SENTINEL)),
      ),
    );
    expect(Option.getOrUndefined(failure)).toEqual({
      kind: "defect.type-error",
      code: "internal",
      handled: false,
      phase: "output",
    });
  });

  it("places a failure of a command that runs without the envelope in the command phase", () => {
    const notFound = processTerminalFailure(
      Cause.fail(makeAppError({ code: "not_found", detail: SENTINEL })),
      "command",
    );
    expect(Option.getOrUndefined(notFound)).toEqual({
      kind: "not_found",
      code: "not_found",
      handled: true,
      phase: "command",
    });
    // A workspace failure a command raises is the command's, not configuration.
    const raised = processTerminalFailure(
      Cause.fail(new StepFailure({ category: "validation", detail: SENTINEL })),
      "command",
    );
    expect(Option.getOrUndefined(raised)?.phase).toBe("command");
    const defect = processTerminalFailure(Cause.die(new TypeError(SENTINEL)), "command");
    expect(Option.getOrUndefined(defect)?.phase).toBe("command");
  });

  it("reports nothing for help that exits successfully", () => {
    const help = new CliError.ShowHelp({ commandPath: ["axm"], errors: [] });
    expect(Option.isNone(processTerminalFailure(Cause.fail(help)))).toBe(true);
  });

  it("names help shown for a parse failure by that failure", () => {
    const help = new CliError.ShowHelp({
      commandPath: ["axm"],
      errors: [new CliError.MissingOption({ option: "source" })],
    });
    expect(Option.getOrUndefined(processTerminalFailure(Cause.fail(help)))).toEqual({
      kind: "missing-option",
      code: "usage",
      handled: true,
      phase: "bootstrap",
    });
  });
});
