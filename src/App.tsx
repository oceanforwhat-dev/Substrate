import { memo } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Canvas } from './components/Canvas';
import { Dashboard } from './components/Dashboard';
import { MemoOverlay } from './components/MemoOverlay';
import { usePasteBindingText } from './hooks/usePasteBindingText';
import { useQuickCopyKeyIntercept } from './hooks/useQuickCopyKeyIntercept';

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

function PasteBindingToast() {
  const toast = usePasteBindingText();
  if (!toast) {
    return null;
  }
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-md dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
      role="status"
    >
      {toast}
    </div>
  );
}

function QuickCopyKeyIntercept() {
  useQuickCopyKeyIntercept();
  return null;
}

export const App = memo(function App() {
  return (
    <>
      <QuickCopyKeyIntercept />
      <PasteBindingToast />
      <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/topic/:topicId" element={<CanvasRoute />} />
      <Route path="/overlay" element={<MemoOverlay />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
});
