import React, { useState, useEffect } from 'react';
import '../styles/HostDashboard.css';

export default function HostDashboard({ lobbyId, hostToken }) {
  const [lobby, setLobby] = useState(null);
  const [facts, setFacts] = useState([]);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newFactContent, setNewFactContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [excludedFactIds, setExcludedFactIds] = useState(new Set());

  useEffect(() => {
    loadDashboard();
  }, [lobbyId, hostToken]);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}`,
        {
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load dashboard: ${response.statusText}`);
      }

      const data = await response.json();
      setLobby(data.lobby);
      setFacts(data.facts || []);
      setValidation(data.validation);

      // Track excluded facts
      const excluded = new Set();
      data.facts?.forEach(f => {
        if (f.excluded) excluded.add(f.id);
      });
      setExcludedFactIds(excluded);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFactExclusion(factId) {
    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/facts/${factId}/toggle`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to toggle fact');
      }

      const data = await response.json();

      if (data.excluded) {
        setExcludedFactIds(new Set([...excludedFactIds, factId]));
      } else {
        const newSet = new Set(excludedFactIds);
        newSet.delete(factId);
        setExcludedFactIds(newSet);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function addFact() {
    if (!newFactContent.trim()) {
      setError('Please enter a fact');
      return;
    }

    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/facts/add`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hostToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: newFactContent })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add fact');
      }

      setNewFactContent('');
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateGame() {
    if (!validation?.canGenerate) {
      setError('Game cannot be generated. ' + validation?.message);
      return;
    }

    try {
      setGenerating(true);
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/generate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate game');
      }

      setError(null);
      await loadDashboard();
      alert('✅ Game generated successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handlePrintPreview() {
    window.location.href = `/game/print/${lobbyId}?token=${hostToken}`;
  }

  if (loading) {
    return <div className="host-dashboard loading">Loading dashboard...</div>;
  }

  if (error && !lobby) {
    return <div className="host-dashboard error">❌ {error}</div>;
  }

  if (!lobby) {
    return <div className="host-dashboard error">❌ Lobby not found</div>;
  }

  const availableFacts = facts.filter(f => !f.excluded);
  const participantCount = lobby.participants?.length || 0;

  return (
    <div className="host-dashboard">
      <div className="header">
        <h1>🎮 Host Dashboard — Lobby #{lobbyId}</h1>
        <p className="status">Status: <strong>{lobby.status}</strong></p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="grid-2">
        {/* Lobby Info */}
        <section className="card lobby-info">
          <h2>Lobby Settings</h2>
          <dl>
            <dt>Mode:</dt>
            <dd>{lobby.mode}</dd>
            <dt>Password:</dt>
            <dd>{lobby.password ? '•••' : 'None'}</dd>
            <dt>Facts per Player:</dt>
            <dd>{lobby.facts_per_player}</dd>
            <dt>Facts to Win:</dt>
            <dd>{lobby.facts_to_win}</dd>
          </dl>
        </section>

        {/* Participants */}
        <section className="card participants">
          <h2>Participants ({participantCount})</h2>
          <ul className="participants-list">
            {lobby.participants?.map(p => (
              <li key={p.id}>
                <span className="name">
                  {p.first_name || p.username || `Player ${p.user_id}`}
                </span>
                {p.nickname && <span className="nickname">→ {p.nickname}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Validation Status */}
      <section className="card validation">
        <h2>Game Validation</h2>
        <div className={`status-box ${validation?.canGenerate ? 'ready' : 'blocked'}`}>
          <p>{validation?.message}</p>
          <ul className="checklist">
            <li className={participantCount >= 2 ? 'ok' : 'fail'}>
              ✓ Players: {participantCount} ≥ 2
            </li>
            <li className={availableFacts.length >= validation?.minimumFacts ? 'ok' : 'fail'}>
              ✓ Facts: {availableFacts.length} ≥ {validation?.minimumFacts} needed
            </li>
          </ul>
        </div>

        <div className="action-buttons">
          <button
            className="btn-primary"
            onClick={generateGame}
            disabled={!validation?.canGenerate || generating}
          >
            {generating ? '⏳ Generating...' : '🚀 Generate Game'}
          </button>
          {lobby.status === 'generated' && (
            <button className="btn-secondary" onClick={handlePrintPreview}>
              🖨️ Print Preview
            </button>
          )}
        </div>
      </section>

      {/* Add Fact */}
      {(lobby.status === 'waiting' || lobby.status === 'generated') && (
        <section className="card add-fact">
          <h2>Add Fact (by Host)</h2>
          <div className="input-group">
            <textarea
              value={newFactContent}
              onChange={e => setNewFactContent(e.target.value)}
              placeholder="Enter a fact to add to the pool..."
              rows="3"
            />
            <button className="btn-secondary" onClick={addFact}>
              ➕ Add Fact
            </button>
          </div>
        </section>
      )}

      {/* Facts Management */}
      <section className="card facts-management">
        <h2>Facts Management ({facts.length} total, {availableFacts.length} available)</h2>
        <div className="facts-list">
          {facts.map(fact => (
            <div
              key={fact.id}
              className={`fact-item ${fact.excluded ? 'excluded' : 'included'}`}
            >
              <div className="fact-content">
                <p>{fact.content}</p>
                <small>
                  by {fact.user_id === lobby.host_id ? '(Host)' : `Player ${fact.user_id}`}
                </small>
              </div>
              <button
                className={fact.excluded ? 'btn-include' : 'btn-exclude'}
                onClick={() => toggleFactExclusion(fact.id)}
                disabled={!['waiting', 'generated'].includes(lobby.status)}
              >
                {fact.excluded ? '➕ Include' : '❌ Exclude'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
