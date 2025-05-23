import PGMMapLoader from './components/PGMMapLoader';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PGMMapLoader sourceType="file" content={{ data: "/testingmarkers.pgm" }} />
    </div>
  );
}

export default App
