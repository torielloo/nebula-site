import { Actor } from 'base44:runtime/actors';

const MAX_USERS = 12;
const MAX_CORE_MESSAGE = 5000;
const STAFF_ROLES = new Set(['support', 'staff', 'moderator', 'admin', 'dev', 'owner']);

export default class PrivateStaffCallRoom extends Actor {
  users = new Map();
  authenticated = new Map();
  nextSeat = 1;
  coreOsJoined = false;

  async handleStart() {
    const savedUsers = await this.storage.get('users');
    const savedCore = await this.storage.get('core_os_joined');
    if (savedUsers) this.users = new Map(savedUsers);
    this.coreOsJoined = savedCore === true;
    const connections = this.getConnections();
    const live = new Set(connections.map((c) => c.id));
    let changed = false;
    for (const conn of connections) {
      const authorized = await this.authorizeConnection(conn);
      if (!authorized) {
        live.delete(conn.id);
        conn.reject(4003, 'staff authentication required');
        continue;
      }
      this.authenticated.set(conn.id, authorized);
    }
    for (const id of this.users.keys()) {
      if (!live.has(id)) {
        this.users.delete(id);
        changed = true;
      }
    }
    if (changed) await this.saveUsers();
    this.nextSeat = Math.max(0, ...[...this.users.values()].map((u) => u.seat)) + 1;
  }

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
      await this.saveUsers();
      this.broadcastPresence();
    }
  }

  async handleConnect(conn) {
    const authorized = await this.authorizeConnection(conn);
    if (!authorized) {
      conn.reject(4003, 'staff authentication required');
      return;
    }
    this.authenticated.set(conn.id, authorized);
    await this.reconcile();
    const existing = this.users.get(conn.id);
    if (existing?.userId && existing.userId !== authorized.userId) {
      this.users.delete(conn.id);
      await this.saveUsers();
    } else if (existing) {
      existing.userId = authorized.userId;
      conn.send({ type: 'you', seat: existing.seat });
    }
    conn.send({ type: 'roster', users: this.roster() });
    conn.send({ type: 'core_os_state', joined: this.coreOsJoined });
  }

  async handleMessage(conn, msg) {
    if (typeof msg !== 'object' || msg === null) return;
    const identity = conn.identity;
    const authorized = this.authenticated.get(conn.id);
    if (!authorized || identity?.type !== 'authenticated' || identity.userId !== authorized.userId) {
      conn.reject(4003, 'staff authentication required');
      return;
    }

    if (msg.type === 'profile') {
      // Uma conta autenticada ocupa no máximo um assento. Isso evita a Staff
      // Call mostrar a mesma pessoa duas vezes e evita que ela ouça a própria voz
      // quando uma reconexão rápida deixa a conexão anterior viva por alguns ms.
      const duplicateConnectionIds = [...this.users.entries()]
        .filter(([id, u]) => id !== conn.id && u?.userId === authorized.userId)
        .map(([id]) => id);
      if (duplicateConnectionIds.length) {
        for (const id of duplicateConnectionIds) this.users.delete(id);
        for (const oldConn of this.getConnections()) {
          if (duplicateConnectionIds.includes(oldConn.id)) {
            try { oldConn.send({ type: 'room_error', code: 'session_replaced', message: 'Sua conexão anterior da Staff Call foi substituída por esta sessão.' }); } catch { /* best-effort */ }
          }
        }
        await this.saveUsers();
      }

      if (!this.users.has(conn.id)) {
        if (this.users.size >= MAX_USERS) {
          conn.send({ type: 'room_error', code: 'room_full', message: 'A Staff Call privada está cheia.' });
          return;
        }
        this.users.set(conn.id, {
          userId: authorized.userId,
          seat: this.nextSeat++,
          name: 'Staff',
          avatar: null,
          frame: null,
          banner: null,
          micOn: false,
          deafened: false,
          camOn: false,
          sharing: false,
        });
      }
      const me = this.users.get(conn.id);
      me.name = String(msg.name ?? '').slice(0, 40) || 'Staff';
      me.avatar = typeof msg.avatar === 'string' ? msg.avatar.slice(0, 600) : null;
      me.frame = typeof msg.frame === 'string' ? msg.frame.slice(0, 30) : null;
      me.banner = typeof msg.banner === 'string' ? msg.banner.slice(0, 600) : null;
      await this.saveUsers();
      conn.send({ type: 'you', seat: me.seat });
      conn.send({ type: 'roster', users: this.roster() });
      conn.send({ type: 'core_os_state', joined: this.coreOsJoined });
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
      return;
    }

    if (msg.type === 'core_os_join') {
      this.coreOsJoined = true;
      await this.storage.put('core_os_joined', true);
      this.broadcast({ type: 'core_os_state', joined: true, by: me.name });
      return;
    }

    if (msg.type === 'core_os_leave') {
      this.coreOsJoined = false;
      await this.storage.put('core_os_joined', false);
      this.broadcast({ type: 'core_os_state', joined: false, by: me.name });
      return;
    }

    if (msg.type === 'core_os_message' && this.coreOsJoined) {
      const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_CORE_MESSAGE) : '';
      if (!text) return;
      this.broadcast({
        type: 'core_os_message',
        id: crypto.randomUUID(),
        text,
        source: 'Core OS',
        requested_by: me.name,
        created_at: new Date().toISOString(),
      });
    }
  }

  async handleClose(conn) {
    this.authenticated.delete(conn.id);
    if (this.users.delete(conn.id)) {
      await this.saveUsers();
      this.broadcastPresence();
    }
  }

  async authorizeConnection(conn) {
    const identity = conn.identity;
    if (identity?.type !== 'authenticated' || typeof identity.userId !== 'string') return null;
    const rows = await this.client.asServiceRole.entities.User.filter({ id: identity.userId }, '-created_date', 1);
    const user = rows?.[0];
    if (!user || !STAFF_ROLES.has(user.role)) return null;
    return { userId: user.id, role: user.role };
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
    }));
  }

  broadcastPresence() {
    this.broadcast({ type: 'presence', users: this.roster() });
  }

  saveUsers() {
    return this.storage.put('users', [...this.users.entries()]);
  }
}