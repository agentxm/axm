defmodule AgentXM.Examples.PawMatch.Pets do
  @moduledoc """
  Curated, static roster of adoptable pets. Mirrors the other companion
  package ports so the companion skills see the same fictional shelter in
  every ecosystem.
  """

  @long_stay_threshold 120

  @type t :: %__MODULE__{
          slug: String.t(),
          name: String.t(),
          species: String.t(),
          breed: String.t(),
          age_years: non_neg_integer(),
          days_in_shelter: non_neg_integer(),
          tags: [String.t()],
          needs: String.t()
        }

  defstruct [:slug, :name, :species, :breed, :age_years, :days_in_shelter, :tags, :needs]

  @doc "Threshold beyond which a pet is considered 'long-stay'."
  def long_stay_threshold, do: @long_stay_threshold

  @doc "All adoptable pets in the example shelter."
  @spec all() :: [t()]
  def all do
    [
      %__MODULE__{
        slug: "biscuit",
        name: "Biscuit",
        species: "dog",
        breed: "Beagle mix",
        age_years: 4,
        days_in_shelter: 12,
        tags: ["playful", "social", "good-with-kids"],
        needs: "Daily walks; loves squeaky toys."
      },
      %__MODULE__{
        slug: "pepper",
        name: "Pepper",
        species: "cat",
        breed: "Domestic Shorthair",
        age_years: 8,
        days_in_shelter: 247,
        tags: ["mellow", "lap-cat", "solo"],
        needs: "Quiet home preferred; no other cats."
      },
      %__MODULE__{
        slug: "marigold",
        name: "Marigold",
        species: "dog",
        breed: "Senior Labrador",
        age_years: 11,
        days_in_shelter: 89,
        tags: ["calm", "gentle", "low-energy"],
        needs: "Joint supplements; short walks only."
      },
      %__MODULE__{
        slug: "tofu",
        name: "Tofu",
        species: "rabbit",
        breed: "Holland Lop",
        age_years: 2,
        days_in_shelter: 31,
        tags: ["curious", "social"],
        needs: "Roomy enclosure and unlimited hay."
      },
      %__MODULE__{
        slug: "otis",
        name: "Otis",
        species: "dog",
        breed: "Pittie mix",
        age_years: 5,
        days_in_shelter: 156,
        tags: ["gentle", "good-with-kids", "no-cats"],
        needs: "Cat-free home; loves toddlers."
      },
      %__MODULE__{
        slug: "juniper",
        name: "Juniper",
        species: "cat",
        breed: "Tortoiseshell",
        age_years: 3,
        days_in_shelter: 22,
        tags: ["vocal", "spunky", "solo"],
        needs: "Only cat in the household, please."
      },
      %__MODULE__{
        slug: "maple",
        name: "Maple",
        species: "dog",
        breed: "Mini Australian Shepherd",
        age_years: 1,
        days_in_shelter: 6,
        tags: ["high-energy", "smart", "needs-training"],
        needs: "Training class strongly recommended."
      },
      %__MODULE__{
        slug: "clover",
        name: "Clover & Sage",
        species: "guinea-pig",
        breed: "Bonded pair",
        age_years: 1,
        days_in_shelter: 18,
        tags: ["social", "bonded-pair"],
        needs: "Must adopt together — bonded for life."
      }
    ]
  end

  @doc "True if the pet has been in the shelter long enough to be long-stay."
  @spec long_stay?(t()) :: boolean()
  def long_stay?(%__MODULE__{days_in_shelter: days}), do: days >= @long_stay_threshold

  @doc "Find a pet by slug (case-insensitive)."
  @spec find_by_slug(String.t()) :: {:ok, t()} | :error
  def find_by_slug(slug) when is_binary(slug) do
    target = String.downcase(slug)

    case Enum.find(all(), fn pet -> String.downcase(pet.slug) == target end) do
      nil -> :error
      pet -> {:ok, pet}
    end
  end

  @doc """
  Filter the roster by species (case-insensitive). An empty species returns the
  full list.
  """
  @spec filter_by_species(String.t() | nil) :: [t()]
  def filter_by_species(nil), do: all()
  def filter_by_species(""), do: all()

  def filter_by_species(species) when is_binary(species) do
    target = String.downcase(species)
    Enum.filter(all(), fn pet -> String.downcase(pet.species) == target end)
  end
end
