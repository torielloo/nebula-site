import { Actor } from 'base44:runtime/actors';

const MAX_USERS = 12;
const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);

export default class TicketCallRoom extends Actor {
  users = new Map();
  authorized = new Map();
  nextSeat = 1;
  ticketId = '';

  async handleStart() {
    const savedUsers = await this.storage.get('users');
    const savedTicket = await this.storage.get('ticket_id');
    if (savedUsers) this.users = new Map(savedUsers);
    if (typeof savedTicket === 'string') this.ticketId = savedTicket;

    const connections = this.getConnections();
    const live = new Set(connections.map((c) => c.id));
    if (this.ticketId) {
      for (const conn of connections) {
        const auth = await this.authorize(conn, this.ticketId).catch(() => null);
        if (auth) this.authorized.set(conn.id, auth);
      }
    }
    let changed = false;
    for (const id of this.users.keys()) {
      if (!live.has(id)) {
        this.users.delete(id);
        changed = true;
      }
    }
    if (changed) await this.saveUsers();
    this.nextSeat = Math.max(0, ...[...this.users.values()].map((u) => Number(u.seat) || 0)) + 1;
  }

  async reconcile() {
    const live = new Set(this.getConnections().map((c) => c.id));
    let changed = false;
    for (const id of this.users.keys()) {
      if (!live.has(id)) {
        this.users.delete(id);
        this.authorized.delete(id);
        changed = true;
      }
    }
    if (changed) {
      await this.saveUsers();
      this.broadcastPresence();
    }
  }

  async handleConnect(conn) {
    await this.reconcile();
    // Não enviamos roster antes da autorização do ticket.
  }

  async authorize(conn, ticketId) {
    const identity = conn.identity;
    if (identity?.type !== 'authenticated' || typeof identity.userId !== 'string') return null;
    if (!ticketId || this.instanceId !== `TKT-${ticketId}`) return null;

    const tickets = await this.client.asServiceRole.entities.Ticket.filter({ id: ticketId }, '-created_date', 1);
    const ticket = tickets?.[0];
    if (!ticket || ticket.deleted === true || (ticket.status || 'novo') === 'fechado') return null;

    if (ticket.requester_user_id === identity.userId) {
      return { userId: identity.userId, role: 'requester', ticket };
    }

    const rows = await this.client.asServiceRole.entities.User.filter({ id: identity.userId }, '-created_date', 1);
    const user = rows?.[0];
    if (!user || !STAFF_ROLES.has(user.role)) return null;
    return { userId: identity.userId, role: user.role, ticket };
  }

  async handleMessage(conn, msg) {
    if (typeof msg !== 'object' || msg === null) return;

    if (msg.type === 'profile') {
      const ticketId = String(msg.ticket_id || '').slice(0, 120);
      const auth = await this.authorize(conn, ticketId);
      if (!auth) {
        conn.reject(4003, 'ticket call access denied');
        return;
      }

      if (this.ticketId && this.ticketId !== ticketId) {
        conn.reject(4003, 'ticket call mismatch');
        return;
      }
      this.ticketId = ticketId;
      await this.storage.put('ticket_id', ticketId);
      this.authorized.set(conn.id, auth);

      // Uma conta ocupa só um assento por ticket. Evita duplicação/eco em
      // reconexões rápidas, inclusive no mobile.
      const duplicates = [...this.users.entries()]
        .filter(([id, u]) => id !== conn.id && u?.userId === auth.userId)
        .map(([id]) => id);
      if (duplicates.length) {
        for (const id of duplicates) {
          this.users.delete(id);
          this.authorized.delete(id);
        }
        for (const oldConn of this.getConnections()) {
          if (duplicates.includes(oldConn.id)) {
            try { oldConn.send({ type: 'room_error', code: 'session_replaced', message: 'Sua conexão anterior desta call foi substituída.' }); } catch { /* best effort */ }
          }
        }
      }

      if (!this.users.has(conn.id)) {
        if (this.users.size >= MAX_USERS) {
          conn.send({ type: 'room_error', code: 'room_full', message: 'A call deste ticket está cheia.' });
          return;
        }
        this.users.set(conn.id, {
          userId: auth.userId,
          seat: this.nextSeat++,
          name: auth.role === 'requester' ? 'Usuário do ticket' : 'Staff',
          avatar: null,
          frame: null,
          banner: null,
          micOn: false,
          deafened: false,
          camOn: false,
          sharing: false,
          role: auth.role,
        });
      }

      const me = this.users.get(conn.id);
      me.userId = auth.userId;
      me.role = auth.role;
      me.name = String(msg.name ?? '').slice(0, 40) || (auth.role === 'requester' ? 'Usuário do ticket' : 'Staff');
      me.avatar = typeof msg.avatar === 'string' ? msg.avatar.slice(0, 600) : null;
      me.frame = typeof msg.frame === 'string' ? msg.frame.slice(0, 30) : null;
      me.banner = typeof msg.banner === 'string' ? msg.banner.slice(0, 600) : null;
      await this.saveUsers();

      conn.send({ type: 'you', seat: me.seat });
      conn.send({ type: 'roster', users: this.roster() });
      this.broadcastPresence();
      return;
    }

    const auth = this.authorized.get(conn.id);
    const me = this.users.get(conn.id);
    if (!auth || !me) return;

    if (msg.type === 'state') {
      me.micOn = Boolean(msg.micOn);
      me.deafened = Boolean(msg.deafened);
      me.camOn = Boolean(msg.camOn);
      me.sharing = Boolean(msg.sharing);
      await this.saveUsers();
      this.broadcastPresence();
      return;
    }

    if (msg.type === 'signal') {
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
      await this.saveUsers();
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
      return {
        kind: 'ice',
        candidate: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
          sdpMLineIndex: Number(c.sdpMLineIndex) || 0,
          usernameFragment: typeof c.usernameFragment === 'string' ? c.usernameFragment : null,
        },
      };
    }
    if (data.kind === 'renegotiate') return { kind: 'renegotiate' };
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
      ticket_role: u.role || '',
    }));
  }

  broadcastPresence() {
    this.broadcast({ type: 'presence', users: this.roster() });
  }

  saveUsers() {
    return this.storage.put('users', [...this.users.entries()]);
  }
}
