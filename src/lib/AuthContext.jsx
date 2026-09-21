import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  const [isDiscordLinked, setIsDiscordLinked] = useState(false);
  const [isLoadingDiscordLink, setIsLoadingDiscordLink] = useState(true);
  const [discordLinkError, setDiscordLinkError] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        const publicSettings = await base44.app.getPublicSettings();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        await checkUserAuth();
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setIsLoadingDiscordLink(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setIsLoadingDiscordLink(false);
    }
  };

  const checkUserAuth = useCallback(async () => {
    try {
      // Em atualizações de perfil/tema já autenticadas, não desmonta toda a
      // aplicação com o fallback de autenticação. Isso evita o Nitro/UI Studio
      // sumir e reaparecer enquanto apenas recarregamos os dados do usuário.
      if (!authChecked) setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setIsAuthenticated(true);
      setAuthError(null);
      setUser(currentUser);
      setIsDiscordLinked(Boolean(currentUser.profile?.discord_id));
      setDiscordLinkError(null);
      setIsLoadingDiscordLink(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setIsDiscordLinked(false);
      setIsLoadingDiscordLink(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  }, [authChecked]);

  const logout = (shouldRedirect = true) => {
    // O Nébula usa sua própria tela /login (Discord-only). Não usamos o
    // redirect de logout hospedado da Base44, pois ele leva o usuário para
    // "Bem-vindo ao Base44" em vez de voltar para o Nébula.
    setUser(null);
    setIsAuthenticated(false);
    setIsDiscordLinked(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });

    try { base44.auth.setToken(''); } catch {}
    try {
      ['base44_access_token', 'token', 'access_token', 'base44_token'].forEach((key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      });
      window.sessionStorage.removeItem('nebula_discord_flow');
      window.localStorage.removeItem('nebula_discord_flow');
    } catch {}

    if (shouldRedirect && typeof window !== 'undefined') {
      window.location.replace('/login?loggedOut=1');
    }
  };

  const navigateToLogin = () => {
    const current = window.location.pathname + window.location.search;
    window.location.assign(`/login?returnTo=${encodeURIComponent(current)}`);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      isDiscordLinked,
      isLoadingDiscordLink,
      discordLinkError
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
