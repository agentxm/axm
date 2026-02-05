import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpinnerHelper } from "./spinner.js";

// Define mock spinner type
interface MockSpinner {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

// Create the mock spinner instance
const mockSpinnerInstance: MockSpinner = {
  start: vi.fn(),
  stop: vi.fn(),
};

// Mock @clack/prompts
vi.mock("@clack/prompts", () => ({
  spinner: vi.fn(() => mockSpinnerInstance),
}));

// Import after mocking
import * as p from "@clack/prompts";

describe("createSpinnerHelper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a spinner", () => {
    const helper = createSpinnerHelper();
    expect(p.spinner).toHaveBeenCalledOnce();
    expect(helper).toBeDefined();
  });

  it("start() calls spinner.start with the message", () => {
    const helper = createSpinnerHelper();
    helper.start("Loading...");
    expect(mockSpinnerInstance.start).toHaveBeenCalledWith("Loading...");
  });

  it("stop() calls spinner.stop with the message", () => {
    const helper = createSpinnerHelper();
    helper.stop("Done!");
    expect(mockSpinnerInstance.stop).toHaveBeenCalledWith("Done!");
  });
});
