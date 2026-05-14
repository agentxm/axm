{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import           AgentXM.Example.PawMatch.Cli (Command (..), parseCommand, runCli)
import           Data.List (isInfixOf)
import           GHC.IO.Handle (hDuplicate, hDuplicateTo)
import           System.Exit (ExitCode (..))
import           System.IO
import           Test.Hspec

main :: IO ()
main = hspec $ do
  describe "parseCommand" $ do
    it "no args returns usage" $ do
      let Left help = parseCommand []
      "pawmatch" `shouldSatisfy` (`isInfixOf` help)
      "Commands:" `shouldSatisfy` (`isInfixOf` help)

    it "parses 'browse' with no species" $
      parseCommand ["browse"] `shouldBe` Right (Browse Nothing)

    it "parses 'browse --species cat'" $
      parseCommand ["browse", "--species", "cat"]
        `shouldBe` Right (Browse (Just "cat"))

    it "parses 'fees'" $
      parseCommand ["fees"] `shouldBe` Right Fees

    it "parses 'return-support'" $
      parseCommand ["return-support"] `shouldBe` Right ReturnSupport

    it "parses 'show pepper'" $
      parseCommand ["show", "pepper"] `shouldBe` Right (ShowPet "pepper")

    it "parses 'apply biscuit'" $
      parseCommand ["apply", "biscuit"] `shouldBe` Right (Apply "biscuit")

    it "parses 'donate' with no args" $
      parseCommand ["donate"] `shouldBe` Right (Donate Nothing Nothing False)

    it "parses 'donate --focus rescue'" $
      parseCommand ["donate", "--focus", "rescue"]
        `shouldBe` Right (Donate Nothing (Just "rescue") False)

    it "parses 'donate brother-wolf --open'" $
      parseCommand ["donate", "brother-wolf", "--open"]
        `shouldBe` Right (Donate (Just "brother-wolf") Nothing True)

    it "rejects unknown commands" $ do
      let result = parseCommand ["teleport"]
      case result of
        Right _  -> expectationFailure "Expected parse failure for unknown command"
        Left _   -> pure ()

  describe "runCli command output" $ do
    it "no args prints usage" $ do
      (code, out, _err) <- capture []
      code `shouldBe` ExitSuccess
      "pawmatch" `shouldSatisfy` (`isInfixOf` out)
      "Commands:" `shouldSatisfy` (`isInfixOf` out)

    it "fees exits zero" $ do
      (code, out, _err) <- capture ["fees"]
      code `shouldBe` ExitSuccess
      "Adoption fees" `shouldSatisfy` (`isInfixOf` out)

    it "browse lists pets" $ do
      (code, out, _err) <- capture ["browse"]
      code `shouldBe` ExitSuccess
      "Biscuit" `shouldSatisfy` (`isInfixOf` out)

    it "browse --species cat filters" $ do
      (code, out, _err) <- capture ["browse", "--species", "cat"]
      code `shouldBe` ExitSuccess
      "Pepper" `shouldSatisfy` (`isInfixOf` out)
      "Biscuit" `shouldNotSatisfy` (`isInfixOf` out)

    it "browse --species dragon reports none" $ do
      (code, out, _err) <- capture ["browse", "--species", "dragon"]
      code `shouldBe` ExitSuccess
      "No adoptable pets found" `shouldSatisfy` (`isInfixOf` out)

    it "show known pet succeeds" $ do
      (code, out, _err) <- capture ["show", "pepper"]
      code `shouldBe` ExitSuccess
      "Pepper" `shouldSatisfy` (`isInfixOf` out)
      "Needs:" `shouldSatisfy` (`isInfixOf` out)

    it "show unknown pet fails" $ do
      (code, _out, err) <- capture ["show", "nope"]
      code `shouldBe` ExitFailure 1
      "Unknown pet" `shouldSatisfy` (`isInfixOf` err)

    it "match with flags reports strategy and quiz depth" $ do
      (code, out, _err) <- capture ["match", "--has-kids", "--active"]
      code `shouldBe` ExitSuccess
      "Strategy:" `shouldSatisfy` (`isInfixOf` out)
      "Quiz depth:" `shouldSatisfy` (`isInfixOf` out)

    it "apply known pet succeeds" $ do
      (code, out, _err) <- capture ["apply", "biscuit"]
      code `shouldBe` ExitSuccess
      "Adoption application for Biscuit" `shouldSatisfy` (`isInfixOf` out)
      "Meet-and-greet" `shouldSatisfy` (`isInfixOf` out)

    it "apply unknown pet fails" $ do
      (code, _out, err) <- capture ["apply", "nope"]
      code `shouldBe` ExitFailure 1
      "Unknown pet" `shouldSatisfy` (`isInfixOf` err)

    it "return-support exits zero" $ do
      (code, out, _err) <- capture ["return-support"]
      code `shouldBe` ExitSuccess
      "Return support" `shouldSatisfy` (`isInfixOf` out)
      "No-judgment" `shouldSatisfy` (`isInfixOf` out)

    it "donate lists charities" $ do
      (code, out, _err) <- capture ["donate"]
      code `shouldBe` ExitSuccess
      "Animal-welfare charities" `shouldSatisfy` (`isInfixOf` out)
      "Best Friends" `shouldSatisfy` (`isInfixOf` out)

    it "donate --focus rescue filters" $ do
      (code, out, _err) <- capture ["donate", "--focus", "rescue"]
      code `shouldBe` ExitSuccess
      "Brother Wolf" `shouldSatisfy` (`isInfixOf` out)
      "Best Friends Animal Society" `shouldNotSatisfy` (`isInfixOf` out)

    it "donate known slug shows charity" $ do
      (code, out, _err) <- capture ["donate", "brother-wolf"]
      code `shouldBe` ExitSuccess
      "Brother Wolf" `shouldSatisfy` (`isInfixOf` out)

    it "donate unknown slug fails" $ do
      (code, _out, err) <- capture ["donate", "not-a-charity"]
      code `shouldBe` ExitFailure 1
      "Unknown charity" `shouldSatisfy` (`isInfixOf` err)

-- | Capture stdout and stderr by routing them through pipes. Returns the
-- exit code and the captured strings. We avoid impure global mutation by
-- restoring handles via 'hDuplicateTo' on cleanup.
capture :: [String] -> IO (ExitCode, String, String)
capture argv = do
  (outRead, outWrite) <- createPipe
  (errRead, errWrite) <- createPipe
  hSetBuffering outWrite NoBuffering
  hSetBuffering errWrite NoBuffering

  origOut <- hDuplicate stdout
  origErr <- hDuplicate stderr
  hDuplicateTo outWrite stdout
  hDuplicateTo errWrite stderr

  code <- runCli argv stdout stderr
  hFlush stdout
  hFlush stderr
  hClose outWrite
  hClose errWrite

  hDuplicateTo origOut stdout
  hDuplicateTo origErr stderr
  hClose origOut
  hClose origErr

  out <- hGetContents outRead
  err <- hGetContents errRead
  -- Force evaluation before the pipes are GC'd.
  length out `seq` length err `seq` pure (code, out, err)
