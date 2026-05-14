//! Static, curated list of well-known, highly-rated animal-welfare
//! organizations. PawMatch never processes payments — every output reminds
//! the user to verify ratings independently.

const std = @import("std");

pub const Charity = struct {
    slug: []const u8,
    name: []const u8,
    focus: []const u8,
    description: []const u8,
    url: []const u8,
    rating_note: []const u8,
};

pub const all_charities = [_]Charity{
    .{
        .slug = "best-friends",
        .name = "Best Friends Animal Society",
        .focus = "shelters",
        .description = "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        .url = "https://bestfriends.org/donate",
        .rating_note = "Charity Navigator 4-star",
    },
    .{
        .slug = "petsmart-charities",
        .name = "PetSmart Charities",
        .focus = "shelters",
        .description = "Grants to local shelters; spay/neuter; adoption events.",
        .url = "https://petsmartcharities.org/donate",
        .rating_note = "Charity Navigator 4-star (96% program ratio)",
    },
    .{
        .slug = "brother-wolf",
        .name = "Brother Wolf Animal Rescue",
        .focus = "rescue",
        .description = "Local rescue with national-impact outreach programs.",
        .url = "https://bwar.org/donate",
        .rating_note = "Charity Navigator 4-star, GuideStar Platinum",
    },
    .{
        .slug = "animal-welfare-institute",
        .name = "Animal Welfare Institute",
        .focus = "policy",
        .description = "Policy and advocacy reducing cruelty inflicted on animals.",
        .url = "https://awionline.org/donate",
        .rating_note = "Charity Navigator 4-star",
    },
    .{
        .slug = "aspca",
        .name = "ASPCA",
        .focus = "shelters",
        .description = "Adoption, anti-cruelty programs, and animal welfare advocacy.",
        .url = "https://www.aspca.org/donate",
        .rating_note = "Charity Navigator 4-star",
    },
};

pub const charities_disclaimer =
    "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving.";

pub fn findBySlug(slug: []const u8) ?*const Charity {
    for (&all_charities) |*c| {
        if (std.ascii.eqlIgnoreCase(c.slug, slug)) return c;
    }
    return null;
}

pub fn matchesFocus(charity: *const Charity, focus: []const u8) bool {
    if (focus.len == 0 or std.ascii.eqlIgnoreCase(focus, "all")) return true;
    return std.ascii.eqlIgnoreCase(charity.focus, focus);
}
