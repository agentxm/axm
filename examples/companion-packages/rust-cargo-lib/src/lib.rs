//! Tiny feature-flag library used by AXM companion package examples.
//!
//! Define flags with [`Flag::boolean`] or [`Flag::variant`] and evaluate them
//! with [`Flags::enabled`], [`Flags::variant`], or [`Flags::evaluate`].
//! Rollout decisions are deterministic for a given (flag name, [`Context`])
//! pair so the same caller always receives the same answer.
//!
//! ```
//! use tinyflags::{Context, Flag, Flags};
//!
//! let flags = Flags::builder()
//!     .add("checkout-redesign", Flag::boolean().default(true).build().unwrap())
//!     .add(
//!         "search-ranking",
//!         Flag::variant(["classic", "semantic"])
//!             .default("classic")
//!             .rollout([("semantic", 100)])
//!             .build()
//!             .unwrap(),
//!     )
//!     .build()
//!     .unwrap();
//!
//! let ctx = Context::new("user-1");
//! assert!(flags.enabled("checkout-redesign", &ctx).unwrap());
//! assert_eq!(flags.variant("search-ranking", &ctx).unwrap(), "semantic");
//! ```

use std::collections::HashMap;

mod error;
mod flag;

pub use error::FlagError;
pub use flag::{BooleanBuilder, Flag, FlagKind, VariantBuilder};

/// Caller identity used for deterministic rollout bucketing. An empty id maps
/// to a single shared "anonymous" bucket; supply a stable id for per-caller
/// bucketing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Context {
    id: String,
}

impl Context {
    /// Construct a context with the given stable identifier.
    pub fn new(id: impl Into<String>) -> Self {
        Self { id: id.into() }
    }

    /// The stable identifier for this context.
    pub fn id(&self) -> &str {
        &self.id
    }
}

/// Evaluated treatment of a flag. Exactly one of [`Value::Bool`] or
/// [`Value::Variant`] is meaningful depending on the flag's [`FlagKind`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    /// Treatment of a boolean flag.
    Bool(bool),
    /// Treatment of a variant flag.
    Variant(String),
}

/// A named set of flag definitions. Construct with [`Flags::builder`].
#[derive(Debug, Clone)]
pub struct Flags {
    table: HashMap<String, Flag>,
}

impl Flags {
    /// Start building a [`Flags`] set.
    pub fn builder() -> FlagsBuilder {
        FlagsBuilder {
            entries: Vec::new(),
        }
    }

    /// Returns the [`Flag`] registered under `name`, if any.
    pub fn definition(&self, name: &str) -> Option<&Flag> {
        self.table.get(name)
    }

    /// Boolean treatment for the named flag. Errors when the flag is unknown
    /// or is not a boolean flag.
    pub fn enabled(&self, name: &str, ctx: &Context) -> Result<bool, FlagError> {
        let flag = self.require(name)?;
        match flag.kind() {
            FlagKind::Boolean => Ok(flag.evaluate_boolean(name, ctx)),
            FlagKind::Variant => Err(FlagError::WrongKind {
                name: name.to_owned(),
                expected: FlagKind::Boolean,
                actual: FlagKind::Variant,
            }),
        }
    }

    /// Variant treatment for the named flag. Errors when the flag is unknown
    /// or is not a variant flag.
    pub fn variant(&self, name: &str, ctx: &Context) -> Result<String, FlagError> {
        let flag = self.require(name)?;
        match flag.kind() {
            FlagKind::Variant => Ok(flag.evaluate_variant(name, ctx)),
            FlagKind::Boolean => Err(FlagError::WrongKind {
                name: name.to_owned(),
                expected: FlagKind::Variant,
                actual: FlagKind::Boolean,
            }),
        }
    }

    /// Kind-dispatched evaluation returning a [`Value`].
    pub fn evaluate(&self, name: &str, ctx: &Context) -> Result<Value, FlagError> {
        let flag = self.require(name)?;
        Ok(match flag.kind() {
            FlagKind::Boolean => Value::Bool(flag.evaluate_boolean(name, ctx)),
            FlagKind::Variant => Value::Variant(flag.evaluate_variant(name, ctx)),
        })
    }

    /// Registered flag names in lexicographic order.
    pub fn names(&self) -> Vec<String> {
        let mut names: Vec<String> = self.table.keys().cloned().collect();
        names.sort();
        names
    }

    fn require(&self, name: &str) -> Result<&Flag, FlagError> {
        self.table
            .get(name)
            .ok_or_else(|| FlagError::UnknownFlag {
                name: name.to_owned(),
            })
    }
}

/// Builder for [`Flags`]. Use [`Flags::builder`] to construct one.
#[derive(Debug, Default)]
pub struct FlagsBuilder {
    entries: Vec<(String, Flag)>,
}

