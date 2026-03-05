export default function FactCard({ fact, feedback }) {
  return (
    <div className="mb-6">
      <div className="bg-white rounded-lg shadow-xl p-8 mb-4">
        <p className="text-gray-800 text-center text-xl leading-relaxed">
          "{fact.content}"
        </p>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-lg p-4 text-center font-semibold ${
            feedback.type === 'success'
              ? 'bg-green-500/20 text-green-100'
              : feedback.type === 'error'
                ? 'bg-red-500/20 text-red-100'
                : 'bg-blue-500/20 text-blue-100'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
