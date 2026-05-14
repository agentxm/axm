{-# LANGUAGE OverloadedStrings #-}

-- |
-- Module      : AgentXM.Example.PawMatch.Flags
-- Description : Flag-name constants and registry for the PawMatch app.
module AgentXM.Example.PawMatch.Flags
  ( homeCheckFollowup
  , feeBreakdownDetailed
  , longStayHighlight
  , suggestDonateAfterAdoption
  , showCharityRatings
  , recommendationStrategy
  , matchQuizDepth
  , petCardStyle
  , donateFocusDefault
  , buildRegistry
  ) where

import           AgentXM.Example.TinyFlags
import           Data.Text (Text)

homeCheckFollowup, feeBreakdownDetailed, longStayHighlight :: Text
homeCheckFollowup           = "home-check-followup"
feeBreakdownDetailed        = "fee-breakdown-detailed"
longStayHighlight           = "long-stay-highlight"

suggestDonateAfterAdoption, showCharityRatings :: Text
suggestDonateAfterAdoption  = "suggest-donate-after-adoption"
showCharityRatings          = "show-charity-ratings"

recommendationStrategy, matchQuizDepth, petCardStyle, donateFocusDefault :: Text
recommendationStrategy      = "recommendation-strategy"
matchQuizDepth              = "match-quiz-depth"
petCardStyle                = "pet-card-style"
donateFocusDefault          = "donate-focus-default"

-- | Construct the PawMatch flag registry. Smart-constructor errors crash
-- early via 'error' because these definitions are static — a misconfigured
-- registry indicates a programmer error, not a recoverable condition.
buildRegistry :: Registry
buildRegistry =
  registry
    [ (homeCheckFollowup,          FBool    (mustBool False (Just 25)))
    , (feeBreakdownDetailed,       FBool    (mustBool True  Nothing))
    , (longStayHighlight,          FBool    (mustBool True  Nothing))
    , (suggestDonateAfterAdoption, FBool    (mustBool False (Just 50)))
    , (showCharityRatings,         FBool    (mustBool True  Nothing))
    , ( recommendationStrategy
      , FVariant
          (mustVariant
            ["popularity", "match-quiz", "longest-stay"]
            "match-quiz"
            (Just [("longest-stay", 20)]))
      )
    , ( matchQuizDepth
      , FVariant
          (mustVariant
            ["short", "standard", "thorough"]
            "standard"
            Nothing)
      )
    , ( petCardStyle
      , FVariant
          (mustVariant
            ["compact", "detailed", "playful"]
            "detailed"
            Nothing)
      )
    , ( donateFocusDefault
      , FVariant
          (mustVariant ["all", "shelters", "rescue"] "all" Nothing)
      )
    ]
  where
    mustBool d r =
      case booleanFlag d r of
        Right f  -> f
        Left err -> error ("PawMatch buildRegistry: invalid boolean flag — " <> show err)
    mustVariant vs d r =
      case variantFlag vs d r of
        Right f  -> f
        Left err -> error ("PawMatch buildRegistry: invalid variant flag — " <> show err)