impl FlagsBuilder {
    /// Register a flag under `name`.
    pub fn add(mut self, name: impl Into<String>, flag: Flag) -> Self {
        self.entries.push((name.into(), flag));
        self
    }

    /// Finalize the [`Flags`] set. Errors when a flag name is empty or
    /// duplicated.
    pub fn build(self) -> Result<Flags, FlagError> {
        let mut table: HashMap<String, Flag> = HashMap::with_capacity(self.entries.len());
        for (name, flag) in self.entries {
            if name.is_empty() {
                return Err(FlagError::EmptyFlagName);
            }
            if table.contains_key(&name) {
                return Err(FlagError::DuplicateFlag { name });
            }
            table.insert(name, flag);
        }
        Ok(Flags { table })
    }
}

/// Map (flag name, context id) to a stable bucket in `[0, 100)`. Identical to
/// the other TinyFlags ports so example data stays comparable.
pub(crate) fn bucket_for(name: &str, ctx: &Context) -> u32 {
    let id = if ctx.id.is_empty() {
        "anonymous"
    } else {
        ctx.id.as_str()
    };
    let mut key = String::with_capacity(name.len() + 1 + id.len());
    key.push_str(name);
    key.push(':');
    key.push_str(id);
    fnv1a_32(&key) % 100
}

