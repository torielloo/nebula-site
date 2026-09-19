// Lógica compartilhada do fluxo OAuth2 do Discord — usada por
// discordLink (conta logada) e discordAuth (login/cadastro).
export function buildDiscordAuthorizeUrl({ clientId, redirectUri, scopes, state }) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeDiscordCode({ clientId, clientSecret, code, redirectUri }) {
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error('Falha ao autenticar com o Discord');
  const token = await tokenRes.json();

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error('Falha ao obter perfil do Discord');
  const me = await meRes.json();

  return {
    discord_id: me.id,
    discord_username: me.global_name || me.username,
    discord_handle: me.username,
    discord_avatar_url: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '',
    email: typeof me.email === 'string' ? me.email : '',
    email_verified: me.verified === true,
  };
}
