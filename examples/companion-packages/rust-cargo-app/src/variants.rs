//! Typed enums for the four variant flags so the CLI can `match` on them.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PetCardStyle {
    Compact,
    Detailed,
    Playful,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchStrategy {
    Popularity,
    MatchQuiz,
    LongestStay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchDepth {
    Short,
    Standard,
    Thorough,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DonateFocus {
    All,
    Shelters,
    Rescue,
}

/// Error returned when a TinyFlags variant string does not map to any
/// known enum value.
#[derive(Debug, Clone)]
pub struct ParseVariantError {
    pub flag: &'static str,
    pub value: String,
}

impl fmt::Display for ParseVariantError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pawmatch: unknown {} variant {:?}", self.flag, self.value)
    }
}

impl std::error::Error for ParseVariantError {}

impl PetCardStyle {
    pub fn parse(value: &str) -> Result<Self, ParseVariantError> {
        match value {
            "compact" => Ok(Self::Compact),
            "detailed" => Ok(Self::Detailed),
            "playful" => Ok(Self::Playful),
            _ => Err(ParseVariantError {
                flag: "pet-card-style",
                value: value.to_owned(),
            }),
        }
    }
}

impl MatchStrategy {
    pub fn parse(value: &str) -> Result<Self, ParseVariantError> {
        match value {
            "popularity" => Ok(Self::Popularity),
            "match-quiz" => Ok(Self::MatchQuiz),
            "longest-stay" => Ok(Self::LongestStay),
            _ => Err(ParseVariantError {
                flag: "recommendation-strategy",
                value: value.to_owned(),
            }),
        }
    }
}

impl fmt::Display for MatchStrategy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Popularity => "popularity",
            Self::MatchQuiz => "match-quiz",
            Self::LongestStay => "longest-stay",
        };
        f.write_str(s)
    }
}

impl MatchDepth {
    pub fn parse(value: &str) -> Result<Self, ParseVariantError> {
        match value {
            "short" => Ok(Self::Short),
            "standard" => Ok(Self::Standard),
            "thorough" => Ok(Self::Thorough),
            _ => Err(ParseVariantError {
                flag: "match-quiz-depth",
                value: value.to_owned(),
            }),
        }
    }
}

impl fmt::Display for MatchDepth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Short => "short",
            Self::Standard => "standard",
            Self::Thorough => "thorough",
        };
        f.write_str(s)
    }
}

impl DonateFocus {
    pub fn parse(value: &str) -> Result<Self, ParseVariantError> {
        match value {
            "all" => Ok(Self::All),
            "shelters" => Ok(Self::Shelters),
            "rescue" => Ok(Self::Rescue),
            _ => Err(ParseVariantError {
                flag: "donate-focus-default",
                value: value.to_owned(),
            }),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Shelters => "shelters",
            Self::Rescue => "rescue",
        }
    }
}
