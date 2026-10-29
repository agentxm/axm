import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";
import { CliError, type CliOutput } from "effect/cli";

import { presentBuiltInOutput } from "./built-in-output.js";

import { stripTerminalFormatting } from "./screen/index.js";
import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
} from "./test-support/screen-harness.js";

const ESCAPE = "\u001b";

const helpDocument = {
  _tag: "Help",
  reason: "Requested",
  commandPath: ["axm", "install"],
  helpDoc: {
    description: "Install extensions",
    usage: "axm install [flags]",
    flags: [
      {
        name: "all",
        aliases: [],
        type: "boolean",
        required: false,
        description: Option.some("Install every matching extension"),
      },
    ],
    annotations: ServiceMap.empty(),
  },
} satisfies CliOutput.Presenter.Event;
const versionDocument = {
  _tag: "Version",
  name: "axm",
  version: "1.2.3",
} satisfies CliOutput.Presenter.Event;

const usageError = new CliError.ShowHelp({
  commandPath: ["axm", "install"],
  errors: [new CliError.UnrecognizedOption({ option: "--bogus", suggestions: [] })],
});

describe("built-in output", () => {
  it.effect("paints the help document through the Screen as the result", () => {
    const streams = makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY: true, columns: 80 });
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(helpDocument, { helpRequest: undefined, format: "text" });

      const stdout = streams.lines("stdout").join("\n");
      expect(stdout).toContain(`${ESCAPE}[1mUSAGE${ESCAPE}[0m`);
      expect(stripTerminalFormatting(stdout)).toMatch(/--all\s+Install every matching extension/u);
      expect(stdout).not.toContain('"type": "help"');
      expect(streams.lines("stderr")).toEqual([]);
    }).pipe(Effect.provide(humanScreenLayer(streams)));
  });

  it.effect("narrates help on stderr and leaves the error to the process failure boundary", () => {
    const streams = makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY: false });
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(helpDocument, { helpRequest: usageError, format: "text" });

      expect(streams.lines("stdout")).toEqual([]);
      const stderr = streams.lines("stderr").join("\n");
      expect(stderr).toContain("USAGE");
      expect(stderr).not.toContain("Usage Error");
      expect(stderr).not.toContain("Unrecognized flag: --bogus");
      expect(stderr).not.toContain(ESCAPE);
    }).pipe(Effect.provide(humanScreenLayer(streams)));
  });

  it.effect("writes the bare version on a human stdout", () => {
    const streams = makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY: true });
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(versionDocument, { helpRequest: undefined, format: "text" });
      expect(streams.lines("stdout")).toEqual(["1.2.3"]);
    }).pipe(Effect.provide(humanScreenLayer(streams)));
  });

  it.effect.each([
    { label: "help", document: helpDocument },
    { label: "version", document: versionDocument },
  ])("writes the $label event as the machine result", ({ document }) => {
    const streams = makeRecordingStreams();
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(document, { helpRequest: undefined, format: "json" });
      expect(streams.log).toHaveLength(1);
      expect(JSON.parse(streams.log.map((entry) => entry.content).join(""))).toMatchObject({
        type: document._tag === "Help" ? "help" : "version",
      });
    }).pipe(Effect.provide(machineScreenLayer(streams)));
  });

  it.effect("keeps the usage error's help off the machine stdout", () => {
    const streams = makeRecordingStreams();
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(helpDocument, { helpRequest: usageError, format: "json" });
      expect(streams.log).toEqual([]);
    }).pipe(Effect.provide(machineScreenLayer(streams)));
  });
});
