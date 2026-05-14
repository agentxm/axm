---
name: cpp-conan-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe C++ rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in a C++ project consuming
`agentxm-example-tinyflags` via Conan.

## Review Checklist

- Every flag has an explicit `.with_default(...)` call.
- Boolean rollouts use integer values from 0 to 100.
- Variant rollout totals do not exceed 100.
- Unknown variant names are not referenced in rollout allocations.
- Evaluation `Context` is constructed once at the request boundary with a
  stable id (e.g. `Context(user_id)`), not ad hoc at each call site.
- Catch2 tests exercise both default and rollout-allocated paths.
- No code path assumes rollout bucketing is random per call.

## C++ Details

Check `#include <agentxm/tinyflags.hpp>` (or the project's own re-export)
at the top of files that construct flag definitions:

```cpp
#include <agentxm/tinyflags.hpp>

using namespace agentxm::tinyflags;

Registry flags;
flags.add("checkout-redesign",
          BooleanFlag::with_default(false).with_rollout(10));
```

`Registry::add(...)` throws `FlagError` on duplicate names; build-time
registration code should not silently swallow that exception. Prefer
constructing the registry once per process and passing const references.

Rollout changes should be small and reviewable. If a rollout moves from 0
to 100, confirm the disabled path can be deleted or explain why the flag
remains temporary.
