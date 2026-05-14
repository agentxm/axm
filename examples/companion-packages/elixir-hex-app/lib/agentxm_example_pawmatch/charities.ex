defmodule AgentXM.Examples.PawMatch.Charities do
  @moduledoc """
  Curated static list of well-known animal-welfare charities surfaced by
  `pawmatch donate`. The CLI never processes payments and every output
  reminds users to verify ratings independently before giving.
  """

  @type t :: %__MODULE__{
          slug: String.t(),
          name: String.t(),
          focus: String.t(),
          description: String.t(),
          url: String.t(),
          rating_note: String.t()
        }

  defstruct [:slug, :name, :focus, :description, :url, :rating_note]

  @disclaimer "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

  @doc "Disclaimer appended to every donate output."
  def disclaimer, do: @disclaimer

  @doc "All curated charities."
  @spec all() :: [t()]
  def all do
    [
      %__MODULE__{
        slug: "best-friends",
        name: "Best Friends Animal Society",
        focus: "shelters",
        description:
          "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        url: "https://bestfriends.org/donate",
        rating_note: "Charity Navigator 4-star"
      },
      %__MODULE__{
        slug: "petsmart-charities",
        name: "PetSmart Charities",
        focus: "shelters",
        description: "Grants to local shelters; spay/neuter; adoption events.",
        url: "https://petsmartcharities.org/donate",
        rating_note: "Charity Navigator 4-star (96% program ratio)"
      },
      %__MODULE__{
        slug: "brother-wolf",
        name: "Brother Wolf Animal Rescue",
        focus: "rescue",
        description: "Local rescue with national-impact outreach programs.",
        url: "https://bwar.org/donate",
        rating_note: "Charity Navigator 4-star, GuideStar Platinum"
      },
      %__MODULE__{
        slug: "animal-welfare-institute",
        name: "Animal Welfare Institute",
        focus: "policy",
        description: "Policy and advocacy reducing cruelty inflicted on animals.",
        url: "https://awionline.org/donate",
        rating_note: "Charity Navigator 4-star"
      },
      %__MODULE__{
        slug: "aspca",
        name: "ASPCA",
        focus: "shelters",
        description: "Adoption, anti-cruelty programs, and animal welfare advocacy.",
        url: "https://www.aspca.org/donate",
        rating_note: "Charity Navigator 4-star"
      }
    ]
  end

  @doc "Find a charity by slug (case-insensitive)."
  @spec find_by_slug(String.t()) :: {:ok, t()} | :error
  def find_by_slug(slug) when is_binary(slug) do
    target = String.downcase(slug)

    case Enum.find(all(), fn charity -> String.downcase(charity.slug) == target end) do
      nil -> :error
      charity -> {:ok, charity}
    end
  end

  @doc "Filter charities by focus keyword. 'all' or '' returns the full list."
  @spec filter_by_focus(String.t() | nil) :: [t()]
  def filter_by_focus(nil), do: all()
  def filter_by_focus(""), do: all()
  def filter_by_focus("all"), do: all()

  def filter_by_focus(focus) when is_binary(focus) do
    target = String.downcase(focus)
    Enum.filter(all(), fn charity -> String.downcase(charity.focus) == target end)
  end
end
