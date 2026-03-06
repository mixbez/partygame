import React, { useState } from 'react';
import FactCard from './FactCard';
import NicknameSelector from './NicknameSelector';
import VictoryScreen from './VictoryScreen';
import CryptoJS from 'crypto-js';

export default function GameScreen({ state, onChange }) {
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [gameWon, setGameWon] = useState(false);

  const currentFact = state.facts[currentFactIndex];
  const totalFacts = state.facts.length;
  const correctGuesses = state.correctGuesses || 0;
  const progress = (correctGuesses / (state.factsToWin || totalFacts)) * 100;

  function validateLocallyOrOnline(nickname) {
    if (state.gameSecret && currentFact.answerHash) {
      // Offline: compute hash locally, no server round-trip
      const computed = CryptoJS.SHA256(`${currentFact.id}${nickname}${state.gameSecret}`).toString();
      return Promise.resolve({ isCorrect: computed === currentFact.answerHash });
    }
    // Online: ask server
    return fetch(
      `/api/partygame/game/${state.lobbyId}/${state.playerId}/${state.token}/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factId: currentFact.id, guessedNickname: nickname }),
      }
    ).then(r => r.json());
  }

  async function handleGuess(nickname) {
    if (state.guessedFacts.has(currentFact.id)) return;

    try {
      const data = await validateLocallyOrOnline(nickname);

      if (data.isCorrect) {
        setFeedback({ type: 'success', message: `Correct! It was ${nickname}` });

        const newGuessedFacts = new Set(state.guessedFacts);
        newGuessedFacts.add(currentFact.id);
        const newCorrect = correctGuesses + 1;
        const newState = { ...state, guessedFacts: newGuessedFacts, correctGuesses: newCorrect };

        if (newCorrect >= state.factsToWin || newGuessedFacts.size === totalFacts) {
          setGameWon(true);
        }

        setTimeout(() => {
          if (currentFactIndex < totalFacts - 1) {
            setCurrentFactIndex(i => i + 1);
            setFeedback(null);
          }
          onChange(newState);
        }, 1500);
      } else {
        setFeedback({ type: 'error', message: 'Wrong! Try again or skip.' });
        setTimeout(() => setFeedback(null), 2000);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Error submitting guess' });
    }
  }

  function handleSkip() {
    if (currentFactIndex < totalFacts - 1) {
      setCurrentFactIndex(i => i + 1);
      setFeedback(null);
    }
  }

  if (gameWon) {
    return <VictoryScreen score={correctGuesses} total={totalFacts} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6 mt-4">
          <h1 className="text-3xl font-bold text-white mb-1">Party Game</h1>
          <p className="text-white/80 text-sm">Guess who wrote each fact!</p>
        </div>

        {/* Personal progress */}
        <div className="mb-6">
          <div className="flex justify-between text-white text-sm mb-2">
            <span>Fact {currentFactIndex + 1} of {totalFacts}</span>
            <span>{correctGuesses} / {state.factsToWin} correct to win</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-green-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Players reference */}
        <div className="bg-white/10 rounded-lg p-3 mb-4 backdrop-blur-sm">
          <p className="text-white/70 text-xs mb-2 text-center">Players in this game:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {state.participants.map(p => (
              <span key={p.userId} className="bg-white/20 text-white text-xs px-2 py-1 rounded-full">
                {p.nickname}
              </span>
            ))}
          </div>
        </div>

        <FactCard fact={currentFact} feedback={feedback} />

        <NicknameSelector
          participants={state.participants}
          onSelect={handleGuess}
          disabled={state.guessedFacts.has(currentFact.id)}
        />

        <div className="mt-4 text-center">
          <button
            onClick={handleSkip}
            disabled={currentFactIndex >= totalFacts - 1}
            className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-6 py-2 rounded-lg transition-all text-sm"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
