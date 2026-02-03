# Core Package Instructions

## Experimental API

All code in this package is under active development. Place all new code in the `src/experimental/` folder to communicate to consumers that the API is unstable and subject to breaking changes.

Consumers MUST import experimental APIs directly from the specific module:

```typescript
import { something } from "@agentxm/core/experimental/some-module";
import { other } from "@agentxm/core/experimental/some-feature"; // feature folder with barrel
```

Do NOT use a barrel file (`index.ts`) at the `src/experimental/` level.

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
  experimental/         # All code lives here (no barrel file)
    <feature>.ts        # Single-file feature modules
    <feature>/          # Feature folders
      index.ts          # Barrel file for this feature
      <submodule>.ts
```

## Stability Guarantees

- **No stability guarantees** until code graduates from `experimental/`
- Breaking changes may occur in any release
- Consumers should pin exact versions if using experimental APIs
