{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import           AgentXM.Example.TinyFlags
import           Data.Either (isLeft)
import qualified Data.Text as T
import           Test.Hspec

main :: IO ()
main = hspec $ do
  describe "BooleanFlag" $ do
    it "uses default when no rollout is set" $ do
      let Right flag = booleanFlag True Nothing
          reg = registry [("checkout-redesign", FBool flag)]
          ctx = anonymousContext { ctxUserId = Just "user-1" }
      enabled reg "checkout-redesign" ctx `shouldBe` Right True

    it "rollout of 0 is always off" $ do
      let Right flag = booleanFlag False (Just 0)
          reg = registry [("experiment", FBool flag)]
      enabled reg "experiment" (anonymousContext { ctxUserId = Just "user-1" })
        `shouldBe` Right False
      enabled reg "experiment" (anonymousContext { ctxUserId = Just "user-42" })
        `shouldBe` Right False

    it "rollout of 100 is always on" $ do
      let Right flag = booleanFlag False (Just 100)
          reg = registry [("experiment", FBool flag)]
      enabled reg "experiment" (anonymousContext { ctxUserId = Just "user-1" })
        `shouldBe` Right True
      enabled reg "experiment" (anonymousContext { ctxUserId = Just "user-42" })
        `shouldBe` Right True

    it "rollout is deterministic per context" $ do
      let Right flag = booleanFlag False (Just 50)
          reg = registry [("experiment", FBool flag)]
          ctx = anonymousContext { ctxUserId = Just "user-1" }
          a = enabled reg "experiment" ctx
          b = enabled reg "experiment" ctx
          c = enabled reg "experiment" ctx
      a `shouldBe` b
      b `shouldBe` c

    it "50% rollout falls within a stable boundary across 200 users" $ do
      let Right flag = booleanFlag False (Just 50)
          reg = registry [("experiment", FBool flag)]
          countOn =
            length
              [ ()
              | i <- [0 .. 199 :: Int]
              , let ctx = anonymousContext { ctxUserId = Just (T.pack ("user-" <> show i)) }
              , Right True <- [enabled reg "experiment" ctx]
              ]
      countOn `shouldSatisfy` (>= 70)
      countOn `shouldSatisfy` (<= 130)

    it "rejects rollout above 100" $
      booleanFlag False (Just 101) `shouldSatisfy` isLeft

    it "rejects negative rollout" $
      booleanFlag False (Just (-1)) `shouldSatisfy` isLeft

  describe "VariantFlag" $ do
    it "returns default when no rollout is set" $ do
      let Right vf = variantFlag ["classic", "semantic"] "classic" Nothing
          reg = registry [("search-ranking", FVariant vf)]
      variant reg "search-ranking" (anonymousContext { ctxUserId = Just "user-1" })
        `shouldBe` Right "classic"

    it "rollout of 0 returns default" $ do
      let Right vf =
            variantFlag ["classic", "semantic"] "classic"
              (Just [("semantic", 0)])
          reg = registry [("search-ranking", FVariant vf)]
      variant reg "search-ranking" (anonymousContext { ctxUserId = Just "user-1" })
        `shouldBe` Right "classic"

    it "full allocation always returns that variant" $ do
      let Right vf =
            variantFlag ["classic", "semantic"] "classic"
              (Just [("semantic", 100)])
          reg = registry [("search-ranking", FVariant vf)]
      variant reg "search-ranking" (anonymousContext { ctxUserId = Just "user-1" })
        `shouldBe` Right "semantic"
      variant reg "search-ranking" (anonymousContext { ctxUserId = Just "user-42" })
        `shouldBe` Right "semantic"

    it "is deterministic per context" $ do
      let Right vf =
            variantFlag ["classic", "semantic", "personalized"] "classic"
              (Just [("semantic", 33), ("personalized", 33)])
          reg = registry [("search-ranking", FVariant vf)]
          ctx = anonymousContext { ctxUserId = Just "user-1" }
      variant reg "search-ranking" ctx
        `shouldBe` variant reg "search-ranking" ctx

    it "rejects empty variants" $
      variantFlag [] "classic" Nothing `shouldSatisfy` isLeft

    it "rejects default not in variants" $
      variantFlag ["classic", "semantic"] "personalized" Nothing
        `shouldSatisfy` isLeft

    it "rejects unknown rollout variant" $
      variantFlag ["classic", "semantic"] "classic"
        (Just [("personalized", 10)])
        `shouldSatisfy` isLeft

    it "rejects rollout total above 100" $
      variantFlag ["classic", "semantic"] "classic"
        (Just [("semantic", 80), ("classic", 30)])
        `shouldSatisfy` isLeft

  describe "Registry" $ do
    it "lookup of an unknown flag returns UnknownFlag" $ do
      let reg = registry []
      enabled reg "missing" anonymousContext `shouldBe` Left (UnknownFlag "missing")

    it "evaluate dispatches by flag kind" $ do
      let Right bf = booleanFlag True Nothing
          Right vf = variantFlag ["classic", "semantic"] "classic" Nothing
          reg =
            registry
              [ ("checkout-redesign", FBool bf)
              , ("search-ranking", FVariant vf)
              ]
      evaluate reg "checkout-redesign" anonymousContext
        `shouldBe` Right (EBool True)
      evaluate reg "search-ranking" anonymousContext
        `shouldBe` Right (EVariant "classic")
