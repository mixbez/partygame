export default function ErrorScreen({ error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center">
      <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-red-600 mb-2">Game Error</h1>
        <p className="text-gray-700 mb-4">{error}</p>
        <p className="text-sm text-gray-500">
          Make sure you have the correct game link from your host.
        </p>
      </div>
    </div>
  );
}
