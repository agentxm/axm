//! Pure match-engine helpers used by the `pawmatch match` command.

use std::collections::HashSet;

use crate::variants::MatchDepth;

#[derive(Debug, Clone, Default)]
pub struct MatchPreferences {
    pub has_kids: bool,
    pub quiet_home: bool,
    pub active: bool,
    pub first_time: bool,
    pub multiple_pets: bool,
    pub small_home: bool,
}

impl MatchPreferences {
    pub fn is_empty(&self) -> bool {
        !(self.has_kids
            || self.quiet_home
            || self.active
            || self.first_time
            || self.multiple_pets
            || self.small_home)
    }

    pub fn active_factors(&self) -> HashSet<&'static str> {
        let mut out: HashSet<&'static str> = HashSet::new();
        if self.has_kids {
            out.insert("has-kids");
        }
        if self.quiet_home {
            out.insert("quiet-home");
        }
        if self.active {
            out.insert("active");
        }
        if self.first_time {
            out.insert("first-time");
        }
        if self.multiple_pets {
            out.insert("multiple-pets");
        }
        if self.small_home {
            out.insert("small-home");
        }
        out
    }
}

#[derive(Debug, Clone, Copy)]
pub struct MatchFactor {
    pub flag: &'static str,
    pub tags: &'static [&'static str],
}

pub const MATCH_FACTORS: &[MatchFactor] = &[
    MatchFactor {
        flag: "has-kids",
        tags: &["good-with-kids", "gentle"],
    },
    MatchFactor {
        flag: "quiet-home",
        tags: &["mellow", "calm", "solo", "lap-cat"],
    },
    MatchFactor {
        flag: "active",
        tags: &["high-energy", "playful"],
    },
    MatchFactor {
        flag: "first-time",
        tags: &["gentle", "calm", "low-energy"],
    },
    MatchFactor {
        flag: "multiple-pets",
        tags: &["social"],
    },
    MatchFactor {
        flag: "small-home",
        tags: &["lap-cat", "solo", "low-energy"],
    },
];

pub const POPULARITY_TAGS: &[&str] = &["social", "good-with-kids", "calm", "mellow", "gentle"];

pub fn factors_for_depth(depth: MatchDepth) -> &'static [MatchFactor] {
    let take = match depth {
        MatchDepth::Short => 2,
        MatchDepth::Standard => 4,
        MatchDepth::Thorough => 6,
    };
    let bound = take.min(MATCH_FACTORS.len());
    &MATCH_FACTORS[..bound]
}

pub fn count_tag_matches(tags: &[&str], target: &HashSet<&str>) -> usize {
    tags.iter().filter(|t| target.contains(*t)).count()
}
