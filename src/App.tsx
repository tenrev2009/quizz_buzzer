import { AuthProvider, useAuth } from './context/AuthContext';
import AuthScreen from './components/AuthScreen';
import AdminDashboard from './components/AdminDashboard';
import PlayerSessionView from './components/PlayerSessionView';

function Shell() {
  const { loading, userId, profile, activeSessionId, setActiveSessionId, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Chargement...</div>
      </div>
    );
  }

  if (!userId || !profile) return <AuthScreen />;
  if (profile.role === 'admin') return <AdminDashboard />;

  if (activeSessionId) {
    return (
      <PlayerSessionView
        sessionId={activeSessionId}
        onLeave={async () => {
          setActiveSessionId(null);
          await signOut();
        }}
      />
    );
  }
  return <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
