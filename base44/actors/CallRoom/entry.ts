import { Actor } from 'base44:runtime/actors';

const MAX_USERS = 8;
const MAX_TICKET_USERS = 12;
const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);

// Sala de voz compartilhada: presença + canal de sinalização WebRTC.
// Uma instância por canal (VC-BR1, VC-BR2, ...) — todos no mesmo canal
// caem na mesma sala do servidor e se encontram.
export default class CallRoom extends Actor {
  // conn.id -> { seat, name, avatar, frame, micOn, deafened, camOn, sharing }
  users = new Map();
  authorized = new Map();
  nextSeat = 1;

  isTicketRoom() {
    return typeof this.instanceId === 'string' && this.instanceId.startsWith('TKT-');
  }

  ticketId() {
    return this.isTicketRoom() ? this.instanceId.slice(4) : '';
  }

  async authorizeTicketConnection(conn) {
    if (!this.isTicketRoom()) return { allowed: true, role: 'public' };
    const identity = conn.identity;
    if (identity?.type !== 'authenticated' || typeof identity.userId !== 'string') return null;
    const ticketId = this.ticketId();
    if (!ticketId) return null;

    const tickets = await this.client.asServiceRole.entities.Ticket.filter({ id: ticketId }, '-created_date', 1);
    const ticket = tickets?.[0];
    if (!ticket || ticket.deleted === true || (ticket.status || 'novo') === 'fechado') return null;
    if (ticket.requester_user_id === identity.userId) {
      return { allowed: true, userId: identity.userId, role: 'requester', ticket };
    }

    const rows = await this.client.asServiceRole.entities.User.filter({ id: identity.userId }, '-created_date', 1);
    const user = rows?.[0];
    if (!user || !STAFF_ROLES.has(user.role)) return null;
    return { allowed: true, userId: identity.userId, role: user.role, ticket };
  }

  async handleStart() {
    const saved = await this.storage.get('users');
    if (saved) this.users = new Map(saved);
    const live = new Set(this.getConnections().map((c) => c.id));
    let changed = false;
    for (const id of this.users.keys()) {
      if (!live.has(id)) {
        this.users.delete(id);
        changed = true;
      }
    }
    if (changed) await this.save();
    this.nextSeat = Math.max(0, ...[...this.users.values()].map((u) => u.seat)) + 1;
  }

  // Remove entradas de conexões que já não estão vivas — cura "fantasmas"
  // deixados por abas fechadas/desconectadas sem um handleClose limpo.
  async reconcile() {
    const live = new Set(this.getConnections().map((c) => c.id));
    let changed = false;
    for (const id of this.users.keys()) {
      if (!live.has(id)) {
        this.users.delete(id);
        changed = true;
      }
    }
    if (changed) {
      await this.save();
      this.broadcastPresence();
    }
  }

  async handleConnect(conn) {
    await this.reconcile();

    if (this.isTicketRoom()) {
      const auth = await this.authorizeTicketConnection(conn).catch(() => null);
      if (!auth) {
        conn.reject(4003, 'ticket call access denied');
        return;
      }
      this.authorized.set(conn.id, auth);
    }

    // Observadores (id "obs:"): recebem o roster ao vivo sem ocupar assento —
    // usados pelos cards de canal para mostrar quem está na call.
    if (typeof conn.id === 'string' && conn.id.startsWith('obs:')) {
      conn.send({ type: 'roster', users: this.roster() });
      return;
    }

    // Reconexão de participante: mantém o assento salvo.
    if (this.users.has(conn.id)) {
      conn.send({ type: 'you', seat: this.users.get(conn.id).seat });
      conn.send({ type: 'roster', users: this.roster() });
      this.broadcastPresence();
      return;
    }

    // Conexão nova ainda não identificada: recebe o roster, mas só ocupa
    // assento quando se identificar via "profile". Assim nenhuma conexão
    // que nunca envia perfil (fantasma) entra na contagem da sala.
    conn.send({ type: 'roster', users: this.roster() });
  }

