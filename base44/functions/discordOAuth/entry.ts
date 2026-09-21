import { secrets } from 'base44:runtime';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildDiscordAuthorizeUrl, exchangeDiscordCode } from '../../shared/discordOauth.ts';
import { guardRequest, securityResponse } from '../../shared/security.ts';

// Fluxo OAuth2 do Discord para telas públicas (login/cadastro). Cada conta do
// Discord fica vinculada a UMA conta Nébula: a credencial fica guardada no
// servidor (entidade DiscordAccount, visível só para o backend) para que os
// próximos logins entrem direto na mesma conta, sem nova senha e sem código.
const ALLOWED_REDIRECT_HOSTS = new Set([
  'nebula-os-core-pingu.base44.app',
  'nebula-os-site-1.base44.app',
  'nebula-central.base44.app',
  'preview--nebula-os-core-pingu.base44.app',
  'preview--nebula-os-site-1.base44.app',
  'preview-sandbox--6aa87196309472108abb65fb.base44.app',
  'nebula-os-core-pingu.bubbly-alder-3685.chatgpt.site',
]);
const REDIRECT_PATH = '/discord-callback';

function validRedirect(value, requestOrigin = '') {
  if (typeof value !== 'string' || value.length > 350) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const knownHost = ALLOWED_REDIRECT_HOSTS.has(host);

    // Para domínio próprio, só aceita exatamente a mesma origem que iniciou
    // a requisição. O Discord ainda exige que esse redirect URI esteja
    // cadastrado no aplicativo OAuth dele.
    const sameRequestOrigin =
      requestOrigin &&
      url.origin === requestOrigin &&
      /^https:\/\//i.test(requestOrigin);

    return url.protocol === 'https:'
      && (knownHost || sameRequestOrigin)
      && url.pathname === REDIRECT_PATH
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

// --- Criptografia da credencial em repouso (AES-GCM) ---
// A senha das contas vinculadas é guardada CRIPTOGRAFADA e nunca sai do
// servidor: o auto-login é executado aqui e só o token de sessão é retornado.
function b64encode(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deriveSealKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('nebula-discordaccount-v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function sealPassword(secret, password) {
  const key = await deriveSealKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password));
  return `v1:${b64encode(iv)}.${b64encode(ct)}`;
}
async function openPassword(secret, stored) {
  if (typeof stored !== 'string' || !stored) return null;
  if (!stored.startsWith('v1:')) return stored; // registro legado em texto plano: migrado no próximo login
  const [ivB, ctB] = stored.slice(3).split('.');
  if (!ivB || !ctB) return null;
  const key = await deriveSealKey(secret);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(ivB) }, key, b64decode(ctB));
  return new TextDecoder().decode(pt);
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 18; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// --- Token efêmero de vinculação (assinado com HMAC, 15 min) ---
// Emitido no "exchange" só depois de o Discord confirmar a identidade; a
// action "link" deriva o discord_id dele — nunca confia no valor do cliente.
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeLinkToken(secret, discordId) {
  const exp = Date.now() + LINK_TOKEN_TTL_MS;
  return `${discordId}.${exp}.${await hmacHex(secret, `${discordId}.${exp}`)}`;
}

