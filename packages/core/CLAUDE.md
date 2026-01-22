# Core Package Instructions

## Experimental API

All code in this package is under active development. Place all new code in the `src/experimental/` folder to communicate to consumers that the API is unstable and subject to breaking changes.

Consumers MUST import experimental APIs from the `/experimental` subpath:

```typescript
import { something } from "@agentxm/core/experimental";
```

Do NOT re-export experimental code from the main entry point (`src/index.ts`).

## JSDoc Requirements

All exported functions, types, and classes MUST include JSDoc with the `@experimental` tag:

```typescript
/**
 * Description of what this does.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const myFunction = () => { ... };
```

## Package Structure

```
src/
  index.ts              # Stable exports only (minimal)
  experimental/         # All implementation code lives here
    index.ts            # Barrel export for experimental APIs
    <feature>.ts        # Feature modules
```

## Stability Guarantees

- **No stability guarantees** until code graduates from `experimental/`
- Breaking changes may occur in any release
- Consumers should pin exact versions if using experimental APIs
