import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { CallProvider } from '@/lib/CallContext';
// Add page imports here
import { Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import { LangProvider } from '@/lib/i18n';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import DiscordCallback from '@/pages/DiscordCallback';
import ConnectDiscord from '@/pages/ConnectDiscord';
import Layout from '@/components/Layout';
import OwnerGate from '@/components/OwnerGate';

const Home = lazy(() => import('@/pages/Home'));
const Mensagens = lazy(() => import('@/pages/Mensagens'));
const Nitro = lazy(() => import('@/pages/Nitro'));
const NebulaMixer = lazy(() => import('@/pages/NebulaMixer'));
const Downloads = lazy(() => import('@/pages/Downloads'));
const Perfil = lazy(() => import('@/pages/Perfil'));
const Tickets = lazy(() => import('@/pages/Tickets'));
const Painel = lazy(() => import('@/pages/Painel'));
const NebulaticosIA = lazy(() => import('@/pages/NebulaticosIA'));
const Calls = lazy(() => import('@/pages/Calls'));
const Solucoes = lazy(() => import('@/pages/Solucoes'));
const CoreOS = lazy(() => import('@/pages/CoreOS'));
const UserProfile = lazy(() => import('@/pages/UserProfile'));

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      <Route path="/reset-password" element={<Navigate to="/login" replace />} />
      <Route path="/connect-discord" element={<ConnectDiscord />} />
      <Route path="/discord-callback" element={<DiscordCallback />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/comunidade" element={<Navigate to="/calls" replace />} />
          <Route path="/mensagens" element={<Mensagens />} />
          <Route path="/nitro" element={<Nitro />} />
          <Route path="/mixer" element={<NebulaMixer />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/user/:id" element={<UserProfile />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/suporte-ia" element={<NebulaticosIA />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/solucoes" element={<Solucoes />} />
          <Route path="/core-os" element={<OwnerGate><CoreOS /></OwnerGate>} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <LangProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ScrollToTop />
              <CallProvider>
                <AuthenticatedApp />
              </CallProvider>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  )
}

export default App
