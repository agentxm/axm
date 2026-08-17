---
type: Explanation
title: Prompt trust boundaries
description: How to separate instructions from untrusted content and recognize where prompt defenses end.
tags: [prompt-injection, untrusted-content, least-privilege, output-validation, security]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: owasp-injection
    resource: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
    title: OWASP — LLM Prompt Injection Prevention Cheat Sheet
  - id: owasp-leakage
    resource: https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
    title: OWASP — System Prompt Leakage
---

# Prompt trust boundaries

Models process instructions and data through the same probabilistic mechanism.
Prompt structure can reduce confusion but cannot create a reliable privilege
boundary. OWASP identifies both direct user injection and indirect instructions
inside retrieved files, web pages, messages, and multimodal content.[^owasp-injection]

## Prompt-level obligations

- Label the role and authority of fixed instructions and variable content.
- Delimit untrusted content and state that it is data, not policy.
- Avoid placing credentials, secrets, authorization rules, or sensitive
  implementation details in prompts.
- Define refusal, escalation, uncertainty, and suspicious-content behavior.
- Require citations or evidence when the task depends on supplied sources.
- Test direct, indirect, encoded, persistent, and multimodal injection cases
  relevant to the deployment.

## Structural obligations outside the prompt

- validate and sanitize inputs and rendered outputs;
- restrict tools and credentials by least privilege;
- bind actions to original user intent and current authorization;
- require human approval for consequential operations;
- isolate untrusted-content processing from privileged action where warranted;
- monitor model outputs, tool calls, and anomalous behavior; and
- provide revocation, rollback, and incident response.

System-prompt secrecy is not an authorization mechanism. OWASP notes that the
material danger comes from delegating permissions or sensitive data to a prompt
instead of enforcing them structurally.[^owasp-leakage]

Evaluate prompt defenses as one layer. Never report the system secure merely
because known injection strings were refused.

[^owasp-injection]: OWASP — LLM Prompt Injection Prevention Cheat Sheet

[^owasp-leakage]: OWASP — System Prompt Leakage
