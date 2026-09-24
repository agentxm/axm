import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";
import { CliError } from "effect/unstable/cli";

import { presentBuiltInOutput } from "./built-in-output.js";
import { makeAxmFormatter } from "./formatter.js";
import { stripTerminalFormatting } from "./screen/index.js";
import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
} from "./test-support/screen-harness.js";

const ESCAPE = "\u001b";
const formatter = makeAxmFormatter();

const helpDocument = formatter.formatHelpDoc({
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
});
const versionDocument = formatter.formatVersion("axm", "1.2.3");

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

  it.effect("narrates help and then the usage error on stderr", () => {
    const streams = makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY: false });
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(helpDocument, { helpRequest: usageError, format: "text" });

      expect(streams.lines("stdout")).toEqual([]);
      const stderr = streams.lines("stderr").join("\n");
      expect(stderr.indexOf("USAGE")).toBeLessThan(stderr.indexOf("Usage Error"));
      expect(stderr).toContain("Unrecognized flag: --bogus");
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
  ])(
    "writes the formatter's $label document as the machine result, byte for byte",
    ({ document }) => {
      const streams = makeRecordingStreams();
      return Effect.gen(function* () {
        yield* presentBuiltInOutput(document, { helpRequest: undefined, format: "json" });
        expect(streams.log.map((entry) => entry.content)).toEqual([document]);
      }).pipe(Effect.provide(machineScreenLayer(streams)));
    },
  );

  it.effect("keeps the usage error's help off the machine stdout", () => {
    const streams = makeRecordingStreams();
    return Effect.gen(function* () {
      yield* presentBuiltInOutput(helpDocument, { helpRequest: usageError, format: "json" });
      expect(streams.log).toEqual([]);
    }).pipe(Effect.provide(machineScreenLayer(streams)));
  });

  it.effect("passes console text that is not a formatter document through as written", () => {
    const streams = makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY: true });
    return Effect.gen(function* () {
      yield* presentBuiltInOutput("plain console text\n", {
        helpRequest: undefined,
        format: "text",
      });
      yield* presentBuiltInOutput("", { helpRequest: undefined, format: "text" });
      expect(streams.lines("stdout")).toEqual(["plain console text"]);
    }).pipe(Effect.provide(humanScreenLayer(streams)));
  });
});
