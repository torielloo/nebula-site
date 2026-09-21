import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});

// Fallback somente para funções serverless quando o HTML publicado ficou com
// um Base44-Functions-Version antigo. Entidades/auth continuam usando o cliente
// principal; este cliente evita 404 de rota após deploy parcial de função.
export const base44LatestFunctions = createClient({
  appId,
  token,
  serverUrl: '',
  appBaseUrl
});
