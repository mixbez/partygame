export default function VictoryScreen({ score, total }) {
  const percentage = Math.round((score / total) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-8xl mb-4 animate-bounce">🎉</div>
        <h1 className="text-5xl font-bold text-white mb-2">You Won!</h1>
        <p className="text-2xl text-white/80 mb-6">
          You guessed {score}/{total} facts correctly
        </p>
        <div className="bg-white rounded-full w-32 h-32 flex items-center justify-center mx-auto mb-8">
          <div className="text-center">
            <p className="text-5xl font-bold text-orange-500">{percentage}%</p>
            <p className="text-sm text-gray-600">Accuracy</p>
          </div>
        </div>
        <p className="text-white/80 text-lg">
          Share your victory with friends! 🏆
        </p>
      </div>
    </div>
  );
}
