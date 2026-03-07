import React, { useState, useEffect } from 'react';
import '../styles/PrintPreview.css';

export default function PrintPreview({ lobbyId, hostToken }) {
  const [printData, setPrintData] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPrintData();
  }, [lobbyId, hostToken]);

  async function loadPrintData() {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/partygame/host/lobbies/${lobbyId}/print`,
        {
          headers: {
            'Authorization': `Bearer ${hostToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load print data: ${response.statusText}`);
      }

      const data = await response.json();
      setPrintData(data.printData);
      setLobby(data.lobby);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="print-preview loading">Loading print preview...</div>;
  }

  if (error) {
    return <div className="print-preview error">❌ {error}</div>;
  }

  if (!printData || !lobby) {
    return <div className="print-preview error">❌ No data available</div>;
  }

  return (
    <div className="print-preview">
      <div className="print-header">
        <h1>Game #{lobbyId} - Print Questionnaires</h1>
        <div className="print-controls">
          <button onClick={() => window.print()} className="btn-print">
            🖨️ Print or Save as PDF
          </button>
          <button onClick={() => window.history.back()} className="btn-back">
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="print-container">
        {printData.map((player, idx) => (
          <div key={idx} className="page">
            <div className="questionnaire">
              <div className="game-header">
                <h2>Party Game #{lobbyId}</h2>
                <p className="player-name">{player.displayName}</p>
                <p className="player-nickname">Nickname: <strong>{player.nickname}</strong></p>
              </div>

              <div className="instructions">
                <p>🎮 <strong>Instructions:</strong></p>
                <ol>
                  <li>Each fact below belongs to one of these players:</li>
                  <ul className="nickname-list">
                    {player.allNicknames.map((nick, i) => (
                      <li key={i}>{nick}</li>
                    ))}
                  </ul>
                  <li>Write the player's nickname next to each fact</li>
                  <li>You cannot guess your own nickname</li>
                  <li>Each correct guess earns you points!</li>
                </ol>
              </div>

              <div className="facts-section">
                <h3>Facts to Guess:</h3>
                <div className="facts-grid">
                  {player.facts.map((fact, factIdx) => (
                    <div key={factIdx} className="fact-number">
                      <div className="fact-question">
                        <span className="number">{factIdx + 1}.</span>
                        <span className="content">{fact.content}</span>
                      </div>
                      <div className="answer-space">
                        <span className="answer-label">Answer:</span>
                        <div className="answer-line"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="scoring-info">
                <h4>Scoring:</h4>
                <p>Correct guesses: _____ ÷ {player.facts.length} = {Math.ceil(100 / player.facts.length)} points each</p>
              </div>

              <div className="page-break-hint">
                {idx < printData.length - 1 && <p>— Page break —</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
