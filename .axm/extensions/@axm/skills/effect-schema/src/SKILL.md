---
name: effect-schema
description: Effect Schema naming conventions. Use when defining schemas for data validation and type inference.
user-invocable: false
---

# Effect Schema Conventions

Naming conventions for Effect Schema definitions.

---

## Naming Pattern

Schema constants use the `Schema` suffix. Types are derived and exported without the suffix.

```typescript
import { Schema } from "effect";

// Schema constant: <TypeName>Schema
export const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

// Type export: <TypeName> (no suffix)
export type User = typeof UserSchema.Type;
```

---

## Examples

```typescript
// Simple schema
export const ConfigSchema = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
});
export type Config = typeof ConfigSchema.Type;

// Schema with optional fields
export const SettingsSchema = Schema.Struct({
  theme: Schema.optional(Schema.String),
  verbose: Schema.optional(Schema.Boolean),
});
export type Settings = typeof SettingsSchema.Type;

// Union schema
export const ResultSchema = Schema.Union(
  Schema.Struct({ type: Schema.Literal("success"), data: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
);
export type Result = typeof ResultSchema.Type;

// Array schema
export const ItemsSchema = Schema.Array(Schema.String);
export type Items = typeof ItemsSchema.Type;
```

---

## Checklist

- [ ] Schema constant named `<TypeName>Schema`
- [ ] Type exported as `<TypeName>` using `typeof <TypeName>Schema.Type`
- [ ] Schema and type exported together for consumer use
