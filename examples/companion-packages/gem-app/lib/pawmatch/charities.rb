# frozen_string_literal: true

module Pawmatch
  module Charities
    Charity = Struct.new(
      :slug, :name, :focus, :description, :url, :rating_note,
      keyword_init: true
    )

    ALL = [
      Charity.new(
        slug: "best-friends",
        name: "Best Friends Animal Society",
        focus: "shelters",
        description: "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        url: "https://bestfriends.org/donate",
        rating_note: "Charity Navigator 4-star"
      ),
      Charity.new(
        slug: "petsmart-charities",
        name: "PetSmart Charities",
        focus: "shelters",
        description: "Grants to local shelters; spay/neuter; adoption events.",
        url: "https://petsmartcharities.org/donate",
        rating_note: "Charity Navigator 4-star (96% program ratio)"
      ),
      Charity.new(
        slug: "brother-wolf",
        name: "Brother Wolf Animal Rescue",
        focus: "rescue",
        description: "Local rescue with national-impact outreach programs.",
        url: "https://bwar.org/donate",
        rating_note: "Charity Navigator 4-star, GuideStar Platinum"
      ),
      Charity.new(
        slug: "animal-welfare-institute",
        name: "Animal Welfare Institute",
        focus: "policy",
        description: "Policy and advocacy reducing cruelty inflicted on animals.",
        url: "https://awionline.org/donate",
        rating_note: "Charity Navigator 4-star"
      ),
      Charity.new(
        slug: "aspca",
        name: "ASPCA",
        focus: "shelters",
        description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
        url: "https://www.aspca.org/donate",
        rating_note: "Charity Navigator 4-star"
      )
    ].freeze

    DISCLAIMER =
      "Curated example list — verify current ratings on Charity Navigator or " \
      "GuideStar before giving."

    BY_SLUG = ALL.each_with_object({}) { |c, acc| acc[c.slug.downcase] = c }.freeze

    def self.find_by_slug(slug)
      return nil if slug.nil?

      BY_SLUG[slug.downcase]
    end

    def self.filter_by_focus(focus)
      return ALL if focus.nil? || focus.downcase == "all"

      target = focus.downcase
      ALL.select { |c| c.focus.downcase == target }
    end
  end
end
