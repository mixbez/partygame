export default function ScoreBoard({ participants }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-6">
      {participants.slice(0, 4).map((participant) => (
        <div
          key={participant.userId}
          className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-white text-center"
        >
          <p className="text-sm truncate">{participant.nickname}</p>
          <p className="text-xs text-white/70">Points: 0</p>
        </div>
      ))}
      {participants.length > 4 && (
        <div className="col-span-2 text-center text-white/70 text-xs">
          +{participants.length - 4} more players
        </div>
      )}
    </div>
  );
}