async function verifyLinkToken(secret, token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [discordId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!discordId || !/^\d+$/.test(discordId) || !Number.isInteger(exp) || Date.now() > exp) return null;
  const expected = await hmacHex(secret, `${discordId}.${expStr}`);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? discordId : null;
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Método inválido' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const securityClient = createClientFromRequest(req);
    const securityUser = await securityClient.auth.me().catch(() => null);
    const requestOrigin = req.headers.get('origin') || '';
    let redirectOrigin = '';
    try {
      const candidate = new URL(String(body?.redirect_uri || ''));
      if (candidate.protocol === 'https:' && candidate.pathname === REDIRECT_PATH && candidate.origin === requestOrigin) {
        redirectOrigin = candidate.origin;
      }
    } catch {}
    await guardRequest(req, securityClient, {
      route: 'discordAuth',
      user: securityUser,
      body,
      strict: true,
      limit: 12,
      windowMs: 60_000,
      maxBodyBytes: 8_000,
      extraTrustedOrigins: redirectOrigin ? [redirectOrigin] : [],
    });
    const action = body?.action;

    const clientId = secrets.get('DISCORD_CLIENT_ID');
    const clientSecret = secrets.get('DISCORD_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Credenciais do Discord não configuradas' }, { status: 500 });
    }
    // Actors do Base44 usam tokens efêmeros emitidos pelo próprio SDK.
    // Nunca reutilize token de Actor como chave criptográfica persistente.
    const sealSecret = clientSecret;

    if (action === 'start') {
      const redirectUri = body.redirect_uri;
      const state = body.state;
      if (!validRedirect(redirectUri, requestOrigin) || typeof state !== 'string' || !/^[a-zA-Z0-9_-]{20,128}$/.test(state)) {
        return Response.json({ error: 'Autorização inválida' }, { status: 400 });
      }
      const authorizeUrl = buildDiscordAuthorizeUrl({
        clientId,
        redirectUri,
        scopes: ['identify', 'email'],
        state,
      });
      return Response.json({ authorize_url: authorizeUrl });
    }

    if (action === 'exchange') {
      const code = body.code;
      const redirectUri = body.redirect_uri;
      if (!validRedirect(redirectUri, requestOrigin) || typeof code !== 'string' || !/^[a-zA-Z0-9_-]{10,300}$/.test(code)) {
        return Response.json({ error: 'Autorização inválida' }, { status: 400 });
      }
      const profile = await exchangeDiscordCode({ clientId, clientSecret, code, redirectUri });
      // Prova criptográfica da identidade Discord, exigida depois no "link"
      const linkToken = await makeLinkToken(clientSecret, profile.discord_id);

      const base44 = createClientFromRequest(req);
      const linked = await base44.asServiceRole.entities.DiscordAccount.filter({ discord_id: profile.discord_id });
      if (linked.length > 0) {
        // Conta já vinculada. Primeiro distingue uma conta NOVA cuja verificação
        // por e-mail foi interrompida de uma conta antiga já verificada.
        const email = linked[0].email;
        let linkedUser = null;
        try {
          const users = await base44.asServiceRole.entities.User.filter({ email });
          linkedUser = Array.isArray(users) ? users[0] || null : null;
        } catch {}

        // Se o usuário fechou a tela do OTP antes de concluir, retoma exatamente
        // essa etapa. Nunca pede uma senha que ele não chegou a criar.
        if (linkedUser && linkedUser.is_verified === false) {
          await base44.auth.resendOtp(email).catch(() => null);
          return Response.json({
            status: 'register',
            resumed_verification: true,
            link_token: linkToken,
            discord_id: profile.discord_id,
            discord_username: profile.discord_username,
            discord_handle: profile.discord_handle,
            discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '',
            email,
          });
        }

        // Para uma conta verificada, o LOGIN acontece aqui no servidor — a
        // credencial interna (criptografada em repouso) nunca sai na resposta.
        try {
          const storedPassword = await openPassword(sealSecret, linked[0].password);
          if (!storedPassword) throw new Error('credencial ausente');
          const r = await base44.auth.loginViaEmailPassword(email, storedPassword);
          const token =
            r && (r.access_token || (r.data && r.data.access_token) || (r.token && r.token.access_token) ||
              (r.data && r.data.token && r.data.token.access_token));
          if (!token) throw new Error('token ausente');
          const sealedPassword = String(linked[0].password || '').startsWith('v1:')
            ? linked[0].password
            : await sealPassword(sealSecret, storedPassword);
          await base44.asServiceRole.entities.DiscordAccount.update(linked[0].id, {
            password: sealedPassword,
            user_id: r?.user?.id || linkedUser?.id || linked[0].user_id || '',
            email,
            username: profile.discord_username,
            display_name: profile.discord_username,
            handle: profile.discord_handle,
            avatar_url: profile.discord_avatar_url,
            banner_url: profile.discord_banner_url || '',
            accent: profile.discord_accent || '',
          });
          return Response.json({
            status: 'login',
            link_token: linkToken,
            discord_id: profile.discord_id,
            discord_username: profile.discord_username,
            discord_handle: profile.discord_handle,
            discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '',
            email,
            access_token: token,
          });
        } catch {
          // Só contas já verificadas chegam aqui. Se a credencial interna foi
          // alterada/invalidada, pede a senha atual uma única vez para relinkar.
          return Response.json({ status: 'exists', link_token: linkToken, discord_id: profile.discord_id, discord_username: profile.discord_username, discord_handle: profile.discord_handle, discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '', email });
        }
      }

      if (profile.email) {
        let userExists = false;
        try {
          const users = await base44.asServiceRole.entities.User.filter({ email: profile.email });
          userExists = Array.isArray(users) && users.length > 0;
        } catch {}
        if (userExists) {
          // Já existe conta Nébula com este email: pede a senha uma única vez
          // para vincular o Discord; depois o login é sempre direto.
          return Response.json({ status: 'exists', link_token: linkToken, discord_id: profile.discord_id, discord_username: profile.discord_username, discord_handle: profile.discord_handle, discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '', email: profile.email });
        }
        const password = generatePassword();
        // Cadastro executado no servidor; a senha gerada fica CRIPTOGRAFADA e
        // nunca é devolvida — o usuário confirma o email com o código OTP.
        try {
          await base44.auth.register({ email: profile.email, password });
        } catch {
          return Response.json({ status: 'exists', link_token: linkToken, discord_id: profile.discord_id, discord_username: profile.discord_username, discord_handle: profile.discord_handle, discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '', email: profile.email });
        }
        await base44.asServiceRole.entities.DiscordAccount.create({
          discord_id: profile.discord_id,
          email: profile.email,
          password: await sealPassword(sealSecret, password),
          username: profile.discord_username,
          display_name: profile.discord_username,
          handle: profile.discord_handle,
          avatar_url: profile.discord_avatar_url,
          banner_url: profile.discord_banner_url || '',
          accent: profile.discord_accent || '',
        });
        return Response.json({ status: 'register', link_token: linkToken, discord_id: profile.discord_id, discord_username: profile.discord_username, discord_handle: profile.discord_handle, discord_avatar_url: profile.discord_avatar_url,
            discord_banner_url: profile.discord_banner_url || '',
            discord_accent: profile.discord_accent || '', email: profile.email });
      }

      return Response.json({ status: 'no_email', link_token: linkToken, discord_id: profile.discord_id, discord_username: profile.discord_username, discord_handle: profile.discord_handle, discord_avatar_url: profile.discord_avatar_url, discord_banner_url: profile.discord_banner_url || '', discord_accent: profile.discord_accent || '' });
    }

    if (action === 'link') {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      if (!user) {
        return Response.json({ error: 'Não autenticado' }, { status: 401 });
      }
      // Segurança: o discord_id NUNCA vem do cliente — é derivado do token
      // assinado emitido no "exchange", provando que o chamador concluiu o
      // OAuth do Discord com essa conta. Impede sequestro de vinculação alheia.
      const discordId = await verifyLinkToken(clientSecret, body.link_token);
      if (!discordId) {
        return Response.json({ error: 'Sessão de vinculação expirada. Entre com o Discord novamente.' }, { status: 400 });
      }
      const password = body.password;
      if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
        return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
      }
      const record = {
        discord_id: discordId,
        user_id: user.id,
        email: user.email,
        // Credencial sempre criptografada em repouso
        password: await sealPassword(sealSecret, password),
        username: typeof body.discord_username === 'string' ? body.discord_username.slice(0, 80) : '',
        display_name: typeof body.discord_username === 'string' ? body.discord_username.slice(0, 80) : '',
        handle: typeof body.discord_handle === 'string' ? body.discord_handle.replace(/^@+/, '').slice(0, 80) : '',
        avatar_url: typeof body.discord_avatar_url === 'string' ? body.discord_avatar_url.slice(0, 500) : '',
        banner_url: typeof body.discord_banner_url === 'string' ? body.discord_banner_url.slice(0, 500) : '',
        accent: typeof body.discord_accent === 'string' && /^#[0-9a-f]{6}$/i.test(body.discord_accent) ? body.discord_accent.toLowerCase() : '',
      };
      const existing = await base44.asServiceRole.entities.DiscordAccount.filter({ discord_id: discordId });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.DiscordAccount.update(existing[0].id, record);
      } else {
        await base44.asServiceRole.entities.DiscordAccount.create(record);
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const blocked = securityResponse(error); if (blocked) return blocked;
    console.error('[discordAuth] internal failure', error instanceof Error ? error.name : 'unknown_error');
    return Response.json({ error: 'Falha interna na autenticação do Discord.' }, { status: 500 });
  }
}