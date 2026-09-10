/**
 * Table-driven conversion tests pinning the extension-sources boundary
 * byte-for-byte: each tag's converter must produce exactly the envelope the
 * former in-module `makeAppError` construction produced — code, title,
 * detail, folded recovery suggestions, and cause.
 */

import { describe, expect, it } from "vitest";

import {
  AxmSkillGateUnavailable,
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  WorkspaceCatalogUnavailable,
} from "@agentxm/extension-sources";
import { toAppError } from "../conversions.js";

describe("extension-sources failure conversion (golden pairs)", () => {
  it("renders a syntax failure as a validation envelope with the carried sentence", () => {
    const cause = new Error("decode failure");
    const error = toAppError(
      new SourceSyntaxInvalid({ detail: 'Invalid provider shorthand "github:x"', cause }),
    );

    expect(error.code).toBe("validation");
    expect(error.title).toBe("Invalid Request");
    expect(error.detail).toBe('Invalid provider shorthand "github:x"');
    expect(error.suggestions).toBeUndefined();
    expect(error.cause).toBe(cause);
  });

  it("renders an unmatched host as a validation envelope", () => {
    const error = toAppError(
      new SourceHostNotConfigured({
        detail: 'No configured source matches URL "https://example.com/a/b"',
      }),
    );

    expect(error.code).toBe("validation");
    expect(error.detail).toBe('No configured source matches URL "https://example.com/a/b"');
    expect(error.cause).toBeUndefined();
  });

  it("carries the resolution site's category, sentence, and suggestions verbatim", () => {
    const error = toAppError(
      new SourceNotResolvable({
        category: "not_found",
        detail: '"missing" did not match any skills in installed scope',
        suggestions: [{ description: "Check the name, or re-run with a fully-qualified name." }],
      }),
    );

    expect(error.code).toBe("not_found");
    expect(error.detail).toBe('"missing" did not match any skills in installed scope');
    expect(error.suggestions).toEqual([
      { description: "Check the name, or re-run with a fully-qualified name." },
    ]);
  });

  it("folds recover/cmd sugar exactly as the former envelope construction did", () => {
    const error = toAppError(
      new SourceNotResolvable({
        category: "conflict",
        detail: "The official AXM skill release 2.0.0 is incompatible with this AXM CLI.",
        recover: "Converge to AXM CLI 2.0.0 + official AXM skill 2.0.0",
        cmd: "axm upgrade",
      }),
    );

    expect(error.code).toBe("conflict");
    expect(error.suggestions).toEqual([
      {
        description: "Converge to AXM CLI 2.0.0 + official AXM skill 2.0.0",
        cmd: "axm upgrade",
      },
    ]);
  });

  it("renders a network acquisition failure with the network code", () => {
    const cause = new Error("mkdtemp failure");
    const error = toAppError(
      new SourceNetworkFailure({
        detail: "Temporary source directory could not be created",
        cause,
      }),
    );

    expect(error.code).toBe("network");
    expect(error.detail).toBe("Temporary source directory could not be created");
    expect(error.retryable).toBeUndefined();
    expect(error.cause).toBe(cause);
  });

  it("maps git clones to network and SHA reads to validation", () => {
    const cause = new Error("git exited 128");
    const clone = toAppError(
      new GitOperationFailed({
        operation: "clone",
        detail: "Failed to shallow clone https://example.com/repo.git",
        cause,
      }),
    );
    expect(clone.code).toBe("network");
    expect(clone.detail).toBe("Failed to shallow clone https://example.com/repo.git");
    expect(clone.cause).toBe(cause);

    const treeSha = toAppError(
      new GitOperationFailed({
        operation: "get-tree-sha",
        detail: "Failed to get tree SHA for 'subdir'",
        cause,
      }),
    );
    expect(treeSha.code).toBe("validation");
    expect(treeSha.detail).toBe("Failed to get tree SHA for 'subdir'");
  });

  it("restores a workspace catalog port failure one-to-one", () => {
    const cause = new Error("settings unreadable");
    const error = toAppError(
      new WorkspaceCatalogUnavailable({
        category: "validation",
        detail: "Workspace settings at /tmp/axm.json are not valid JSON",
        suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
        cause,
      }),
    );

    expect(error.code).toBe("validation");
    expect(error.detail).toBe("Workspace settings at /tmp/axm.json are not valid JSON");
    expect(error.suggestions).toEqual([
      { description: "Fix the JSON syntax in the settings file, then re-run." },
    ]);
    expect(error.cause).toBe(cause);
  });

  it("restores an AXM skill gate port failure one-to-one", () => {
    const error = toAppError(
      new AxmSkillGateUnavailable({
        category: "internal",
        detail: "AXM compatibility policy did not evaluate the official AXM skill",
        cause: undefined,
      }),
    );

    expect(error.code).toBe("internal");
    expect(error.detail).toBe("AXM compatibility policy did not evaluate the official AXM skill");
    expect(error.suggestions).toBeUndefined();
  });
});
