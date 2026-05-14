//! Typed enums for the four variant flags so the CLI can `switch` on them.

const std = @import("std");

pub const PetCardStyle = enum {
    compact,
    detailed,
    playful,

    pub fn parse(value: []const u8) ?PetCardStyle {
        if (std.mem.eql(u8, value, "compact")) return .compact;
        if (std.mem.eql(u8, value, "detailed")) return .detailed;
        if (std.mem.eql(u8, value, "playful")) return .playful;
        return null;
    }
};

pub const MatchStrategy = enum {
    popularity,
    match_quiz,
    longest_stay,

    pub fn parse(value: []const u8) ?MatchStrategy {
        if (std.mem.eql(u8, value, "popularity")) return .popularity;
        if (std.mem.eql(u8, value, "match-quiz")) return .match_quiz;
        if (std.mem.eql(u8, value, "longest-stay")) return .longest_stay;
        return null;
    }

    pub fn label(self: MatchStrategy) []const u8 {
        return switch (self) {
            .popularity => "popularity",
            .match_quiz => "match-quiz",
            .longest_stay => "longest-stay",
        };
    }
};

pub const MatchDepth = enum {
    short,
    standard,
    thorough,

    pub fn parse(value: []const u8) ?MatchDepth {
        if (std.mem.eql(u8, value, "short")) return .short;
        if (std.mem.eql(u8, value, "standard")) return .standard;
        if (std.mem.eql(u8, value, "thorough")) return .thorough;
        return null;
    }

    pub fn label(self: MatchDepth) []const u8 {
        return switch (self) {
            .short => "short",
            .standard => "standard",
            .thorough => "thorough",
        };
    }
};

pub const DonateFocus = enum {
    all,
    shelters,
    rescue,

    pub fn parse(value: []const u8) ?DonateFocus {
        if (std.mem.eql(u8, value, "all")) return .all;
        if (std.mem.eql(u8, value, "shelters")) return .shelters;
        if (std.mem.eql(u8, value, "rescue")) return .rescue;
        return null;
    }

    pub fn asStr(self: DonateFocus) []const u8 {
        return switch (self) {
            .all => "all",
            .shelters => "shelters",
            .rescue => "rescue",
        };
    }
};
