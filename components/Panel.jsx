'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BRAND = 'https://zfile.web.id/PBe7sdw.png';
const BANNER = 'https://zfile.web.id/ptVnzVN.png';
const fmtBytes = value => {
  const n = Number(value || 0);
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};
const fmtUptime = seconds => {
  const s = Math.max(0, Number(seconds || 0));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m} menit`;
};

export default function Panel({ initialPage = 'home' }) {
  const [token, setToken] = useState('');
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [servers, setServers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', runtime: 'node', entry: 'index.js', command: 'node index.js', memoryLimit: 512 });
  const [consoleLines, setConsoleLines] = useState(['FRANXX PTERO // runtime console', 'Pilih server lalu tekan Start untuk menjalankan runtime.']);
  const [command, setCommand] = useState('');
  const [profile, setProfile] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [keyScopes, setKeyScopes] = useState(['servers:read', 'servers:create', 'servers:start', 'servers:stop', 'servers:restart', 'servers:stats']);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cwd, setCwd] = useState('');
  const [fileRows, setFileRows] = useState([]);
  const [editorPath, setEditorPath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const uploadRef = useRef(null);
  const wsRef = useRef(null);
  const consoleRef = useRef(null);
  const tokenRef = useRef('');

  const notify = useCallback((message, isError = false) => {
    setToast(message);
    setError(isError ? message : '');
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const api = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`;
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(url, { ...options, headers, body, cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    if (!response.ok) throw new Error(data?.error || data?.message || `Request gagal (${response.status})`);
    return data;
  }, []);

  const loadServers = useCallback(async () => {
    const data = await api('/api/servers');
    const list = Array.isArray(data) ? data : data.servers || [];
    setServers(list);
    setSelected(previous => previous ? (list.find(s => String(s.id) === String(previous.id)) || previous) : null);
    return list;
  }, [api]);

  const loadFiles = useCallback(async (serverId, directory = '') => {
    if (!serverId) return;
    try { const query = directory ? `?path=${encodeURIComponent(directory)}` : ''; const data = await api(`/api/servers/${encodeURIComponent(serverId)}/files${query}`); setFileRows(Array.isArray(data) ? data : []); }
    catch (e) { setFileRows([]); notify(e.message, true); }
  }, [api, notify]);

  const loadStats = useCallback(async (serverId) => {
    if (!serverId) return;
    try { setStats(await api(`/api/servers/${encodeURIComponent(serverId)}/stats`)); } catch { /* stats can briefly fail while a runtime starts */ }
  }, [api]);

  const loadAdmin = useCallback(async () => {
    try { setProfile(await api('/api/root/profile')); } catch (e) { notify(e.message, true); }
    try { setApiKeys(await api('/api/root/access-keys')); } catch (e) { if (e.message) notify(e.message, true); }
  }, [api, notify]);

  const boot = useCallback(async (activeToken) => {
    tokenRef.current = activeToken;
    try {
      const user = await api('/api/me');
      setMe(user);
      await loadServers();
      setError('');
    } catch (e) {
      localStorage.removeItem('fx_token'); tokenRef.current = ''; setToken(''); setMe(null);
      if (activeToken) notify(`Sesi berakhir: ${e.message}`, true);
    } finally { setLoading(false); }
  }, [api, loadServers, notify]);

  useEffect(() => {
    const stored = localStorage.getItem('fx_token') || '';
    setToken(stored); tokenRef.current = stored;
    if (stored) boot(stored); else setLoading(false);
  }, [boot]);

  useEffect(() => {
    if (!token || !me) return;
    const timer = window.setInterval(() => { loadServers().catch(() => {}); if (selected) loadStats(selected.id); }, 7000);
    return () => window.clearInterval(timer);
  }, [token, me, selected, loadServers, loadStats]);

  useEffect(() => {
    if (selected?.id && token && page === 'console') { loadFiles(selected.id, cwd); loadStats(selected.id); }
  }, [selected?.id, token, page, cwd, loadFiles, loadStats]);

  useEffect(() => {
    if (!selected || !token || page !== 'console') {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${scheme}//${location.host}/ws?token=${encodeURIComponent(token)}&server=${encodeURIComponent(selected.id)}`);
    wsRef.current = ws;
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') setConsoleLines(old => [...old.slice(-249), String(data.data || '')]);
        if (data.type === 'status') { setSelected(old => old ? { ...old, status: data.status } : old); loadServers().catch(() => {}); loadStats(selected.id); }
      } catch { setConsoleLines(old => [...old.slice(-249), String(event.data)]); }
    };
    ws.onerror = () => setConsoleLines(old => [...old.slice(-249), '[INFO] Koneksi console belum tersedia. Pastikan server aktif.']);
    return () => { ws.close(); if (wsRef.current === ws) wsRef.current = null; };
  }, [selected?.id, token, page, loadServers, loadStats]);

  useEffect(() => { if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [consoleLines]);
  useEffect(() => { if (page === 'admin' && me?.root) loadAdmin(); }, [page, me, loadAdmin]);

  const filteredServers = useMemo(() => servers.filter(s => `${s.name} ${s.runtime} ${s.id}`.toLowerCase().includes(search.toLowerCase())), [servers, search]);

  async function login(event) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.error || 'Login gagal');
      localStorage.setItem('fx_token', data.token); setToken(data.token); tokenRef.current = data.token; setPassword(''); setLoading(true); await boot(data.token); setPage('home'); notify('Berhasil masuk ke FRANXX PTERO');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }

  function logout() {
    if (wsRef.current) wsRef.current.close();
    localStorage.removeItem('fx_token'); tokenRef.current = ''; setToken(''); setMe(null); setServers([]); setSelected(null); setStats(null); setPage('home');
  }

  async function createServer(event) {
    event.preventDefault(); setBusy(true);
    try {
      const server = await api('/api/servers', { method: 'POST', body: newServer });
      setShowCreate(false); setNewServer({ name: '', runtime: 'node', entry: 'index.js', command: 'node index.js', memoryLimit: 512 });
      const list = await loadServers(); setSelected(list.find(s => s.id === server.id) || server); setCwd(''); setPage('console'); setConsoleLines(['Server berhasil dibuat.', 'Tekan Start untuk menjalankan runtime.']); notify('Server berhasil dibuat');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }

  async function power(action) {
    if (!selected) return;
    if (action === 'stop' && !window.confirm(`Hentikan server ${selected.name}?`)) return;
    setBusy(true);
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}/${action}`, { method: 'POST', body: {} }); notify(`Perintah ${action} berhasil dikirim`); await loadServers(); await loadStats(selected.id); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }

  async function deleteServer() {
    if (!selected || !window.confirm(`Hapus server ${selected.name} beserta seluruh file? Tindakan ini tidak bisa dibatalkan.`)) return;
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}`, { method: 'DELETE' }); setSelected(null); setStats(null); await loadServers(); setPage('console'); notify('Server berhasil dihapus'); }
    catch (e) { notify(e.message, true); }
  }

  async function createFolder() {
    if (!selected) return; const name = window.prompt('Nama folder baru:'); if (!name?.trim()) return;
    const path = cwd ? `${cwd}/${name.trim()}` : name.trim();
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}/mkdir`, { method: 'POST', body: { path } }); notify('Folder berhasil dibuat'); await loadFiles(selected.id, cwd); } catch (e) { notify(e.message, true); }
  }

  async function uploadFiles(event) {
    const files = [...(event.target.files || [])]; if (!files.length || !selected) return;
    const form = new FormData(); files.forEach(file => form.append('files', file));
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}/upload?path=${encodeURIComponent(cwd)}`, { method: 'POST', body: form }); notify(`${files.length} file berhasil diunggah`); await loadFiles(selected.id, cwd); } catch (e) { notify(e.message, true); } finally { event.target.value = ''; }
  }

  async function openEditor(file) {
    if (!selected) return; const path = cwd ? `${cwd}/${file}` : file;
    try { const data = await api(`/api/servers/${encodeURIComponent(selected.id)}/file?path=${encodeURIComponent(path)}`); setEditorPath(path); setEditorContent(data.content || ''); setShowEditor(true); } catch (e) { notify(e.message, true); }
  }

  async function saveEditor() {
    if (!selected || !editorPath) return;
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}/file`, { method: 'PUT', body: { path: editorPath, content: editorContent } }); notify('File berhasil disimpan'); setShowEditor(false); await loadFiles(selected.id, cwd); } catch (e) { notify(e.message, true); }
  }

  async function removeFile(file) {
    if (!selected) return; const path = cwd ? `${cwd}/${file}` : file; if (!window.confirm(`Hapus ${path}?`)) return;
    try { await api(`/api/servers/${encodeURIComponent(selected.id)}/file`, { method: 'DELETE', body: { path } }); notify('File berhasil dihapus'); await loadFiles(selected.id, cwd); } catch (e) { notify(e.message, true); }
  }

  async function sendCommand(event) {
    event.preventDefault();
    if (!command.trim() || !selected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return notify('Console belum terhubung atau server offline', true);
    wsRef.current.send(JSON.stringify({ type: 'stdin', data: command }));
    setConsoleLines(old => [...old.slice(-249), `> ${command}`]); setCommand('');
  }

  async function createUser(event) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    try { await api('/api/root/users', { method: 'POST', body: { username: form.get('username'), password: form.get('password'), root: form.get('root') === 'on' } }); formElement.reset(); notify('Akun berhasil dibuat'); await loadAdmin(); }
    catch (e) { notify(e.message, true); }
  }

  async function createKey(event) {
    event.preventDefault();
    try { const result = await api('/api/root/access-keys', { method: 'POST', body: { name: keyName.trim(), scopes: keyScopes } }); setKeySecret(result.secret || ''); setKeyName(''); await loadAdmin(); notify('API key dibuat. Simpan secret sekarang.'); }
    catch (e) { notify(e.message, true); }
  }

  async function revokeKey(id) {
    if (!window.confirm('Cabut akses API key ini?')) return;
    try { await api(`/api/root/access-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: {} }); notify('API key dicabut'); await loadAdmin(); }
    catch (e) { notify(e.message, true); }
  }

  function navigate(nextPage) {
    if ((nextPage === 'admin' || nextPage === 'account') && !me?.root && nextPage === 'admin') return notify('Fitur ini khusus root/admin', true);
    setPage(nextPage); setMobileOpen(false);
    if (typeof window !== 'undefined') history.replaceState(null, '', nextPage === 'home' ? '/home' : '/console');
  }

  if (loading) return <div className="boot-screen"><div className="boot-logo"><img src={BRAND} alt="" /></div><div className="spinner"/><p>Menyiapkan FRANXX PTERO</p></div>;

  if (!me) return <main className="auth-page"><div className="auth-glow glow-a"/><div className="auth-glow glow-b"/><section className="auth-layout"><div className="auth-intro"><div className="brand-lockup"><img src={BRAND} alt="FRANXX"/><span>FRANXX <b>PTERO</b></span></div><span className="eyebrow"><i/> PRIVATE SERVER PLATFORM</span><h1>Control your<br/><em>own universe.</em></h1><p>Satu tempat untuk mengelola runtime, file, resource, dan server kamu dengan lebih nyaman.</p><div className="auth-feature-row"><span>⌁ Live Console</span><span>◈ File Manager</span><span>◉ Resource Monitor</span></div><div className="auth-art"><img src={BANNER} alt=""/><div className="art-overlay"/><div className="art-caption"><small>FX PROJECT / 02</small><strong>BUILT FOR<br/>YOUR NEXT IDEA.</strong></div></div></div><form className="login-card" onSubmit={login}><div className="card-overline">WELCOME BACK <span>● SECURE LOGIN</span></div><h2>Sign in<span>.</span></h2><p>Masuk ke akun panel FRANXX kamu.</p><label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Masukkan username" required/></label><label>Password<input value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" type="password" placeholder="Masukkan password" required/></label>{error && <div className="inline-error">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? 'MEMPROSES…' : 'MASUK KE PANEL'} <span>↗</span></button><div className="login-note"><span className="shield">◇</span><span>Akses privat. Registrasi akun publik dinonaktifkan.</span></div><div className="auth-foot">© 2026 FRANXX PTERO <span>KYZX FRANXX DEV</span></div></form></section>{toast && <div className="toast">{toast}</div>}</main>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <a className="side-brand" href="/home" onClick={e => { e.preventDefault(); navigate('home'); }}><img src={BRAND} alt=""/><span><strong>FRANXX <b>PTERO</b></strong><small>CONTROL CENTER <i>V2</i></small></span></a>
      <div className="side-caption">WORKSPACE</div>
      <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => navigate('home')}><span className="nav-icon">▦</span>Overview</button>
      <button className={`nav-item ${page === 'console' ? 'active' : ''}`} onClick={() => navigate('console')}><span className="nav-icon">⌘</span>Console & Servers <span className="nav-count">{servers.length}</span></button>
      {me.root && <><div className="side-caption admin-caption">ADMINISTRATION</div><button className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => navigate('admin')}><span className="nav-icon">◈</span>Admin & API</button></>}
      <div className="side-spacer"/><div className="sidebar-status"><span className="pulse-dot"/><div><b>Panel operational</b><small>Private runtime environment</small></div></div>
      <div className="side-user"><div className="avatar">{me.username?.slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{me.username}</b><small>{me.root ? 'ROOT ADMIN' : 'PANEL USER'}</small></div><button title="Logout" onClick={logout} className="logout-icon">↗</button></div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"/>}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileOpen(true)}>☰</button><div className="breadcrumbs"><span>FRANXX</span><b>/</b><strong>{page === 'home' ? 'Overview' : page === 'console' ? 'Console & Servers' : page === 'admin' ? 'Admin & API' : 'Account'}</strong></div></div><div className="topbar-right"><span className="system-status"><i/> SYSTEM NORMAL</span><span className="top-date">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date())}</span><div className="top-avatar">{me.username?.slice(0, 1).toUpperCase()}</div></div></header>
      {page === 'home' && <section className="content-page"><div className="welcome-banner"><div className="welcome-bg"/><div className="welcome-copy"><span className="eyebrow"><i/> CONTROL PANEL <b>•</b> PRIVATE CLOUD</span><h1>Selamat datang, <em>{me.username}.</em></h1><p>Semua runtime kamu, di satu tempat. Mau mulai dari mana hari ini?</p><div className="welcome-actions"><button className="button primary" onClick={() => { navigate('console'); }}>Lihat server <span>↗</span></button><button className="button subtle" onClick={() => setShowCreate(true)}>＋ Buat server</button></div></div><div className="welcome-orbit"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><img src={BRAND} alt="FRANXX"/></div><div className="banner-label">FX / HOSTING SYSTEM <b>V2.0</b></div></div>
        <div className="section-title-row"><div><span className="section-kicker">AT A GLANCE</span><h2>Ringkasan panel</h2></div><button className="button subtle small" onClick={() => loadServers().then(() => notify('Data diperbarui')).catch(e => notify(e.message, true))}>↻ Refresh</button></div>
        <div className="stats-grid"><article className="metric-card"><div className="metric-top"><span>Total server</span><i className="metric-icon purple">▦</i></div><strong>{servers.length.toString().padStart(2, '0')}</strong><div className="metric-bottom"><span className="metric-tag">SERVER</span><small>Server dalam akun kamu</small></div><div className="metric-line purple-line"/></article><article className="metric-card"><div className="metric-top"><span>Runtime online</span><i className="metric-icon green">◉</i></div><strong>{servers.filter(s => s.status === 'online').length.toString().padStart(2, '0')}</strong><div className="metric-bottom"><span className="metric-tag green-tag">LIVE</span><small>Proses aktif sekarang</small></div><div className="metric-line green-line"/></article><article className="metric-card"><div className="metric-top"><span>Runtime offline</span><i className="metric-icon amber">◌</i></div><strong>{servers.filter(s => s.status !== 'online').length.toString().padStart(2, '0')}</strong><div className="metric-bottom"><span className="metric-tag amber-tag">IDLE</span><small>Siap dijalankan</small></div><div className="metric-line amber-line"/></article><article className="metric-card"><div className="metric-top"><span>Account access</span><i className="metric-icon blue">◇</i></div><strong className="access-value">{me.root ? 'ROOT' : 'USER'}</strong><div className="metric-bottom"><span className="metric-tag blue-tag">{me.root ? 'FULL ACCESS' : 'LIMITED'}</span><small>Level akses akun</small></div><div className="metric-line blue-line"/></article></div>
        <div className="section-title-row server-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h2>Server terbaru</h2><p>Kelola runtime tanpa berpindah-pindah tempat.</p></div><button className="text-link" onClick={() => navigate('console')}>Semua server <span>→</span></button></div>
        {servers.length ? <div className="server-grid">{servers.slice(0, 4).map(server => <ServerCard key={server.id} server={server} onOpen={() => { setSelected(server); setPage('console'); history.replaceState(null, '', '/console'); }} onStart={() => { setSelected(server); api(`/api/servers/${encodeURIComponent(server.id)}/start`, { method: 'POST', body: {} }).then(() => { notify('Perintah start dikirim'); loadServers(); }).catch(e => notify(e.message, true)); }}/>)}</div> : <EmptyState onCreate={() => setShowCreate(true)} />}
        <div className="bottom-info"><div className="info-symbol">✳</div><div><b>Runtime kamu, kendali kamu.</b><p>Mulai dari project Node.js, Python, sampai command custom dengan resource yang bisa disesuaikan.</p></div><span className="info-version">FRANXX / 2.0</span></div>
      </section>}

      {page === 'console' && <section className="content-page"><div className="page-heading"><div><span className="section-kicker">RUNTIME MANAGEMENT</span><h1>Console <em>& Servers</em></h1><p>Kelola proses, pantau resource, dan akses server kamu.</p></div><button className="button primary" onClick={() => setShowCreate(true)}>＋ Buat server</button></div><div className="console-layout"><section className="server-list-panel"><div className="panel-heading"><div><h3>Server kamu <span>{servers.length}</span></h3><p>Pilih server untuk mengelola runtime.</p></div><button className="icon-button" onClick={() => loadServers().catch(e => notify(e.message, true))}>↻</button></div><div className="search-wrap"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama server…"/></div><div className="server-list">{filteredServers.map(server => <button key={server.id} className={`server-list-item ${selected?.id === server.id ? 'chosen' : ''}`} onClick={() => { setSelected(server); setCwd(''); setStats(null); setConsoleLines([`Connected target: ${server.name}`, 'Menunggu log dari runtime…']); }}><span className={`server-symbol ${server.runtime}`}>{server.runtime === 'python' ? 'Py' : server.runtime === 'node' ? 'JS' : 'FX'}</span><span className="server-list-meta"><b>{server.name}</b><small>{server.runtime?.toUpperCase()} · {server.entry || 'custom entry'}</small></span><span className={`status-dot ${server.status === 'online' ? 'is-online' : ''}`}/></button>)}{!filteredServers.length && <div className="empty-small">{search ? 'Tidak ada server yang cocok.' : 'Belum ada server. Buat server pertamamu.'}</div>}</div><button className="create-inline" onClick={() => setShowCreate(true)}>＋ Tambah runtime baru</button></section>
        {selected ? <section className="runtime-panel"><div className="runtime-title"><div className="runtime-title-icon">{selected.runtime === 'python' ? 'Py' : selected.runtime === 'node' ? 'JS' : 'FX'}</div><div><span className="section-kicker">SELECTED RUNTIME</span><h2>{selected.name}</h2><p>{selected.runtime?.toUpperCase()} · {selected.entry || 'custom entry'} · {selected.id}</p></div><span className={`status-pill ${selected.status === 'online' ? 'online' : ''}`}><i/>{selected.status === 'online' ? 'ONLINE' : 'OFFLINE'}</span></div>
          <div className="power-actions"><button className="button start" disabled={busy || selected.status === 'online'} onClick={() => power('start')}>▶ Start</button><button className="button stop" disabled={busy || selected.status !== 'online'} onClick={() => power('stop')}>■ Stop</button><button className="button restart" disabled={busy} onClick={() => power('restart')}>↻ Restart</button><button className="button danger-outline" onClick={deleteServer}>Hapus</button></div>
          <div className="resource-grid"><ResourceCard title="CPU USAGE" value={`${Number(stats?.cpu || 0).toFixed(1)}%`} percent={Math.min(100, Number(stats?.cpu || 0))} icon="⌁"/><ResourceCard title="MEMORY" value={`${fmtBytes(stats?.memory)} / ${fmtBytes(stats?.memoryLimit)}`} percent={stats?.memoryLimit ? Math.min(100, Number(stats.memory || 0) / Number(stats.memoryLimit) * 100) : 0} icon="▤"/><ResourceCard title="STORAGE" value={fmtBytes(stats?.storage)} percent={Math.min(100, Number(stats?.storage || 0) / (1024 ** 3) * 100)} icon="▣"/><ResourceCard title="UPTIME" value={stats?.status === 'online' ? fmtUptime(stats.uptime) : '—'} percent={stats?.status === 'online' ? 100 : 0} icon="◷"/></div>
          <div className="terminal-card"><div className="terminal-head"><div><span className="terminal-lights"><i/><i/><i/></span><b>CONSOLE / OUTPUT</b><span className="terminal-connected"><i/> {wsRef.current?.readyState === 1 ? 'LIVE STREAM' : 'CONNECTING'}</span></div><button onClick={() => setConsoleLines([])}>Clear</button></div><div className="terminal-output" ref={consoleRef}>{consoleLines.map((line, i) => <div key={`${i}-${line}`} className={`terminal-line ${/error|failed|exception/i.test(line) ? 'log-error' : /ready|success|online/i.test(line) ? 'log-success' : ''}`}><span>{String(i + 1).padStart(3, '0')}</span><code>{line}</code></div>)}</div><form className="terminal-input" onSubmit={sendCommand}><span>›_</span><input value={command} onChange={e => setCommand(e.target.value)} placeholder="Kirim command ke runtime…"/><button disabled={!command.trim()}>KIRIM ↗</button></form></div>
          <section className="file-manager-card"><div className="file-manager-head"><div><span className="section-kicker">SERVER STORAGE</span><h3>File manager</h3><p>Folder aktif: <code>/{cwd}</code></p></div><div className="file-manager-actions"><button className="button subtle small" onClick={createFolder}>＋ Folder</button><button className="button subtle small" onClick={() => uploadRef.current?.click()}>↑ Upload</button><input ref={uploadRef} type="file" multiple hidden onChange={uploadFiles}/></div></div><div className="file-breadcrumb"><button onClick={() => setCwd('')}>root</button>{cwd.split('/').filter(Boolean).map((part, index, parts) => <span key={`${part}-${index}`}>/ <button onClick={() => setCwd(parts.slice(0, index + 1).join('/'))}>{part}</button></span>)}</div><div className="file-table">{cwd && <button className="file-row file-parent" onClick={() => setCwd(cwd.split('/').slice(0, -1).join('/'))}><span className="file-type">↰</span><b>..</b><small>Folder sebelumnya</small><span>←</span></button>}{fileRows.map(file => <div className="file-row" key={file.name}><span className={`file-type ${file.type === 'dir' ? 'folder' : ''}`}>{file.type === 'dir' ? '▰' : '▤'}</span><button className="file-name" onClick={() => file.type === 'dir' ? setCwd(cwd ? `${cwd}/${file.name}` : file.name) : openEditor(file.name)}>{file.name}</button><small>{file.type === 'dir' ? 'FOLDER' : fmtBytes(file.size)}</small>{file.type !== 'dir' && <button className="file-action" title="Edit file" onClick={() => openEditor(file.name)}>Edit</button>}<button className="file-delete" title="Delete" onClick={() => removeFile(file.name)}>×</button></div>)}{!fileRows.length && <div className="empty-small">Folder kosong atau belum bisa dibaca.</div>}</div></section>
          <div className="runtime-footnote"><span>ⓘ</span> Console menggunakan koneksi WebSocket. Perintah stdin hanya bekerja jika runtime mendukung input interaktif.</div>
        </section> : <section className="runtime-empty"><div className="empty-illustration">⌘</div><h2>Pilih runtime untuk memulai</h2><p>Pilih server dari daftar di samping untuk melihat status, statistik resource, dan console.</p><button className="button primary" onClick={() => setShowCreate(true)}>＋ Buat server pertama</button></section>}</div></section>}

      {page === 'admin' && <section className="content-page"><div className="page-heading"><div><span className="section-kicker">ROOT / ADMIN TOOLS</span><h1>Admin <em>& API</em></h1><p>Kelola akun panel dan kredensial integrasi dari satu tempat.</p></div><button className="button subtle" onClick={() => loadAdmin()}>↻ Refresh data</button></div><div className="admin-grid"><section className="surface-card"><div className="surface-heading"><div><span className="section-kicker">ACCOUNT DIRECTORY</span><h2>Panel users</h2></div><span className="count-chip">{profile?.users?.length || 0} USERS</span></div><form className="inline-create-form" onSubmit={createUser}><label>Username<input name="username" minLength="3" maxLength="32" pattern="[A-Za-z0-9_.-]+" required placeholder="username baru"/></label><label>Password<input name="password" type="password" minLength="8" required placeholder="Minimal 8 karakter"/></label><label className="check-label"><input type="checkbox" name="root"/> Root admin</label><button className="button primary">Buat akun</button></form><div className="admin-user-list">{(profile?.users || []).map(user => <div className="admin-user-row" key={user.id}><div className="avatar mini">{user.username?.slice(0, 1).toUpperCase()}</div><div><b>{user.username}</b><small>{user.id} · {user.createdAt ? new Date(user.createdAt).toLocaleDateString('id-ID') : 'Tanggal tidak tersedia'}</small></div><span className={`role-chip ${user.root ? 'root' : ''}`}>{user.root ? 'ROOT' : 'USER'}</span></div>)}</div></section>
        <section className="surface-card"><div className="surface-heading"><div><span className="section-kicker">PROGRAMMATIC ACCESS</span><h2>Access keys</h2></div><span className="count-chip">{apiKeys.length} KEYS</span></div><p className="surface-description">Secret ditampilkan satu kali setelah dibuat. Simpan di server atau secret manager, jangan masukkan ke frontend publik.</p><form className="key-form" onSubmit={createKey}><label>Nama key<input value={keyName} onChange={e => setKeyName(e.target.value)} required maxLength="80" placeholder="Contoh: FRANXX Telegram Bot"/></label><div className="scope-picks">{['users:read','users:create','users:delete','servers:read','servers:create','servers:start','servers:stop','servers:restart','servers:delete','servers:stats'].map(scope => <label key={scope}><input type="checkbox" checked={keyScopes.includes(scope)} onChange={e => setKeyScopes(old => e.target.checked ? [...old, scope] : old.filter(s => s !== scope))}/>{scope}</label>)}</div><button className="button primary" disabled={!keyScopes.length}>＋ Generate API key</button></form>{keySecret && <div className="secret-result"><b>SECRET — SIMPAN SEKARANG</b><code>{keySecret}</code><button className="button subtle small" onClick={() => navigator.clipboard?.writeText(keySecret).then(() => notify('Secret disalin')).catch(() => notify('Gagal menyalin secret', true))}>Copy secret</button></div>}<div className="key-list">{apiKeys.map(key => <div className="key-row" key={key.id}><div><b>{key.name}</b><small>{key.prefix} · {(key.scopes || []).join(', ')}</small></div><span className={`role-chip ${key.revokedAt ? '' : 'root'}`}>{key.revokedAt ? 'REVOKED' : 'ACTIVE'}</span>{!key.revokedAt && <button className="revoke-button" onClick={() => revokeKey(key.id)}>Revoke</button>}</div>)}{!apiKeys.length && <div className="empty-small">Belum ada API key.</div>}</div></section></div></section>}
      <footer className="app-footer"><span>© 2026 FRANXX PTERO · KYZX FRANXX DEV</span><span>MADE FOR YOUR RUNTIME <b>✳</b></span></footer>
    </main>
    {showEditor && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowEditor(false); }}><section className="editor-modal"><div className="modal-top"><div><span className="section-kicker">FILE EDITOR</span><h2>{editorPath}</h2><p>Perubahan baru disimpan setelah kamu menekan Simpan.</p></div><button className="icon-button" onClick={() => setShowEditor(false)}>×</button></div><textarea value={editorContent} onChange={e => setEditorContent(e.target.value)} spellCheck={false}/><div className="modal-actions"><button className="button subtle" onClick={() => setShowEditor(false)}>Batal</button><button className="button primary" onClick={saveEditor}>Simpan perubahan ↗</button></div></section></div>}
    {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}><form className="create-modal" onSubmit={createServer}><div className="modal-top"><div><span className="section-kicker">NEW INSTANCE</span><h2>Buat server <em>baru.</em></h2><p>Siapkan runtime dan batas memori awal.</p></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)}>×</button></div><label>Nama server<input value={newServer.name} onChange={e => setNewServer(s => ({ ...s, name: e.target.value }))} minLength="1" maxLength="64" placeholder="Contoh: my-discord-bot" required/></label><label>Runtime<select value={newServer.runtime} onChange={e => setNewServer(s => ({ ...s, runtime: e.target.value, entry: e.target.value === 'python' ? 'main.py' : 'index.js', command: e.target.value === 'python' ? 'python main.py' : e.target.value === 'node' ? 'node index.js' : '' }))}><option value="node">Node.js</option><option value="python">Python</option><option value="custom">Custom command</option></select></label><div className="form-two"><label>Entry file<input value={newServer.entry} onChange={e => setNewServer(s => ({ ...s, entry: e.target.value }))} required placeholder="index.js"/></label><label>Memory (MB)<input type="number" min="64" max="32768" step="64" value={newServer.memoryLimit} onChange={e => setNewServer(s => ({ ...s, memoryLimit: Number(e.target.value) }))} required/></label></div><label>Start command<input value={newServer.command} onChange={e => setNewServer(s => ({ ...s, command: e.target.value }))} maxLength="300" required placeholder="node index.js"/></label><div className="modal-note">ⓘ Server dibuat dalam ruang penyimpanan runtime panel. Pastikan perintah sesuai dengan file yang akan kamu upload.</div><div className="modal-actions"><button type="button" className="button subtle" onClick={() => setShowCreate(false)}>Batal</button><button className="button primary" disabled={busy}>{busy ? 'MEMBUAT…' : 'Buat server ↗'}</button></div></form></div>}
    {toast && <div className={`toast ${error ? 'toast-error' : ''}`} role="status">{error ? '!' : '✓'} {toast}</div>}
  </div>;
}

