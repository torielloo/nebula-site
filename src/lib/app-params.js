import { getAccessToken } from '@base44/sdk';

const isNode = typeof window === 'undefined';

const isClearAccessTokenRequested = () =>
	!isNode && new URLSearchParams(window.location.search).get("clear_access_token") === 'true';

const clearStoredAccessToken = () => {
	window.localStorage.removeItem('base44_access_token');
	window.localStorage.removeItem('token');
}

const getAppParams = () => {
	if (isClearAccessTokenRequested()) {
		clearStoredAccessToken();
	}
	return {
		appId: import.meta.env.VITE_BASE44_APP_ID,
		token: getAccessToken(),
		functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
		// Mantém qualquer fluxo de autenticação na própria origem do Nébula.
		// Isso impede o SDK de abrir a tela genérica "Bem-vindo ao Base44".
		appBaseUrl: !isNode && window.location?.origin
			? window.location.origin
			: (import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://preview--nebula-os-site-1.base44.app'),
	}
}


export const appParams = {
	...getAppParams()
}
