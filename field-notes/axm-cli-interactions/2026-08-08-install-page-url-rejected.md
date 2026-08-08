---
subject: axm-cli-interactions
key: install-page-url-rejected
date: 2026-08-08
kind: gap
status: open
---

**Expected:** A public AgentXM skill page URL supplied by the developer would install the extension, because `axm install --help` accepts a source locator.
**Actual:** `axm install https://agentxm.ai/@craigsmitham/skills/improve-whatever --scope project --yes --json` exited 9 with `No configured source matches URL`; the equivalent registry FQN installed successfully.
**Gap:** The CLI does not recognize the product's public extension page URLs or explain how to translate one to a registry FQN.
**Suggests:** Recognize AgentXM extension page URLs as registry locators, or return the canonical `@owner/<plural-type>/<name>` command in the error.

Evidence: the URL-form install exited 9 in clean project workspaces; `axm install @craigsmitham/skills/improve-whatever --scope project --yes --json` exited 0.
