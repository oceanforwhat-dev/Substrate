import { memo } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Canvas } from './components/Canvas';
import { Dashboard } from './components/Dashboard';

const CanvasRoute = memo(function CanvasRoute() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();

  if (!topicId) {
    return <Navigate to="/" replace />;
  }

  return (
    <Canvas
      topicId={topicId}
      onBack={() => navigate('/')}
      onTopicImported={(id) => navigate(`/topic/${id}`)}
    />
  );
});

export const App = memo(function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/topic/:topicId" element={<CanvasRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
});