/// 32-bit FNV-1a hash. Matches the implementation in the other TinyFlags
/// ports so bucketing decisions agree across ecosystems.
pub(crate) fn fnv1a_32(value: &str) -> u32 {
    const OFFSET: u32 = 2_166_136_261;
    const PRIME: u32 = 16_777_619;
    let mut hash = OFFSET;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boolean_default_is_returned_without_rollout() {
        let flags = Flags::builder()
            .add(
                "checkout-redesign",
                Flag::boolean().default(true).build().unwrap(),
            )
            .build()
            .unwrap();
        assert!(flags
            .enabled("checkout-redesign", &Context::new("user-1"))
            .unwrap());
    }

    #[test]
    fn boolean_rollout_boundaries() {
        let flags = Flags::builder()
            .add(
                "off",
                Flag::boolean().default(false).rollout(0).build().unwrap(),
            )
            .add(
                "on",
                Flag::boolean()
                    .default(false)
                    .rollout(100)
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();

        for id in ["user-1", "user-2", "alice", "bob", "carol", "dave", "eve", ""] {
            let ctx = Context::new(id);
            assert!(!flags.enabled("off", &ctx).unwrap(), "rollout 0 true for {id:?}");
            assert!(flags.enabled("on", &ctx).unwrap(), "rollout 100 false for {id:?}");
        }
    }

    #[test]
    fn boolean_fifty_percent_splits_roughly_evenly() {
        let flags = Flags::builder()
            .add(
                "half",
                Flag::boolean().default(false).rollout(50).build().unwrap(),
            )
            .build()
            .unwrap();

        let n = 1_000;
        let mut enabled = 0;
        for i in 0..n {
            let ctx = Context::new(format!("user-{i}"));
            if flags.enabled("half", &ctx).unwrap() {
                enabled += 1;
            }
        }
        assert!(
            enabled > n / 4 && enabled < (3 * n) / 4,
            "50% rollout produced {enabled}/{n} enabled — looks skewed",
        );
    }

    #[test]
    fn boolean_decision_is_stable_for_same_context() {
        let flags = Flags::builder()
            .add(
                "experiment",
                Flag::boolean().default(false).rollout(37).build().unwrap(),
            )
            .build()
            .unwrap();
        let ctx = Context::new("user-42");
        let first = flags.enabled("experiment", &ctx).unwrap();
        for _ in 0..100 {
            assert_eq!(flags.enabled("experiment", &ctx).unwrap(), first);
        }
    }

    #[test]
    fn variant_default_is_returned_without_rollout() {
        let flags = Flags::builder()
            .add(
                "search-ranking",
                Flag::variant(["classic", "semantic"])
                    .default("classic")
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();
        let got = flags
            .variant("search-ranking", &Context::new("user-1"))
            .unwrap();
        assert_eq!(got, "classic");
    }

    #[test]
    fn variant_rollout_hundred_replaces_default() {
        let flags = Flags::builder()
            .add(
                "search-ranking",
                Flag::variant(["classic", "semantic"])
                    .default("classic")
                    .rollout([("semantic", 100)])
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();
        for id in ["alice", "bob", "carol", "dave"] {
            let got = flags.variant("search-ranking", &Context::new(id)).unwrap();
            assert_eq!(got, "semantic", "id {id:?} should bucket into semantic");
        }
    }

    #[test]
    fn variant_rollout_zero_falls_back_to_default() {
        let flags = Flags::builder()
            .add(
                "search-ranking",
                Flag::variant(["classic", "semantic"])
                    .default("classic")
                    .rollout([("semantic", 0)])
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();
        let got = flags
            .variant("search-ranking", &Context::new("user-1"))
            .unwrap();
        assert_eq!(got, "classic");
    }

    #[test]
    fn variant_decision_is_stable_for_same_context() {
        let flags = Flags::builder()
            .add(
                "strategy",
                Flag::variant(["a", "b", "c"])
                    .default("a")
                    .rollout([("b", 25), ("c", 25)])
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();
        let ctx = Context::new("user-7");
        let first = flags.variant("strategy", &ctx).unwrap();
        for _ in 0..100 {
            assert_eq!(flags.variant("strategy", &ctx).unwrap(), first);
        }
    }

    #[test]
    fn variant_rejects_unknown_default() {
        let err = Flag::variant(["classic", "semantic"])
            .default("personalized")
            .build()
            .unwrap_err();
        assert!(matches!(err, FlagError::UnknownVariantDefault { .. }));
    }

    #[test]
    fn variant_rejects_unknown_rollout_key() {
        let err = Flag::variant(["classic", "semantic"])
            .rollout([("personalized", 50)])
            .build()
            .unwrap_err();
        assert!(matches!(err, FlagError::UnknownVariantRollout { .. }));
    }

    #[test]
    fn variant_rejects_rollout_over_hundred() {
        let err = Flag::variant(["classic", "semantic"])
            .rollout([("classic", 80), ("semantic", 30)])
            .build()
            .unwrap_err();
        assert!(matches!(err, FlagError::RolloutTotalExceeded { .. }));
    }

    #[test]
    fn variant_rejects_duplicate_variants() {
        let err = Flag::variant(["a", "a"]).build().unwrap_err();
        assert!(matches!(err, FlagError::DuplicateVariant { .. }));
    }

    #[test]
    fn variant_rejects_empty_list() {
        let err = Flag::variant::<&str, _>([]).build().unwrap_err();
        assert!(matches!(err, FlagError::EmptyVariantList));
    }

    #[test]
    fn boolean_rejects_invalid_percentage() {
        let err = Flag::boolean().rollout(101).build().unwrap_err();
        assert!(matches!(err, FlagError::PercentageOutOfRange { .. }));
    }

    #[test]
    fn enabled_on_variant_flag_errors() {
        let flags = Flags::builder()
            .add(
                "strategy",
                Flag::variant(["a", "b"]).default("a").build().unwrap(),
            )
            .build()
            .unwrap();
        let err = flags.enabled("strategy", &Context::default()).unwrap_err();
        assert!(matches!(err, FlagError::WrongKind { .. }));
    }

    #[test]
    fn variant_on_boolean_flag_errors() {
        let flags = Flags::builder()
            .add("toggle", Flag::boolean().default(true).build().unwrap())
            .build()
            .unwrap();
        let err = flags.variant("toggle", &Context::default()).unwrap_err();
        assert!(matches!(err, FlagError::WrongKind { .. }));
    }

    #[test]
    fn evaluate_dispatches_by_kind() {
        let flags = Flags::builder()
            .add("toggle", Flag::boolean().default(true).build().unwrap())
            .add(
                "strategy",
                Flag::variant(["a", "b"]).default("b").build().unwrap(),
            )
            .build()
            .unwrap();
        let ctx = Context::default();
        assert_eq!(flags.evaluate("toggle", &ctx).unwrap(), Value::Bool(true));
        assert_eq!(
            flags.evaluate("strategy", &ctx).unwrap(),
            Value::Variant("b".to_owned()),
        );
    }

    #[test]
    fn unknown_flag_errors() {
        let flags = Flags::builder().build().unwrap();
        let ctx = Context::default();
        assert!(matches!(
            flags.enabled("missing", &ctx).unwrap_err(),
            FlagError::UnknownFlag { .. }
        ));
        assert!(matches!(
            flags.variant("missing", &ctx).unwrap_err(),
            FlagError::UnknownFlag { .. }
        ));
        assert!(matches!(
            flags.evaluate("missing", &ctx).unwrap_err(),
            FlagError::UnknownFlag { .. }
        ));
    }

    #[test]
    fn names_returns_sorted() {
        let flags = Flags::builder()
            .add("b", Flag::boolean().build().unwrap())
            .add("a", Flag::boolean().build().unwrap())
            .add("c", Flag::variant(["x"]).build().unwrap())
            .build()
            .unwrap();
        assert_eq!(flags.names(), vec!["a", "b", "c"]);
    }

    #[test]
    fn duplicate_flag_name_errors() {
        let err = Flags::builder()
            .add("dup", Flag::boolean().build().unwrap())
            .add("dup", Flag::boolean().build().unwrap())
            .build()
            .unwrap_err();
        assert!(matches!(err, FlagError::DuplicateFlag { .. }));
    }
}
