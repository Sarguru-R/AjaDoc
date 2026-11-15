import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler, tokenStore, type User } from './api';
import { Brand } from './components/Brand';
import { Loader } from './components/Logo';
import { DocumentList } from './pages/DocumentList';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext)!;

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => Boolean(tokenStore.get()));
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setNotice('Your session has ended. Please sign in again.');
    });
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <Loader label="Opening AjaDoc" />;
  if (!user) {
    const signIn = (u: User) => {
      setNotice('');
      setUser(u);
    };
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage onSignup={signIn} />} />
        <Route path="*" element={<LoginPage notice={notice} onLogin={signIn} />} />
      </Routes>
    );
  }

  const signOut = () => {
    api.logout();
    setUser(null);
    navigate('/');
  };

  return (
    <UserContext.Provider value={user}>
      <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand-link" aria-label="AjaDoc home">
          <Brand />
        </Link>
        <div className="topbar-user">
          <span className="avatar" title={user.email}>{user.name[0]}</span>
          <span className="hide-sm">{user.name}</span>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <div className="app-body">
        <Routes>
          <Route path="/" element={<DocumentList />} />
          <Route path="/d/:id" element={<EditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      </div>
    </UserContext.Provider>
  );
}
