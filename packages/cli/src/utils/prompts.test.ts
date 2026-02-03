import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @clack/prompts before importing the module under test
vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
}));

// Mock tty module
vi.mock("./tty.js", () => ({
  isInteractive: vi.fn(),
}));

// Import after mocks are set up
import * as p from "@clack/prompts";
import {
  canPrompt,
  PromptError,
  promptConfirm,
  promptMultiselect,
  promptSelect,
} from "./prompts.js";
import { isInteractive } from "./tty.js";

describe("canPrompt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when yes flag is set", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({ yes: true })).toBe(false);
  });

  it("returns false when nonInteractive flag is set", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({ nonInteractive: true })).toBe(false);
  });

  it("returns false when both yes and nonInteractive are set", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({ yes: true, nonInteractive: true })).toBe(false);
  });

  it("returns false when stdin is not interactive", () => {
    vi.mocked(isInteractive).mockReturnValue(false);
    expect(canPrompt({})).toBe(false);
  });

  it("returns true when interactive and no flags set", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({})).toBe(true);
  });

  it("returns true with empty args object", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({})).toBe(true);
  });

  it("returns true when yes is false and interactive", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({ yes: false })).toBe(true);
  });

  it("returns true when nonInteractive is false and interactive", () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    expect(canPrompt({ nonInteractive: false })).toBe(true);
  });
});

describe("promptConfirm", () => {
  // biome-ignore lint/suspicious/noExplicitAny: vi.spyOn type is complex
  let mockProcessExit: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
  });

  it("returns true when user confirms", async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptConfirm("Continue?"));
    expect(result).toBe(true);
    expect(p.confirm).toHaveBeenCalledWith({
      message: "Continue?",
      initialValue: true,
    });
  });

  it("returns false when user declines", async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptConfirm("Continue?"));
    expect(result).toBe(false);
  });

  it("uses provided initial value", async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);
    vi.mocked(p.isCancel).mockReturnValue(false);

    await Effect.runPromise(promptConfirm("Delete?", false));
    expect(p.confirm).toHaveBeenCalledWith({
      message: "Delete?",
      initialValue: false,
    });
  });

  it("calls cancel and exits process on cancel", async () => {
    const cancelSymbol = Symbol("cancel");
    vi.mocked(p.confirm).mockResolvedValue(cancelSymbol as unknown as boolean);
    vi.mocked(p.isCancel).mockReturnValue(true);

    // The process.exit(0) call throws in tests (mocked above)
    // which gets caught by Effect.tryPromise's catch handler
    const exit = await Effect.runPromiseExit(promptConfirm("Continue?"));

    // Verify cancel message was shown and process.exit was called
    expect(p.cancel).toHaveBeenCalledWith("Operation cancelled.");
    expect(mockProcessExit).toHaveBeenCalledWith(0);

    // The thrown error from process.exit gets wrapped in PromptError
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("wraps errors in PromptError", async () => {
    const originalError = new Error("Prompt failed");
    vi.mocked(p.confirm).mockRejectedValue(originalError);

    const exit = await Effect.runPromiseExit(promptConfirm("Continue?"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(error).toBeInstanceOf(PromptError);
      expect((error as PromptError).message).toBe("Failed to prompt for confirmation");
      expect((error as PromptError).cause).toBe(originalError);
    }
  });
});

describe("promptSelect", () => {
  // biome-ignore lint/suspicious/noExplicitAny: vi.spyOn type is complex
  let mockProcessExit: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
  });

  interface TestItem {
    id: string;
    name: string;
  }

  const items: TestItem[] = [
    { id: "a", name: "Item A" },
    { id: "b", name: "Item B" },
    { id: "c", name: "Item C" },
  ];

  const toOption = (item: TestItem) => ({
    value: item.id,
    label: item.name,
  });

  it("returns selected item", async () => {
    vi.mocked(p.select).mockResolvedValue(1); // Select index 1 (Item B)
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptSelect("Choose:", items, toOption));
    expect(result).toEqual({ id: "b", name: "Item B" });
  });

  it("passes message to prompt", async () => {
    vi.mocked(p.select).mockResolvedValue(0);
    vi.mocked(p.isCancel).mockReturnValue(false);

    await Effect.runPromise(promptSelect("Pick one:", items, toOption));
    expect(p.select).toHaveBeenCalledWith({
      message: "Pick one:",
      options: [
        { value: 0, label: "Item A" },
        { value: 1, label: "Item B" },
        { value: 2, label: "Item C" },
      ],
    });
  });

  it("includes hint in options when provided", async () => {
    vi.mocked(p.select).mockResolvedValue(0);
    vi.mocked(p.isCancel).mockReturnValue(false);

    const toOptionWithHint = (item: TestItem) => ({
      value: item.id,
      label: item.name,
      hint: `ID: ${item.id}`,
    });

    await Effect.runPromise(promptSelect("Pick one:", items, toOptionWithHint));
    expect(p.select).toHaveBeenCalledWith({
      message: "Pick one:",
      options: [
        { value: 0, label: "Item A", hint: "ID: a" },
        { value: 1, label: "Item B", hint: "ID: b" },
        { value: 2, label: "Item C", hint: "ID: c" },
      ],
    });
  });

  it("calls cancel and exits process on cancel", async () => {
    const cancelSymbol = Symbol("cancel");
    vi.mocked(p.select).mockResolvedValue(cancelSymbol as unknown as number);
    vi.mocked(p.isCancel).mockReturnValue(true);

    // The process.exit(0) call throws in tests (mocked above)
    // which gets caught by Effect.tryPromise's catch handler
    const exit = await Effect.runPromiseExit(promptSelect("Choose:", items, toOption));

    // Verify cancel message was shown and process.exit was called
    expect(p.cancel).toHaveBeenCalledWith("Operation cancelled.");
    expect(mockProcessExit).toHaveBeenCalledWith(0);

    // The thrown error from process.exit gets wrapped in PromptError
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("wraps errors in PromptError", async () => {
    const originalError = new Error("Select failed");
    vi.mocked(p.select).mockRejectedValue(originalError);

    const exit = await Effect.runPromiseExit(promptSelect("Choose:", items, toOption));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(error).toBeInstanceOf(PromptError);
      expect((error as PromptError).message).toBe("Failed to prompt for selection");
      expect((error as PromptError).cause).toBe(originalError);
    }
  });

  it("fails with PromptError on invalid selection index", async () => {
    vi.mocked(p.select).mockResolvedValue(999); // Invalid index
    vi.mocked(p.isCancel).mockReturnValue(false);

    const exit = await Effect.runPromiseExit(promptSelect("Choose:", items, toOption));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(error).toBeInstanceOf(PromptError);
      expect((error as PromptError).message).toBe("Failed to prompt for selection");
    }
  });
});

