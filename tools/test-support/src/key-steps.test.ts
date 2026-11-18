import * as readline from "node:readline";
import { PassThrough } from "node:stream";

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { describe, expect, it } from "vitest";

import { Keys, parseKeySteps, parseTerminalSize, type TerminalKey } from "./key-steps.js";

interface DecodedKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly char?: string;
}

/**
 * What readline makes of each sequence written on its own, the way the CLI's
 * terminal reads keys: one keypress per sequence, with the text it carries.
 */
const decodeWithReadline = (sequences: ReadonlyArray<string>): Promise<Array<DecodedKey>> =>
  new Promise((resolve) => {
    const input = new PassThrough();
    const reader = readline.createInterface({ input, escapeCodeTimeout: 10 });
    readline.emitKeypressEvents(input, reader);
    const decoded: Array<DecodedKey> = [];
    const remaining = [...sequences];
    const writeNext = () => {
      const next = remaining.shift();
      if (next === undefined) {
        reader.close();
        resolve(decoded);
      } else input.write(next);
    };
    input.on("keypress", (char: string | undefined, key: readline.Key) => {
      decoded.push({
        name: key.name ?? "",
        ctrl: key.ctrl === true,
        ...(char === undefined ? {} : { char }),
      });
      // A bare escape is told apart from a sequence only once the next byte is
      // late, so each sequence is written after the one before has decoded,
      // outside the decoder that is still emitting it.
      setImmediate(writeNext);
    });
    writeNext();
  });

const decodedOf = ({ name, ctrl, char }: TerminalKey): DecodedKey => ({
  name,
  ctrl,
  ...(char === undefined ? {} : { char }),
});

describe("parseKeySteps", () => {
  it("reads waits, repeated keys, typed text, and a resize in order", () => {
    expect(parseKeySteps("await:type to filter,down*2,space,type:aB,size:80x24")).toEqual(
      Result.succeed([
        { _tag: "Await", text: "type to filter" },
        { _tag: "Press", key: Keys.down, label: "down" },
        { _tag: "Press", key: Keys.down, label: "down" },
        { _tag: "Press", key: Keys.space, label: "space" },
        {
          _tag: "Press",
          key: { sequence: "a", name: "a", ctrl: false, char: "a" },
          label: 'type "a"',
        },
        {
          _tag: "Press",
          key: { sequence: "B", name: "b", ctrl: false, char: "B" },
          label: 'type "B"',
        },
        { _tag: "Resize", size: { columns: 80, rows: 24 } },
      ]),
    );
  });

  it("reads an empty script as no steps", () => {
    expect(parseKeySteps("")).toEqual(Result.succeed([]));
  });

  it("names the first step it cannot read", () => {
    const unknown = parseKeySteps("down,sideways");
    expect(Result.isFailure(unknown) && unknown.failure).toContain('Unknown step "sideways"');
    const repeat = parseKeySteps("down*many");
    expect(Result.isFailure(repeat) && repeat.failure).toContain("down*3");
    const size = parseKeySteps("size:80");
    expect(Result.isFailure(size) && size.failure).toContain("size:80x24");
  });

  it("reads a terminal size as columns by rows", () => {
    expect(parseTerminalSize("100x40")).toEqual(Option.some({ columns: 100, rows: 40 }));
    expect(parseTerminalSize("100")).toEqual(Option.none());
    expect(parseTerminalSize("0x40")).toEqual(Option.none());
  });

  it("presses the key readline decodes from the bytes a terminal sends", async () => {
    const script = "up,down,left,right,pageup,pagedown,home,end,space,enter,tab,backspace";
    const steps = parseKeySteps(`${script},esc,ctrl+a,ctrl+c,ctrl+u,type:a1B.`);
    if (Result.isFailure(steps)) throw new Error(steps.failure);
    const keys = steps.success.flatMap((step) => (step._tag === "Press" ? [step.key] : []));
    expect(await decodeWithReadline(keys.map((key) => key.sequence))).toEqual(keys.map(decodedOf));
  });
});