  async handleMessage(conn, msg) {
    if (typeof msg !== 'object' || msg === null) return;

    if (msg.type === 'profile') {
      let auth = null;
      if (this.isTicketRoom()) {
        auth = this.authorized.get(conn.id) || await this.authorizeTicketConnection(conn).catch(() => null);
        if (!auth) {
          conn.reject(4003, 'ticket call access denied');
          return;
        }
        this.authorized.set(conn.id, auth);
        if (msg.ticket_id && String(msg.ticket_id) !== this.ticketId()) {
          conn.reject(4003, 'ticket call mismatch');
          return;
        }

        const duplicateIds = [...this.users.entries()]
          .filter(([id, u]) => id !== conn.id && u?.userId === auth.userId)
          .map(([id]) => id);
        if (duplicateIds.length) {
          for (const id of duplicateIds) {
            this.users.delete(id);
            this.authorized.delete(id);
          }
          await this.save();
        }
      }

      if (!this.users.has(conn.id)) {
        const maxUsers = this.isTicketRoom() ? MAX_TICKET_USERS : MAX_USERS;
        if (this.users.size >= maxUsers) return; // sala cheia: fica sem assento
        this.users.set(conn.id, {
          seat: this.nextSeat++,
          name: 'Participante',
          avatar: null,
          frame: null,
          banner: null,
          micOn: false,
          deafened: false,
          camOn: false,
          sharing: false,
          userId: null,
        });
        await this.save();
      }
      const me = this.users.get(conn.id);
      me.name = String(msg.name ?? '').slice(0, 40) || 'Participante';
      me.avatar = typeof msg.avatar === 'string' ? msg.avatar.slice(0, 600) : null;
      me.frame = typeof msg.frame === 'string' ? msg.frame.slice(0, 30) : null;
      me.banner = typeof msg.banner === 'string' ? msg.banner.slice(0, 600) : null;
      const identityUserId = conn.identity?.type === 'authenticated' ? conn.identity.userId : null;
      me.userId = this.isTicketRoom() && auth?.userId
        ? auth.userId
        : (typeof identityUserId === 'string'
          ? identityUserId
          : (typeof msg.user_id === 'string' ? msg.user_id.slice(0, 120) : null));
      me.ticketRole = this.isTicketRoom() ? String(auth?.role || '') : '';
      await this.save();
      conn.send({ type: 'you', seat: me.seat });
      conn.send({ type: 'roster', users: this.roster() });
      this.broadcastPresence();
      return;
    }

    const me = this.users.get(conn.id);
    if (!me) return;

    if (msg.type === 'state') {
      me.micOn = Boolean(msg.micOn);
      me.deafened = Boolean(msg.deafened);
      me.camOn = Boolean(msg.camOn);
      me.sharing = Boolean(msg.sharing);
      this.broadcastPresence();
    } else if (msg.type === 'signal') {
      const to = Number(msg.to);
      const target = [...this.users.entries()].find(([, u]) => u.seat === to);
      if (!target) return;
      const data = this.validateSignal(msg.data);
      if (!data) return;
      for (const c of this.getConnections()) {
        if (c.id === target[0]) {
          c.send({ type: 'signal', from: me.seat, data });
          break;
        }
      }
    }
  }

  async handleClose(conn) {
    this.authorized.delete(conn.id);
    if (this.users.delete(conn.id)) {
      await this.save();
      this.broadcastPresence();
    }
  }

  validateSignal(data) {
    if (typeof data !== 'object' || data === null) return null;
    if (data.kind === 'offer' || data.kind === 'answer') {
      const sdp = data.sdp;
      if (typeof sdp !== 'object' || sdp === null || typeof sdp.sdp !== 'string' || sdp.sdp.length > 65536) return null;
      return { kind: data.kind, sdp: { type: String(sdp.type), sdp: sdp.sdp } };
    }
    if (data.kind === 'ice') {
      const c = data.candidate;
      if (typeof c !== 'object' || c === null || typeof c.candidate !== 'string' || c.candidate.length > 2048) return null;
      return { kind: 'ice', candidate: { candidate: c.candidate, sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null, sdpMLineIndex: Number(c.sdpMLineIndex) || 0, usernameFragment: typeof c.usernameFragment === 'string' ? c.usernameFragment : null } };
    }
    if (data.kind === 'renegotiate') {
      return { kind: 'renegotiate' };
    }
    return null;
  }

  roster() {
    return [...this.users.values()].map((u) => ({
      seat: u.seat,
      name: u.name,
      avatar: u.avatar,
      frame: u.frame,
      banner: u.banner,
      micOn: u.micOn,
      deafened: Boolean(u.deafened),
      camOn: u.camOn,
      sharing: u.sharing,
      user_id: u.userId || null,
      ticket_role: u.ticketRole || '',
    }));
  }

  broadcastPresence() {
    this.broadcast({ type: 'presence', users: this.roster() });
  }

  save() {
    return this.storage.put('users', [...this.users.entries()]);
  }
}