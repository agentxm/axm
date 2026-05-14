{-# LANGUAGE OverloadedStrings #-}

module AgentXM.Example.PawMatch.Charities
  ( Charity (..)
  , allCharities
  , findBySlug
  , filterByFocus
  , disclaimer
  ) where

import           Data.Text (Text)
import qualified Data.Text as T

data Charity = Charity
  { charitySlug        :: !Text
  , charityName        :: !Text
  , charityFocus       :: !Text
  , charityDescription :: !Text
  , charityUrl         :: !Text
  , charityRatingNote  :: !Text
  } deriving (Eq, Show)

allCharities :: [Charity]
allCharities =
  [ Charity
      "best-friends"
      "Best Friends Animal Society"
      "shelters"
      "No-kill movement; supports adoptions, shelters, and advocacy nationwide."
      "https://bestfriends.org/donate"
      "Charity Navigator 4-star"
  , Charity
      "petsmart-charities"
      "PetSmart Charities"
      "shelters"
      "Grants to local shelters; spay/neuter; adoption events."
      "https://petsmartcharities.org/donate"
      "Charity Navigator 4-star (96% program ratio)"
  , Charity
      "brother-wolf"
      "Brother Wolf Animal Rescue"
      "rescue"
      "Local rescue with national-impact outreach programs."
      "https://bwar.org/donate"
      "Charity Navigator 4-star, GuideStar Platinum"
  , Charity
      "animal-welfare-institute"
      "Animal Welfare Institute"
      "policy"
      "Policy and advocacy reducing cruelty inflicted on animals."
      "https://awionline.org/donate"
      "Charity Navigator 4-star"
  , Charity
      "aspca"
      "ASPCA"
      "shelters"
      "Adoption, anti-cruelty programs, and animal welfare advocacy."
      "https://www.aspca.org/donate"
      "Charity Navigator 4-star"
  ]

disclaimer :: Text
disclaimer =
  "Curated example list — verify current ratings on Charity Navigator or \
  \GuideStar before giving."

findBySlug :: Text -> Maybe Charity
findBySlug slug =
  let target = T.toLower slug
  in case filter ((== target) . T.toLower . charitySlug) allCharities of
       (c : _) -> Just c
       []      -> Nothing

filterByFocus :: Maybe Text -> [Charity]
filterByFocus Nothing = allCharities
filterByFocus (Just focus)
  | T.toLower focus == "all" = allCharities
  | otherwise =
      let target = T.toLower focus
      in filter ((== target) . T.toLower . charityFocus) allCharities
