//! TinyFlags definitions for the PawMatch CLI. Mirrors the other ecosystem
//! ports so the companion skills see the same seams everywhere.

const std = @import("std");
const tf = @import("tinyflags");

pub const FLAG_HOME_CHECK_FOLLOWUP: []const u8 = "home-check-followup";
pub const FLAG_FEE_BREAKDOWN_DETAILED: []const u8 = "fee-breakdown-detailed";
pub const FLAG_LONG_STAY_HIGHLIGHT: []const u8 = "long-stay-highlight";
pub const FLAG_SUGGEST_DONATE_AFTER_ADOPT: []const u8 = "suggest-donate-after-adoption";
pub const FLAG_SHOW_CHARITY_RATINGS: []const u8 = "show-charity-ratings";
pub const FLAG_RECOMMENDATION_STRATEGY: []const u8 = "recommendation-strategy";
pub const FLAG_MATCH_QUIZ_DEPTH: []const u8 = "match-quiz-depth";
pub const FLAG_PET_CARD_STYLE: []const u8 = "pet-card-style";
pub const FLAG_DONATE_FOCUS_DEFAULT: []const u8 = "donate-focus-default";

/// Build the package-level `Registry` used by the CLI. Caller owns the
/// returned registry and must call `deinit`.
pub fn buildRegistry(allocator: std.mem.Allocator) tf.FlagError!tf.Registry {
    return tf.Registry.init(allocator, &.{
        .{ .name = FLAG_HOME_CHECK_FOLLOWUP, .flag = try tf.Flag.booleanRollout(false, 25) },
        .{ .name = FLAG_FEE_BREAKDOWN_DETAILED, .flag = tf.Flag.booleanDefault(true) },
        .{ .name = FLAG_LONG_STAY_HIGHLIGHT, .flag = tf.Flag.booleanDefault(true) },
        .{ .name = FLAG_SUGGEST_DONATE_AFTER_ADOPT, .flag = try tf.Flag.booleanRollout(false, 50) },
        .{ .name = FLAG_SHOW_CHARITY_RATINGS, .flag = tf.Flag.booleanDefault(true) },
        .{
            .name = FLAG_RECOMMENDATION_STRATEGY,
            .flag = try tf.Flag.variantWithRollout(
                allocator,
                &.{ "popularity", "match-quiz", "longest-stay" },
                "match-quiz",
                &.{.{ .name = "longest-stay", .percentage = 20 }},
            ),
        },
        .{
            .name = FLAG_MATCH_QUIZ_DEPTH,
            .flag = try tf.Flag.variantDefault(
                allocator,
                &.{ "short", "standard", "thorough" },
                "standard",
            ),
        },
        .{
            .name = FLAG_PET_CARD_STYLE,
            .flag = try tf.Flag.variantDefault(
                allocator,
                &.{ "compact", "detailed", "playful" },
                "detailed",
            ),
        },
        .{
            .name = FLAG_DONATE_FOCUS_DEFAULT,
            .flag = try tf.Flag.variantDefault(
                allocator,
                &.{ "all", "shelters", "rescue" },
                "all",
            ),
        },
    });
}
