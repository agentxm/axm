import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { paintText } from "../paint-text.js";
import { waitDoc, waitSettled } from "./view.js";
import { reduceWaitKey, waitKeys, type WaitView } from "./wait.js";

const view: WaitView = {
  subject: "device-authorization",
  detail: "waiting on you",
  label: "Device sign-in",
  status: "Waiting for approval on registry.agentxm.ai",
  brief: [{ _tag: "paragraph", text: "Sign in with a one-time code." }],
  expiresAtMs: 600_000,
};

const key = (name: string, options?: { readonly ctrl?: boolean }) => ({
  name,
  ...(name.length === 1 && options?.ctrl !== true ? { char: name } : {}),
  ctrl: options?.ctrl === true,
});

const paint = (view: WaitView, nowMs: number, columns = 80): string =>
  paintText(waitDoc(view, { open: true, copy: true }, { nowMs }), {
    width: columns,
    colors: false,
    spinner: "◒",
  }).join("\n");

describe("reduceWaitKey", () => {
  it("stops on escape and on an interrupt", () => {
    expect(reduceWaitKey(key("escape"), { open: true, copy: true })).toBe("stop");
    expect(reduceWaitKey(key("c", { ctrl: true }), { open: true, copy: true })).toBe("stop");
    expect(reduceWaitKey(key("d", { ctrl: true }), { open: true, copy: true })).toBe("stop");
  });

  it("acts on the keys the wait offers and ignores the ones it does not", () => {
    expect(reduceWaitKey(key("o"), { open: true, copy: true })).toBe("open");
    expect(reduceWaitKey(key("c"), { open: true, copy: true })).toBe("copy");
    expect(reduceWaitKey(key("o"), { open: false, copy: true })).toBe("ignore");
    expect(reduceWaitKey(key("c"), { open: true, copy: false })).toBe("ignore");
  });

  it("leaves the wait exactly as it stood for any other key", () => {
    expect(reduceWaitKey(key("return"), { open: true, copy: true })).toBe("ignore");
    expect(reduceWaitKey(key("x"), { open: true, copy: true })).toBe("ignore");
  });

  it("offers only the keys it was given something to do", () => {
    expect(waitKeys({})).toEqual({ open: false, copy: false });
    expect(waitKeys({ open: Effect.void })).toEqual({ open: true, copy: false });
    expect(waitKeys({ open: Effect.void, copy: Effect.void })).toEqual({
      open: true,
      copy: true,
    });
  });
});

describe("waitDoc", () => {
  it("counts down to the moment the handoff expires", () => {
    expect(paint(view, 600_000 - 272_000)).toContain("4m 32s left");
    expect(paint(view, 600_000 - 45_000)).toContain("45s left");
  });

  it("says a handoff has run out rather than counting past it", () => {
    expect(paint(view, 600_001)).toContain("expired");
  });

  it("carries the running mark and every key beneath the line", () => {
    const painted = paint(view, 0);
    expect(painted).toContain("◒");
    expect(painted).toContain("Waiting for approval on registry.agentxm.ai");
    expect(painted).toContain("open");
    expect(painted).toContain("copy");
    expect(painted).toContain("stop");
  });

  it("carries no countdown where nothing expires", () => {
    const { expiresAtMs: _expiresAtMs, ...endless } = view;
    expect(paint(endless, 0)).not.toContain("left");
  });

  it("never carries a value a person copies, so the line is safe to truncate", () => {
    const painted = paint(view, 0, 40);
    for (const line of painted.split("\n")) expect(line.length).toBeLessThanOrEqual(40);
  });
});

describe("waitSettled", () => {
  it("leaves one ✔ line with the label and the time it took", () => {
    expect(waitSettled(view, 12_400)).toEqual([
      { _tag: "answer", mark: "ok", label: "Device sign-in", value: "12.4s" },
    ]);
  });
});
