import { describe, expect, it } from "vitest";

import * as Cause from "effect/Cause";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { RegistryRequestFailed, registryErrorToProblem } from "@agentxm/registry-client";
import { StepFailure } from "@agentxm/workspace/transitions/planning";
import { WorkspaceRestorationIncomplete } from "@agentxm/workspace/transitions/settlement";
import {
  AxmSkillGateUnavailable,
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  WorkspaceCatalogUnavailable,
} from "@agentxm/workspace/resolution/sources";
import {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";
import {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/workspace/subagents/lifecycle/application";

import { makeJsonErrorEnvelopeFromAppError } from "../cli-runtime/index.js";
import { makeAppError } from "./app-error.js";
import { failureToAppError, isWorkspaceFailure, toAppError } from "./conversions.js";
import { renderAppError } from "./index.js";

describe("the application boundary projection", () => {
  it("passes an AppError through unchanged", () => {
    const original = makeAppError({ code: "conflict", detail: "already handled" });
    expect(toAppError(original)).toBe(original);
    expect(isWorkspaceFailure(original)).toBe(false);
  });

  it("summarizes an untyped transition defect without exposing its stack", () => {
    const error = toAppError(
      new WorkspaceRestorationIncomplete({
        terminationCause: "failure",
        transitionCause: Cause.die(new Error("injected transition defect")),
        restorationCause: new Error("injected restoration defect"),
        snapshotDir: undefined,
        retained: ["axm.json"],
      }),
    );

    expect(error.detail).toBe(
      "Transition failed: Error: injected transition defect. Workspace restoration did not complete; the affected paths keep the state the failure left.",
    );
    expect(error.detail).not.toContain("transaction.test.ts");
  });

  it("renders the deciding typed failure inside a restoration-incomplete transition", () => {
    const error = toAppError(
      new WorkspaceRestorationIncomplete({
        terminationCause: "failure",
        transitionCause: Cause.fail(
          new StepFailure({ category: "internal", detail: "injected transition failure" }),
        ),
        restorationCause: new Error("injected restoration defect"),
        snapshotDir: undefined,
        retained: ["axm.json"],
      }),
    );

    expect(error.detail).toMatch(
      /^Transition failed: injected transition failure\. Workspace restoration did not complete;/,
    );
  });

  it("reports an unrecognized value as an internal error", () => {
    const converted = failureToAppError("unexpected");
    expect(converted.code).toBe("internal");
    expect(converted.detail).toBe("unexpected");
  });
});

describe("CLI selection failure rendering", () => {
  it("renders skill facts with the existing error category and recovery", () => {
    const failure = new SkillSelectionNotFound({
      requested: ["missing"],
      available: ["z-last", "a-first"],
    });
    expect(isWorkspaceFailure(failure)).toBe(true);
    expect(toAppError(failure)).toMatchObject({
      code: "not_found",
      detail: "No skills matched: missing. Source contains: a-first, z-last",
      suggestions: [{ description: "Check the skill names or patterns and try again" }],
    });
  });
  it("preserves subagent rendering while its policy reports only facts", () => {
    const failure = new SubagentSelectionNotFound({
      requested: ["missing"],
      available: ["review"],
    });
    expect(isWorkspaceFailure(failure)).toBe(true);
    expect(toAppError(failure)).toMatchObject({
      code: "internal",
      detail: "No subagents matched: missing",
      suggestions: [{ description: "Check the subagent names or patterns and try again." }],
    });
  });
  for (const Unavailable of [SkillSelectionUnavailable, SubagentSelectionUnavailable]) {
    it(`keeps terminal guidance through ${Unavailable.name}`, () => {
      const cause = makeAppError({
        code: "usage",
        detail: "Terminal unavailable",
        recover: "Pass an explicit name",
      });
      const failure = new Unavailable({ cause });
      expect(isWorkspaceFailure(failure)).toBe(true);
      expect(toAppError(failure)).toBe(cause);
    });
    it(`renders ${Unavailable.name} from another interface without requiring CLI errors`, () => {
      const failure = new Unavailable({ cause: new Error("Connection closed") });
      expect(toAppError(failure)).toMatchObject({ code: "usage" });
      expect(toAppError(failure).suggestions).toHaveLength(1);
    });
  }
});

const responseFor = (status: number, headers?: Readonly<Record<string, string>>) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://registry.agentxm.ai/test"),
    new Response("", { status, ...(headers === undefined ? {} : { headers }) }),
  );

describe("registry-client failure conversion (golden pairs)", () => {
  it("preserves problem-supplied title/detail and full metadata for a 503", () => {
    const body = {
      title: "Advisory title",
      status: 400,
      detail: "The service is unavailable.",
      code: "service_unavailable",
      request_id: "req_mismatch",
    };
    const cause = new Error("generated failure");

    const error = toAppError(registryErrorToProblem(body, responseFor(503), { cause }));

    expect(error.code).toBe("unavailable");
    expect(error.title).toBe("Advisory title");
    expect(error.detail).toBe("The service is unavailable.");
    expect(error.metadata).toEqual({
      request: {
        service: "registry",
        method: "GET",
        url: "https://registry.agentxm.ai/test",
      },
      response: {
        status: 503,
        requestId: "req_mismatch",
        problemCode: "service_unavailable",
        body,
      },
    });
    expect(error.cause).toBe(cause);
  });

  it("applies the per-code default title and detail when the body is not a problem document", () => {
    const cause = new Error("response failure");
    const error = toAppError(
      registryErrorToProblem("gateway unavailable", responseFor(502), { cause }),
    );

    expect(error.code).toBe("internal");
    expect(error.title).toBe("Internal Error");
    expect(error.detail).toBe("An internal error occurred.");
    expect(error.metadata?.response).toEqual({ status: 502, body: "gateway unavailable" });
    expect(error.cause).toBe(cause);
  });

  it("carries retry-after suggestions from the header for a 429", () => {
    const error = toAppError(
      registryErrorToProblem(
        {
          kind: "TooManyRequestsError",
          type: "about:blank",
          title: "Too Many Requests",
          status: 429,
          detail: "Rate limited",
          code: "publish/throttled",
          details: { retryable: true, retryAfterSeconds: 60 },
        },
        responseFor(429, { "retry-after": "30" }),
      ),
    );

    expect(error.code).toBe("rate_limit");
    expect(error.title).toBe("Too Many Requests");
    expect(error.detail).toBe("Rate limited");
    expect(error.suggestions?.[0]?.description).toBe("Retry after 30s.");
  });

  it("carries the narrowed-credential recovery for insufficient-scope 403 responses", () => {
    const error = toAppError(
      registryErrorToProblem(
        {
          kind: "ForbiddenError",
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          detail: "Token lacks required scope",
          code: "insufficient_scope",
          details: {
            requiredScope: "extensions:publish:version",
            grantedScopes: ["extensions:read"],
          },
        },
        responseFor(403),
      ),
    );

    expect(error.code).toBe("forbidden");
    expect(error.suggestions).toContainEqual({
      description: "This credential is narrower than your account. Use your signed-in session.",
    });
    // A 403 reaches someone who is signed in; signing in again is never it.
    expect(JSON.stringify(error.suggestions)).not.toContain("axm login");
  });

  it("carries lint finding suggestions for publish lint responses", () => {
    const error = toAppError(
      registryErrorToProblem(
        {
          kind: "ExtensionLintFailedError",
          type: "about:blank",
          title: "Extension lint failed",
          status: 422,
          detail: "Lint failed",
          code: "extension_lint_failed",
          error: "extension_lint_failed",
          identity: {
            owner: "@acme",
            type: "skill",
            name: "review",
            version: "1.0.0",
          },
          displayRoot: ".",
          findings: [
            {
              kind: "advisory",
              ruleId: "skill/manifest-schema-valid",
              severity: "error",
              message: "Manifest is invalid",
              path: "skill.json",
              suggestions: [],
            },
          ],
        },
        responseFor(422),
      ),
    );

    expect(error.code).toBe("validation");
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "Publish lint failed with 1 finding.",
    );
    expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
      "error: skill/manifest-schema-valid - Manifest is invalid (skill.json)",
    );
  });

  it("renders the request-policy timeout failure through the typed error view", () => {
    const requestMetadata = {
      service: "registry",
      method: "GET",
      url: "https://registry.agentxm.ai/v1/extensions",
    } as const;
    const error = toAppError(
      new RegistryRequestFailed({
        category: "timeout",
        detail: "Registry request did not complete within the configured deadline.",
        metadata: {
          request: requestMetadata,
          requestPolicy: {
            retryable: true,
            attemptCount: 1,
            maxAttempts: 1,
            exhausted: true,
            stoppedBy: "replay-unsafe",
            replaySafety: "mutation",
          },
        },
        cause: new Error("timeout"),
      }),
    );

    expect(error.code).toBe("timeout");
    expect(error.title).toBe("Timed Out");
    expect(renderAppError(error)).toBe(
      [
        " ✖   Timed Out                     timeout, exit 16",
        "     Registry request did not complete within the configured deadline.",
        "     Registry                      https://registry.agentxm.ai",
        "     --debug shows the cause.",
      ].join("\n"),
    );
    expect(makeJsonErrorEnvelopeFromAppError(error)).toMatchObject({
      ok: false,
      code: "timeout",
      title: "Timed Out",
      detail: "Registry request did not complete within the configured deadline.",
      metadata: { request: requestMetadata },
    });
  });
});

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
