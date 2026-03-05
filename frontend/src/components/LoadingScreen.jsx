export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading game...</p>
        <p className="text-white/80 mt-2">Preparing your facts to guess</p>
      </div>
    </div>
  );
}
