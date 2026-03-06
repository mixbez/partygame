import React, { useState, useRef } from 'react';
import CryptoJS from 'crypto-js';
import VictoryScreen from './VictoryScreen';

const printStyles = `
  @media print {
    body * { visibility: hidden; }
    #print-layout, #print-layout * { visibility: visible; }
    #print-layout {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
    }
  }
`;

function FactRow({ index, fact, gameSecret, lobbyId, playerId, token, onCorrect }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const inputRef = useRef(null);

  async function validate() {
    const guess = input.trim();
    if (!guess || status === 'correct') return;

    let isCorrect = false;
    if (gameSecret && fact.answerHash) {
      const computed = CryptoJS.SHA256(`${fact.id}${guess}${gameSecret}`).toString();
      isCorrect = computed === fact.answerHash;
    } else {
      try {
        const res = await fetch(
          `/api/partygame/game/${lobbyId}/${playerId}/${token}/validate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ factId: fact.id, guessedNickname: guess }),
          }
        );
        isCorrect = (await res.json()).isCorrect;
      } catch { return; }
    }

    if (isCorrect) {
      setStatus('correct');
      onCorrect();
    } else {
      setStatus('wrong');
      setTimeout(() => { setStatus('idle'); inputRef.current?.focus(); }, 800);
    }
  }

  const isCorrect = status === 'correct';
  const isWrong = status === 'wrong';

  return (
    <div className={`rounded-xl p-4 transition-all duration-300 ${
      isCorrect ? 'bg-green-500/20 border border-green-400/50' :
      isWrong   ? 'bg-red-500/20 border border-red-400/50' :
                  'bg-white/10 border border-white/10'
    }`}>
      <div className="flex gap-3 items-start">
        <span className={`text-sm font-bold mt-1 w-6 shrink-0 ${isCorrect ? 'text-green-300' : 'text-white/40'}`}>
          {isCorrect ? '✓' : `${index + 1}.`}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-relaxed mb-3 ${isCorrect ? 'text-white/60' : 'text-white'}`}>
            "{fact.content}"
          </p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && validate()}
              disabled={isCorrect}
              placeholder="Nickname..."
              className={`flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all ${
                isCorrect ? 'bg-green-500/30 text-green-200 border border-green-400/60 cursor-default' :
                isWrong   ? 'bg-red-500/20 text-white border border-red-400/60 ring-2 ring-red-400/50' :
                            'bg-white/90 text-gray-800 border border-transparent focus:ring-yellow-400'
              }`}
            />
            {!isCorrect && (
              <button
                onClick={validate}
                disabled={!input.trim()}
                className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-white/20 disabled:cursor-not-allowed text-gray-900 font-bold text-sm rounded-lg transition-all shrink-0"
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintLayout({ facts }) {
  return (
    <div id="print-layout" style={{ display: 'none', fontFamily: 'Georgia, serif', padding: '10mm 12mm' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-layout, #print-layout * { visibility: visible; }
          #print-layout {
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            padding: 10mm 12mm;
            box-sizing: border-box;
          }
          @page { margin: 0; size: A4 portrait; }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: '5mm', borderBottom: '1.5px solid #000', paddingBottom: '3mm' }}>
        <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>Угадай кто</h1>
        <p style={{ fontSize: '9pt', margin: '1.5mm 0 0', color: '#555' }}>
          Прочитай каждый факт и впиши, кто его написал
        </p>
      </div>

      {facts.map((fact, i) => (
        <div key={fact.id} style={{ marginBottom: '3.5mm', display: 'flex', gap: '3mm', alignItems: 'baseline' }}>
          <span style={{ fontSize: '9pt', fontWeight: 'bold', minWidth: '6mm', flexShrink: 0 }}>
            {i + 1}.
          </span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '9.5pt', lineHeight: 1.4 }}>«{fact.content}»</span>
            <span style={{
              display: 'inline-block',
              borderBottom: '1px solid #000',
              width: '50mm',
              marginLeft: '3mm',
              verticalAlign: 'bottom',
            }} />
          </div>
        </div>
      ))}

      <div style={{ marginTop: '5mm', borderTop: '1px solid #ddd', paddingTop: '2mm', fontSize: '7pt', color: '#aaa', textAlign: 'center' }}>
        party game
      </div>
    </div>
  );
}

export default function GameScreen({ state, onChange }) {
  const [correctCount, setCorrectCount] = useState(state.correctGuesses || 0);
  const [won, setWon] = useState(false);
  const total = state.facts.length;
  const toWin = state.factsToWin;

  function handleCorrect() {
    const next = correctCount + 1;
    setCorrectCount(next);
    onChange({ ...state, correctGuesses: next });
    if (next >= toWin) setWon(true);
  }

  function handlePrint() {
    document.getElementById('print-layout').style.display = 'block';
    window.print();
    document.getElementById('print-layout').style.display = 'none';
  }

  if (won) return <VictoryScreen />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <PrintLayout facts={state.facts} />

      <div className="max-w-2xl mx-auto pb-8">
        <div className="flex items-center justify-between mb-5 mt-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Party Game</h1>
            <p className="text-white/60 text-xs">Who wrote each fact?</p>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-2 rounded-lg transition-all"
          >
            <span>🖨</span> Распечатать
          </button>
        </div>

        {/* Progress */}
        <div className="bg-white/10 rounded-xl p-3 mb-5 flex items-center gap-4">
          <div className="flex-1 bg-white/20 rounded-full h-2">
            <div
              className="bg-green-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((correctCount / toWin) * 100, 100)}%` }}
            />
          </div>
          <span className="text-white text-sm font-semibold shrink-0">
            {correctCount} / {toWin}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {state.facts.map((fact, i) => (
            <FactRow
              key={fact.id}
              index={i}
              fact={fact}
              gameSecret={state.gameSecret}
              lobbyId={state.lobbyId}
              playerId={state.playerId}
              token={state.token}
              onCorrect={handleCorrect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
