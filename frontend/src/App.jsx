import React, { useState, useEffect } from 'react';
import GameScreen from './components/GameScreen';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lobbyId = params.get('lobby');
    const playerId = params.get('player');
    const token = params.get('token');

    if (!lobbyId || !playerId || !token) {
      setError('Missing game parameters. Invalid game link.');
      setLoading(false);
      return;
    }

    loadGameData(lobbyId, playerId, token);
  }, []);

  async function loadGameData(lobbyId, playerId, token) {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/partygame/game/${lobbyId}/${playerId}/${token}`
      );

      if (!response.ok) {
        throw new Error('Failed to load game data');
      }

      const data = await response.json();
      setGameState({
        lobbyId,
        playerId,
        token,
        ...data.game,
        guessedFacts: new Set(),
        correctGuesses: 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen error={error} />;
  }

  if (!gameState) {
    return <ErrorScreen error="Game data not available" />;
  }

  return <GameScreen state={gameState} onChange={setGameState} />;
}
