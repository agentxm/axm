//! Error type for TinyFlags construction and evaluation.

use std::fmt;

use crate::FlagKind;

/// All TinyFlags errors. Construction errors fire from `*Builder::build`,
/// evaluation errors fire from `Flags::{enabled, variant, evaluate}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FlagError {
    /// Flag name was empty when registered with [`crate::FlagsBuilder::add`].
    EmptyFlagName,
    /// Two flags were registered under the same name.
    DuplicateFlag { name: String },
    /// Variant list was empty.
    EmptyVariantList,
    /// Variant list contained an empty string.
    EmptyVariantName,
    /// Variant list contained a duplicate.
    DuplicateVariant { variant: String },
    /// `default(...)` referenced a value not in the variant list.
    UnknownVariantDefault { value: String },
    /// `rollout(...)` referenced a key not in the variant list.
    UnknownVariantRollout { variant: String },
    /// Percentage value was outside `0..=100`.
    PercentageOutOfRange { label: &'static str, value: i32 },
    /// Sum of variant rollout percentages exceeded 100.
    RolloutTotalExceeded { total: u32 },
    /// Looked up a flag that was not registered.
    UnknownFlag { name: String },
    /// Tried to evaluate a flag with the wrong accessor (e.g., calling
    /// `enabled` on a variant flag).
    WrongKind {
        name: String,
        expected: FlagKind,
        actual: FlagKind,
    },
}

impl fmt::Display for FlagError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyFlagName => f.write_str("flag name must not be empty"),
            Self::DuplicateFlag { name } => write!(f, "duplicate flag {name:?}"),
            Self::EmptyVariantList => f.write_str("variant list must not be empty"),
            Self::EmptyVariantName => f.write_str("variant names must not be empty"),
            Self::DuplicateVariant { variant } => write!(f, "duplicate variant {variant:?}"),
            Self::UnknownVariantDefault { value } => {
                write!(f, "default {value:?} is not a declared variant")
            }
            Self::UnknownVariantRollout { variant } => {
                write!(f, "rollout references unknown variant {variant:?}")
            }
            Self::PercentageOutOfRange { label, value } => {
                write!(f, "{label}: percentage {value} is outside [0, 100]")
            }
            Self::RolloutTotalExceeded { total } => {
                write!(f, "rollout total {total} exceeds 100")
            }
            Self::UnknownFlag { name } => write!(f, "unknown flag {name:?}"),
            Self::WrongKind {
                name,
                expected,
                actual,
            } => write!(
                f,
                "flag {name:?} is a {actual:?} flag, expected a {expected:?} flag",
            ),
        }
    }
}

impl std::error::Error for FlagError {}
