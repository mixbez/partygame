export default function VictoryScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-8xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-5xl font-bold text-white mb-4">Игра окончена!</h1>
        <p className="text-2xl text-white/90">Ты молодец</p>
      </div>
    </div>
  );
}