function ServerCard({ server, onOpen, onStart }) {
  const online = server.status === 'online';
  return <article className="server-card"><div className="server-card-top"><span className={`server-symbol ${server.runtime}`}>{server.runtime === 'python' ? 'Py' : server.runtime === 'node' ? 'JS' : 'FX'}</span><span className={`status-pill ${online ? 'online' : ''}`}><i/>{online ? 'ONLINE' : 'OFFLINE'}</span></div><h3>{server.name}</h3><p>{server.runtime?.toUpperCase()} <span>·</span> {server.entry || 'custom entry'}</p><div className="server-card-meta"><span><small>MEMORY LIMIT</small><b>{server.memoryLimit || 512} MB</b></span><span><small>SERVER ID</small><b>{String(server.id).slice(0, 13)}</b></span></div><div className="server-card-actions"><button className="button subtle" onClick={onOpen}>Manage server <span>↗</span></button><button className="button quick-start" title="Start server" onClick={onStart} disabled={online}>▶</button></div></article>;
}
function ResourceCard({ title, value, percent, icon }) {
  return <article className="resource-card"><div className="resource-card-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><div className="resource-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(percent || 0)))}%` }}/></div><small>{Math.round(Math.max(0, Math.min(100, Number(percent || 0))))}% UTILIZATION</small></article>;
}
function EmptyState({ onCreate }) {
  return <div className="empty-state"><div className="empty-illustration">▦</div><h3>Workspace masih kosong</h3><p>Server pertama kamu hanya butuh beberapa detail untuk dibuat.</p><button className="button primary" onClick={onCreate}>＋ Buat server pertama</button></div>;
}