describe("promptMultiselect", () => {
  // biome-ignore lint/suspicious/noExplicitAny: vi.spyOn type is complex
  let mockProcessExit: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
  });

  interface TestItem {
    id: string;
    name: string;
  }

  const items: TestItem[] = [
    { id: "a", name: "Item A" },
    { id: "b", name: "Item B" },
    { id: "c", name: "Item C" },
  ];

  const toOption = (item: TestItem) => ({
    value: item.id,
    label: item.name,
  });

  it("returns selected items", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([0, 2]); // Select indices 0 and 2
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptMultiselect("Choose:", items, { toOption }));
    expect(result).toEqual([
      { id: "a", name: "Item A" },
      { id: "c", name: "Item C" },
    ]);
  });

  it("returns empty array when nothing selected", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([]);
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptMultiselect("Choose:", items, { toOption }));
    expect(result).toEqual([]);
  });

  it("passes message and options to prompt", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([]);
    vi.mocked(p.isCancel).mockReturnValue(false);

    await Effect.runPromise(promptMultiselect("Pick many:", items, { toOption }));
    // Without initialValues or required, only message and options are passed
    expect(p.multiselect).toHaveBeenCalledWith({
      message: "Pick many:",
      options: [
        { value: 0, label: "Item A" },
        { value: 1, label: "Item B" },
        { value: 2, label: "Item C" },
      ],
    });
  });

  it("passes required option", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([0]);
    vi.mocked(p.isCancel).mockReturnValue(false);

    await Effect.runPromise(promptMultiselect("Pick many:", items, { toOption, required: true }));
    expect(p.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        required: true,
      }),
    );
  });

  it("maps initialValues to indices", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([0, 2]);
    vi.mocked(p.isCancel).mockReturnValue(false);

    await Effect.runPromise(
      promptMultiselect("Pick many:", items, {
        toOption,
        initialValues: ["a", "c"],
      }),
    );
    expect(p.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: [0, 2],
      }),
    );
  });

  it("includes hint in options when provided", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([]);
    vi.mocked(p.isCancel).mockReturnValue(false);

    const toOptionWithHint = (item: TestItem) => ({
      value: item.id,
      label: item.name,
      hint: `ID: ${item.id}`,
    });

    await Effect.runPromise(promptMultiselect("Pick many:", items, { toOption: toOptionWithHint }));
    // Without initialValues or required, only message and options are passed
    expect(p.multiselect).toHaveBeenCalledWith({
      message: "Pick many:",
      options: [
        { value: 0, label: "Item A", hint: "ID: a" },
        { value: 1, label: "Item B", hint: "ID: b" },
        { value: 2, label: "Item C", hint: "ID: c" },
      ],
    });
  });

  it("calls cancel and exits process on cancel", async () => {
    const cancelSymbol = Symbol("cancel");
    vi.mocked(p.multiselect).mockResolvedValue(cancelSymbol as unknown as number[]);
    vi.mocked(p.isCancel).mockReturnValue(true);

    // The process.exit(0) call throws in tests (mocked above)
    // which gets caught by Effect.tryPromise's catch handler
    const exit = await Effect.runPromiseExit(promptMultiselect("Choose:", items, { toOption }));

    // Verify cancel message was shown and process.exit was called
    expect(p.cancel).toHaveBeenCalledWith("Operation cancelled.");
    expect(mockProcessExit).toHaveBeenCalledWith(0);

    // The thrown error from process.exit gets wrapped in PromptError
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("wraps errors in PromptError", async () => {
    const originalError = new Error("Multiselect failed");
    vi.mocked(p.multiselect).mockRejectedValue(originalError);

    const exit = await Effect.runPromiseExit(promptMultiselect("Choose:", items, { toOption }));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(error).toBeInstanceOf(PromptError);
      expect((error as PromptError).message).toBe("Failed to prompt for multiselect");
      expect((error as PromptError).cause).toBe(originalError);
    }
  });

  it("filters out undefined items from invalid indices", async () => {
    vi.mocked(p.multiselect).mockResolvedValue([0, 999, 2]); // 999 is invalid
    vi.mocked(p.isCancel).mockReturnValue(false);

    const result = await Effect.runPromise(promptMultiselect("Choose:", items, { toOption }));
    // Invalid index 999 should be filtered out
    expect(result).toEqual([
      { id: "a", name: "Item A" },
      { id: "c", name: "Item C" },
    ]);
  });
});
