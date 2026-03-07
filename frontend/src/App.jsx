import React, { useState, useEffect } from 'react';
import GameScreen from './components/GameScreen';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';
import HostDashboard from './pages/HostDashboard';
import PrintPreview from './pages/PrintPreview';

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageType, setPageType] = useState(null);

  useEffect(() => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // Check for host dashboard route: /game/host/:lobbyId
    const hostMatch = pathname.match(/\/game\/host\/(\d+)$/);
    if (hostMatch) {
      const lobbyId = hostMatch[1];
      const token = params.get('token') || extractTokenFromUrl();
      if (!token) {
        setError('Missing host token. Invalid dashboard link.');
        setLoading(false);
        return;
      }
      setPageType('host-dashboard');
      setGameState({ lobbyId, token });
      setLoading(false);
      return;
    }

    // Check for print preview route: /game/print/:lobbyId
    const printMatch = pathname.match(/\/game\/print\/(\d+)$/);
    if (printMatch) {
      const lobbyId = printMatch[1];
      const token = params.get('token') || extractTokenFromUrl();
      if (!token) {
        setError('Missing host token. Invalid print link.');
        setLoading(false);
        return;
      }
      setPageType('print-preview');
      setGameState({ lobbyId, token });
      setLoading(false);
      return;
    }

    // Default: game screen
    const lobbyId = params.get('lobby');
    const playerId = params.get('player');
    const token = params.get('token');

    if (!lobbyId || !playerId || !token) {
      setError('Missing game parameters. Invalid game link.');
      setLoading(false);
      return;
    }

    setPageType('game');
    loadGameData(lobbyId, playerId, token);
  }, []);

  function extractTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

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

  // Render host dashboard
  if (pageType === 'host-dashboard' && gameState) {
    return (
      <HostDashboard
        lobbyId={gameState.lobbyId}
        hostToken={gameState.token}
      />
    );
  }

  // Render print preview
  if (pageType === 'print-preview' && gameState) {
    return (
      <PrintPreview
        lobbyId={gameState.lobbyId}
        hostToken={gameState.token}
      />
    );
  }

  // Render game screen
  if (!gameState) {
    return <ErrorScreen error="Game data not available" />;
  }

  return <GameScreen state={gameState} onChange={setGameState} />;
}
