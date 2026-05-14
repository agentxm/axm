//! Pure match-engine helpers used by the `pawmatch match` command.

const std = @import("std");
const variants = @import("variants.zig");

pub const MatchPreferences = struct {
    has_kids: bool = false,
    quiet_home: bool = false,
    active: bool = false,
    first_time: bool = false,
    multiple_pets: bool = false,
    small_home: bool = false,

    pub fn isEmpty(self: MatchPreferences) bool {
        return !(self.has_kids or self.quiet_home or self.active or
            self.first_time or self.multiple_pets or self.small_home);
    }

    pub fn isActive(self: MatchPreferences, factor_flag: []const u8) bool {
        if (std.mem.eql(u8, factor_flag, "has-kids")) return self.has_kids;
        if (std.mem.eql(u8, factor_flag, "quiet-home")) return self.quiet_home;
        if (std.mem.eql(u8, factor_flag, "active")) return self.active;
        if (std.mem.eql(u8, factor_flag, "first-time")) return self.first_time;
        if (std.mem.eql(u8, factor_flag, "multiple-pets")) return self.multiple_pets;
        if (std.mem.eql(u8, factor_flag, "small-home")) return self.small_home;
        return false;
    }
};

pub const MatchFactor = struct {
    flag: []const u8,
    tags: []const []const u8,
};

pub const match_factors = [_]MatchFactor{
    .{ .flag = "has-kids", .tags = &.{ "good-with-kids", "gentle" } },
    .{ .flag = "quiet-home", .tags = &.{ "mellow", "calm", "solo", "lap-cat" } },
    .{ .flag = "active", .tags = &.{ "high-energy", "playful" } },
    .{ .flag = "first-time", .tags = &.{ "gentle", "calm", "low-energy" } },
    .{ .flag = "multiple-pets", .tags = &.{"social"} },
    .{ .flag = "small-home", .tags = &.{ "lap-cat", "solo", "low-energy" } },
};

pub const popularity_tags = [_][]const u8{ "social", "good-with-kids", "calm", "mellow", "gentle" };

pub fn factorsForDepth(depth: variants.MatchDepth) []const MatchFactor {
    const take: usize = switch (depth) {
        .short => 2,
        .standard => 4,
        .thorough => 6,
    };
    const bound = @min(take, match_factors.len);
    return match_factors[0..bound];
}

pub fn containsTag(tags: []const []const u8, target: []const u8) bool {
    for (tags) |t| {
        if (std.mem.eql(u8, t, target)) return true;
    }
    return false;
}

pub fn countMatchingTags(tags: []const []const u8, targets: []const []const u8) usize {
    var n: usize = 0;
    for (tags) |t| {
        if (containsTag(targets, t)) n += 1;
    }
    return n;
}
