import React, { useState } from 'react';

export default function NicknameSelector({ participants, onSelect, disabled }) {
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState(null);

  const nicknames = participants.map(p => p.nickname);

  function handleChange(e) {
    const val = e.target.value;
    setInput(val);

    if (!val.trim()) {
      setSuggestion(null);
      return;
    }

    const lower = val.toLowerCase();
    const match = nicknames.find(n => n.toLowerCase().startsWith(lower));
    setSuggestion(match || null);
  }

  function submit(nickname) {
    const trimmed = (nickname || input).trim();
    if (!trimmed) return;
    const exact = nicknames.find(n => n.toLowerCase() === trimmed.toLowerCase());
    if (!exact) return;
    setInput('');
    setSuggestion(null);
    onSelect(exact);
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setInput(suggestion);
      setSuggestion(null);
    }
    if (e.key === 'Enter') {
      submit();
    }
  }

  return (
    <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm">
      <p className="text-white mb-4 text-center font-semibold">Who wrote this fact?</p>

      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type a nickname..."
          className="w-full bg-white text-gray-800 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:opacity-50"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {suggestion && suggestion.toLowerCase() !== input.toLowerCase() && (
          <div
            onClick={() => submit(suggestion)}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg px-4 py-3 text-gray-500 cursor-pointer hover:bg-yellow-50 z-10 shadow-lg"
          >
            {suggestion}
            <span className="text-xs ml-2 text-gray-400">Tab to complete</span>
          </div>
        )}
      </div>

      <button
        onClick={() => submit()}
        disabled={disabled || !input.trim()}
        className="w-full mt-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-white/20 disabled:cursor-not-allowed text-gray-900 font-bold py-3 px-4 rounded-lg transition-all"
      >
        Submit Guess
      </button>
    </div>
  );
}
