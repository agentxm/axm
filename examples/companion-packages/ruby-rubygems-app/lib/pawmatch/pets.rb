# frozen_string_literal: true

module Pawmatch
  module Pets
    Pet = Struct.new(
      :slug, :name, :species, :breed, :age_years, :days_in_shelter, :tags, :needs,
      keyword_init: true
    ) do
      def long_stay?
        days_in_shelter >= 120
      end
    end

    ALL = [
      Pet.new(
        slug: "biscuit", name: "Biscuit", species: "dog", breed: "Beagle mix",
        age_years: 4, days_in_shelter: 12,
        tags: %w[playful social good-with-kids],
        needs: "Daily walks; loves squeaky toys."
      ),
      Pet.new(
        slug: "pepper", name: "Pepper", species: "cat", breed: "Domestic Shorthair",
        age_years: 8, days_in_shelter: 247,
        tags: %w[mellow lap-cat solo],
        needs: "Quiet home preferred; no other cats."
      ),
      Pet.new(
        slug: "marigold", name: "Marigold", species: "dog", breed: "Senior Labrador",
        age_years: 11, days_in_shelter: 89,
        tags: %w[calm gentle low-energy],
        needs: "Joint supplements; short walks only."
      ),
      Pet.new(
        slug: "tofu", name: "Tofu", species: "rabbit", breed: "Holland Lop",
        age_years: 2, days_in_shelter: 31,
        tags: %w[curious social],
        needs: "Roomy enclosure and unlimited hay."
      ),
      Pet.new(
        slug: "otis", name: "Otis", species: "dog", breed: "Pittie mix",
        age_years: 5, days_in_shelter: 156,
        tags: %w[gentle good-with-kids no-cats],
        needs: "Cat-free home; loves toddlers."
      ),
      Pet.new(
        slug: "juniper", name: "Juniper", species: "cat", breed: "Tortoiseshell",
        age_years: 3, days_in_shelter: 22,
        tags: %w[vocal spunky solo],
        needs: "Only cat in the household, please."
      ),
      Pet.new(
        slug: "maple", name: "Maple", species: "dog", breed: "Mini Australian Shepherd",
        age_years: 1, days_in_shelter: 6,
        tags: %w[high-energy smart needs-training],
        needs: "Training class strongly recommended."
      ),
      Pet.new(
        slug: "clover", name: "Clover & Sage", species: "guinea-pig", breed: "Bonded pair",
        age_years: 1, days_in_shelter: 18,
        tags: %w[social bonded-pair],
        needs: "Must adopt together — bonded for life."
      )
    ].freeze

    BY_SLUG = ALL.each_with_object({}) { |pet, acc| acc[pet.slug.downcase] = pet }.freeze

    def self.find_by_slug(slug)
      return nil if slug.nil?

      BY_SLUG[slug.downcase]
    end

    def self.filter_by_species(species)
      return ALL if species.nil?

      target = species.downcase
      ALL.select { |pet| pet.species.downcase == target }
    end
  end
end
