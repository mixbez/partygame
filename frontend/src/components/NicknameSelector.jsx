export default function NicknameSelector({
  participants,
  onSelect,
  disabled,
  isLoading,
}) {
  return (
    <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm">
      <p className="text-white mb-4 text-center font-semibold">
        Who wrote this fact?
      </p>
      <div className="grid grid-cols-1 gap-3">
        {participants.map((participant) => (
          <button
            key={participant.userId}
            onClick={() => onSelect(participant.nickname)}
            disabled={disabled || isLoading}
            className="bg-white hover:bg-yellow-200 disabled:bg-white/30 disabled:cursor-not-allowed text-gray-800 font-bold py-3 px-4 rounded-lg transition-all hover:shadow-lg transform hover:scale-105 disabled:transform-none"
          >
            {participant.nickname}
            {participant.username && (
              <span className="text-sm text-gray-500 ml-2">
                (@{participant.username})
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
