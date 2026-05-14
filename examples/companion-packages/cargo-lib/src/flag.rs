//! Flag definitions and their builders.

use std::collections::HashMap;

use crate::{bucket_for, Context, FlagError};

/// Kind tag for a [`Flag`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlagKind {
    /// Boolean treatment — true or false.
    Boolean,
    /// Variant treatment — one of a fixed set of named string values.
    Variant,
}

/// A feature flag definition. Construct one with [`Flag::boolean`] or
/// [`Flag::variant`] and finalize it with [`BooleanBuilder::build`] or
/// [`VariantBuilder::build`].
#[derive(Debug, Clone)]
pub struct Flag {
    inner: FlagInner,
}

#[derive(Debug, Clone)]
enum FlagInner {
    Boolean {
        default: bool,
        rollout: Option<u32>,
    },
    Variant {
        default: String,
        variants: Vec<String>,
        rollout: Option<HashMap<String, u32>>,
    },
}

impl Flag {
    /// Start building a boolean flag.
    pub fn boolean() -> BooleanBuilder {
        BooleanBuilder {
            default: false,
            rollout: None,
        }
    }

    /// Start building a variant flag with the given allowed values. The first
    /// variant is the default unless overridden with
    /// [`VariantBuilder::default`].
    pub fn variant<S, I>(variants: I) -> VariantBuilder
    where
        S: Into<String>,
        I: IntoIterator<Item = S>,
    {
        let raw: Vec<String> = variants.into_iter().map(Into::into).collect();
        VariantBuilder {
            variants: raw,
            default: None,
            rollout: None,
        }
    }

    /// Kind of this flag.
    pub fn kind(&self) -> FlagKind {
        match self.inner {
            FlagInner::Boolean { .. } => FlagKind::Boolean,
            FlagInner::Variant { .. } => FlagKind::Variant,
        }
    }

    pub(crate) fn evaluate_boolean(&self, name: &str, ctx: &Context) -> bool {
        let FlagInner::Boolean { default, rollout } = &self.inner else {
            unreachable!("evaluate_boolean called on non-boolean flag");
        };
        match rollout {
            None => *default,
            Some(pct) => bucket_for(name, ctx) < *pct,
        }
    }

    pub(crate) fn evaluate_variant(&self, name: &str, ctx: &Context) -> String {
        let FlagInner::Variant {
            default,
            variants,
            rollout,
        } = &self.inner
        else {
            unreachable!("evaluate_variant called on non-variant flag");
        };
        let Some(rollout) = rollout else {
            return default.clone();
        };
        let bucket = bucket_for(name, ctx);
        let mut upper_bound: u32 = 0;
        // Iterate in declared order so allocations are stable.
        for variant in variants {
            let Some(pct) = rollout.get(variant) else {
                continue;
            };
            upper_bound += *pct;
            if bucket < upper_bound {
                return variant.clone();
            }
        }
        default.clone()
    }
}

/// Builder for a boolean [`Flag`]. Construct one with [`Flag::boolean`].
#[derive(Debug)]
pub struct BooleanBuilder {
    default: bool,
    rollout: Option<i32>,
}

impl BooleanBuilder {
    /// Set the default value. Without this call the default is `false`.
    pub fn default(mut self, value: bool) -> Self {
        self.default = value;
        self
    }

    /// Set the rollout percentage. Must be in `0..=100`.
    pub fn rollout(mut self, percentage: u32) -> Self {
        // Store as i32 to surface a typed validation error in `build`.
        self.rollout = Some(percentage as i32);
        self
    }

    /// Finalize the boolean flag.
    pub fn build(self) -> Result<Flag, FlagError> {
        let rollout = match self.rollout {
            None => None,
            Some(pct) => Some(validate_percentage(pct, "rollout")?),
        };
        Ok(Flag {
            inner: FlagInner::Boolean {
                default: self.default,
                rollout,
            },
        })
    }
}

/// Builder for a variant [`Flag`]. Construct one with [`Flag::variant`].
#[derive(Debug)]
pub struct VariantBuilder {
    variants: Vec<String>,
    default: Option<String>,
    rollout: Option<Vec<(String, i32)>>,
}

impl VariantBuilder {
    /// Override the default variant. The value must be a declared variant.
    pub fn default(mut self, value: impl Into<String>) -> Self {
        self.default = Some(value.into());
        self
    }

    /// Allocate a percentage of traffic to each named variant. All variants
    /// must be declared and the total must not exceed 100.
    pub fn rollout<S, I>(mut self, allocations: I) -> Self
    where
        S: Into<String>,
        I: IntoIterator<Item = (S, u32)>,
    {
        self.rollout = Some(
            allocations
                .into_iter()
                .map(|(name, pct)| (name.into(), pct as i32))
                .collect(),
        );
        self
    }

    /// Finalize the variant flag.
    pub fn build(self) -> Result<Flag, FlagError> {
        if self.variants.is_empty() {
            return Err(FlagError::EmptyVariantList);
        }
        let mut declared: Vec<String> = Vec::with_capacity(self.variants.len());
        let mut seen: HashMap<String, ()> = HashMap::with_capacity(self.variants.len());
        for v in self.variants {
            if v.is_empty() {
                return Err(FlagError::EmptyVariantName);
            }
            if seen.contains_key(&v) {
                return Err(FlagError::DuplicateVariant { variant: v });
            }
            seen.insert(v.clone(), ());
            declared.push(v);
        }

        let default = match self.default {
            None => declared[0].clone(),
            Some(value) => {
                if !seen.contains_key(&value) {
                    return Err(FlagError::UnknownVariantDefault { value });
                }
                value
            }
        };

        let rollout = match self.rollout {
            None => None,
            Some(entries) => {
                let mut map: HashMap<String, u32> = HashMap::with_capacity(entries.len());
                let mut total: u32 = 0;
                for (variant, pct) in entries {
                    if !seen.contains_key(&variant) {
                        return Err(FlagError::UnknownVariantRollout { variant });
                    }
                    let validated = validate_percentage(pct, "variant rollout")?;
                    total = total.saturating_add(validated);
                    map.insert(variant, validated);
                }
                if total > 100 {
                    return Err(FlagError::RolloutTotalExceeded { total });
                }
                Some(map)
            }
        };

        Ok(Flag {
            inner: FlagInner::Variant {
                default,
                variants: declared,
                rollout,
            },
        })
    }
}

fn validate_percentage(value: i32, label: &'static str) -> Result<u32, FlagError> {
    if !(0..=100).contains(&value) {
        return Err(FlagError::PercentageOutOfRange { label, value });
    }
    Ok(value as u32)
}
