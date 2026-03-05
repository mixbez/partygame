import React, { useState } from 'react';
import FactCard from './FactCard';
import NicknameSelector from './NicknameSelector';
import ScoreBoard from './ScoreBoard';
import VictoryScreen from './VictoryScreen';
import crypto from 'crypto-js';

export default function GameScreen({ state, onChange }) {
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [gameWon, setGameWon] = useState(false);

  const currentFact = state.facts[currentFactIndex];
  const totalFacts = state.facts.length;
  const progress = ((state.guessedFacts.size + 1) / totalFacts) * 100;

  async function handleGuess(nickname) {
    if (state.guessedFacts.has(currentFact.id)) {
      setFeedback('You already guessed this fact!');
      return;
    }

    try {
      // Compute hash locally for verification
      const computedHash = crypto
        .SHA256(`${currentFact.id}${nickname}${state.gameSecret}`)
        .toString();

      const response = await fetch(
        `/api/partygame/game/${state.lobbyId}/${state.playerId}/${state.token}/validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factId: currentFact.id,
            guessedNickname: nickname,
            computedHash,
          }),
        }
      );

      const data = await response.json();

      if (data.isCorrect) {
        setFeedback({
          type: 'success',
          message: `✅ Correct! It was ${nickname}`,
        });

        const newGuessedFacts = new Set(state.guessedFacts);
        newGuessedFacts.add(currentFact.id);

        const newState = {
          ...state,
          guessedFacts: newGuessedFacts,
          correctGuesses: (state.correctGuesses || 0) + 1,
        };

        if (
          newState.correctGuesses >= state.factsToWin ||
          newGuessedFacts.size === totalFacts
        ) {
          setGameWon(true);
        }

        setTimeout(() => {
          if (currentFactIndex < totalFacts - 1) {
            setCurrentFactIndex(currentFactIndex + 1);
            setFeedback(null);
          }
          onChange(newState);
        }, 1500);
      } else {
        setFeedback({
          type: 'error',
          message: '❌ Wrong! Try again or skip.',
        });

        setTimeout(() => {
          setFeedback(null);
        }, 2000);
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: 'Error submitting guess',
      });
    }
  }

  function handleSkip() {
    if (currentFactIndex < totalFacts - 1) {
      setCurrentFactIndex(currentFactIndex + 1);
      setFeedback(null);
    }
  }

  if (gameWon) {
    return <VictoryScreen score={state.correctGuesses} total={totalFacts} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 mt-4">
          <h1 className="text-4xl font-bold text-white mb-2">🎮 Party Game</h1>
          <p className="text-white/80">Guess who wrote each fact!</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-white mb-2">
            <span>Fact {currentFactIndex + 1}/{totalFacts}</span>
            <span>{state.correctGuesses}/{state.factsToWin} to win</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-green-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Score Board */}
        <ScoreBoard participants={state.participants} />

        {/* Fact Card */}
        <FactCard fact={currentFact} feedback={feedback} />

        {/* Nickname Selector */}
        <NicknameSelector
          participants={state.participants}
          onSelect={handleGuess}
          disabled={state.guessedFacts.has(currentFact.id)}
          isLoading={feedback?.type === 'loading'}
        />

        {/* Skip Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSkip}
            disabled={currentFactIndex >= totalFacts - 1}
            className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-6 py-2 rounded-lg transition-all"
          >
            Skip Fact ⏭️
          </button>
        </div>
      </div>
    </div>
  );
}
