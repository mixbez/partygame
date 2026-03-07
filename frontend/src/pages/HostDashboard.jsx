import React, { useState, useEffect } from 'react';
import '../styles/HostDashboard.css';

export default function HostDashboard({ lobbyId, hostToken }) {
  const [lobby, setLobby] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Settings edit state
  const [editSettings, setEditSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});

  // Add fact form state
  const [addFactForm, setAddFactForm] = useState({});

  // Expanded participants
  const [expandedParticipants, setExpandedParticipants] = useState(new Set());

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
      setParticipants(data.participants || []);
      setValidation(data.validation);

      // Initialize settings form
      setSettingsForm({
        facts_per_player: data.lobby.facts_per_player,
        facts_to_win: data.lobby.facts_to_win,
        mode: data.lobby.mode,
        password: data.lobby.password || ''
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings() {
    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/settings`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${hostToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            facts_per_player: parseInt(settingsForm.facts_per_player),
            facts_to_win: parseInt(settingsForm.facts_to_win),
            mode: settingsForm.mode,
            password: settingsForm.password || null
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update settings');
      }

      setEditSettings(false);
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function kickParticipant(userId) {
    if (!window.confirm('Are you sure you want to kick this player?')) return;

    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/participants/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to kick player');
      }

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addFact(userId) {
    const content = addFactForm[userId]?.trim();
    if (!content) {
      setError('Please enter fact text');
      return;
    }

    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/participants/${userId}/facts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hostToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to add fact');
      }

      setAddFactForm({ ...addFactForm, [userId]: '' });
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFact(factId) {
    if (!window.confirm('Delete this fact?')) return;

    try {
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/facts/${factId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete fact');
      }

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

  async function startGame() {
    try {
      setGenerating(true);
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/start`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start game');
      }

      setError(null);
      await loadDashboard();
      alert('✅ Game started! Players have been notified.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handlePrintPreview() {
    window.location.href = `/game/print/${lobbyId}?token=${hostToken}`;
  }

  function toggleParticipantExpanded(userId) {
    const newSet = new Set(expandedParticipants);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setExpandedParticipants(newSet);
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

  const isWaiting = lobby.status === 'waiting';

  return (
    <div className="host-dashboard">
      <div className="header">
        <h1>🎮 Host Dashboard — Lobby #{lobbyId}</h1>
        <p className="status">Status: <strong>{lobby.status}</strong></p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Settings Section */}
      {isWaiting && (
        <section className="card lobby-settings">
          <h2>Lobby Settings</h2>
          {!editSettings ? (
            <div>
              <dl>
                <dt>Facts per Player:</dt>
                <dd>{lobby.facts_per_player}</dd>
                <dt>Facts to Win:</dt>
                <dd>{lobby.facts_to_win}</dd>
                <dt>Mode:</dt>
                <dd>{lobby.mode}</dd>
                <dt>Password:</dt>
                <dd>{lobby.password ? '••••••' : 'None'}</dd>
              </dl>
              <button className="btn-secondary" onClick={() => setEditSettings(true)}>
                ✏️ Edit Settings
              </button>
            </div>
          ) : (
            <div className="settings-form">
              <label>
                Facts per Player:
                <input
                  type="number"
                  min="1"
                  value={settingsForm.facts_per_player}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, facts_per_player: e.target.value })
                  }
                />
              </label>
              <label>
                Facts to Win:
                <input
                  type="number"
                  min="1"
                  max={settingsForm.facts_per_player}
                  value={settingsForm.facts_to_win}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, facts_to_win: e.target.value })
                  }
                />
              </label>
              <label>
                Mode:
                <select
                  value={settingsForm.mode}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, mode: e.target.value })
                  }
                >
                  <option>online</option>
                  <option>offline</option>
                </select>
              </label>
              <label>
                Password:
                <input
                  type="text"
                  value={settingsForm.password}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, password: e.target.value })
                  }
                  placeholder="Leave blank for no password"
                />
              </label>
              <div className="form-buttons">
                <button className="btn-primary" onClick={updateSettings}>
                  💾 Save
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setEditSettings(false);
                    setSettingsForm({
                      facts_per_player: lobby.facts_per_player,
                      facts_to_win: lobby.facts_to_win,
                      mode: lobby.mode,
                      password: lobby.password || ''
                    });
                  }}
                >
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Validation Status */}
      <section className="card validation">
        <h2>Game Validation</h2>
        <div className={`status-box ${validation?.canGenerate ? 'ready' : 'blocked'}`}>
          <p>{validation?.message}</p>
          <ul className="checklist">
            <li className={validation?.minPlayersReached ? 'ok' : 'fail'}>
              ✓ Players: {validation?.playerCount} ≥ 2
            </li>
            <li className={validation?.availableFacts >= validation?.minimumFacts ? 'ok' : 'fail'}>
              ✓ Facts: {validation?.availableFacts} ≥ {validation?.minimumFacts} needed
            </li>
          </ul>
        </div>

        <div className="action-buttons">
          {lobby.status === 'waiting' && (
            <button
              className="btn-primary"
              onClick={generateGame}
              disabled={!validation?.canGenerate || generating}
            >
              {generating ? '⏳ Generating...' : '🚀 Generate Game'}
            </button>
          )}
          {lobby.status === 'generated' && (
            <button
              className="btn-primary"
              onClick={startGame}
              disabled={generating}
            >
              {generating ? '⏳ Starting...' : '🎮 Start Game'}
            </button>
          )}
          {(lobby.status === 'generated' || lobby.status === 'started') && (
            <button className="btn-secondary" onClick={handlePrintPreview}>
              🖨️ Print Preview
            </button>
          )}
        </div>
      </section>

      {/* Participants & Facts Management */}
      {isWaiting && (
        <section className="card participants-management">
          <h2>Participants & Facts ({participants.length})</h2>
          <div className="participants-list">
            {participants.map((participant) => (
              <div key={participant.id} className="participant-card">
                <div
                  className="participant-header"
                  onClick={() => toggleParticipantExpanded(participant.user_id)}
                >
                  <span className="participant-name">
                    {participant.first_name || participant.username || `Player ${participant.user_id}`}
                  </span>
                  <span className="fact-count">
                    {participant.facts?.length || 0} facts
                  </span>
                  <button
                    className="btn-kick"
                    onClick={(e) => {
                      e.stopPropagation();
                      kickParticipant(participant.user_id);
                    }}
                  >
                    ❌ Kick
                  </button>
                  <span className={`expand-arrow ${expandedParticipants.has(participant.user_id) ? 'open' : ''}`}>
                    ▼
                  </span>
                </div>

                {expandedParticipants.has(participant.user_id) && (
                  <div className="participant-expanded">
                    {/* Facts List */}
                    <div className="facts-sublist">
                      <h4>Facts</h4>
                      {participant.facts && participant.facts.length > 0 ? (
                        <ul>
                          {participant.facts.map((fact) => (
                            <li key={fact.id}>
                              <span>{fact.content}</span>
                              {fact.added_by_host && <span className="host-badge">(Host)</span>}
                              <button
                                className="btn-delete-small"
                                onClick={() => deleteFact(fact.id)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty">No facts yet</p>
                      )}
                    </div>

                    {/* Add Fact Form */}
                    <div className="add-fact-inline">
                      <input
                        type="text"
                        placeholder="Add fact for this player..."
                        value={addFactForm[participant.user_id] || ''}
                        onChange={(e) =>
                          setAddFactForm({
                            ...addFactForm,
                            [participant.user_id]: e.target.value
                          })
                        }
                      />
                      <button
                        className="btn-add-small"
                        onClick={() => addFact(participant.user_id)}
                      >
                        ➕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
