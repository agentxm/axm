---
observed_at: "2026-10-04T15:01:03Z"
session: "wah1"
area: "Windows account-home adapter verification"
---

# Windows rejected the isolated Bun launch

## Context

The account-home adapter launched the current executable in Bun's documented runtime mode, with home overrides and inherited runtime options removed. An explicit null-device config path prevented ambient Bun configuration loading. Linux and macOS binary smoke jobs passed on revision `84a85b32ee3a86ef737292677f5fcb27516d293c`.

## Friction

The Windows binary smoke job failed two of fourteen cases. The account query exited with code 3 without reaching its ten-second deadline. The native source regression also failed before entering the adapter, while its bootstrap used the same null-device config argument.

## Cost / impact

Windows lifecycle and binary gates failed. Local affected verification of that rejected revision was interrupted with exit 130; it produced no complete passing verdict.

## Outcome

The pull request remains a draft. The next source change replaces the null-device config argument with a scoped empty regular file. The native Windows outcome of that change is pending.

## Evidence

[CI run on the rejected revision](https://github.com/agentxm/axm/actions/runs/37211217230), Windows binary job `111462743362` and lifecycle job `111462743310`.
