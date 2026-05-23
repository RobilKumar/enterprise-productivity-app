import React, { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage, TasksManagementPage, AttendancePage, LeavePage, AuditPage } from './pages/index';

// ─── API client ───────────────────────────────────────────────
// VITE_API_URL is set in .env.mobile for native builds; falls back to
// the nginx proxy path (/api/v1) for the web/Docker build.
export const API = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || '/api/v1',
});
API.interceptors.request.use(c => {
  const t = localStorage.getItem('accessToken');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});
API.interceptors.response.use(r => r, async err => {
  if (err.response?.status === 401) {
    const refresh = localStorage.getItem('refreshToken');
    if (refresh) {
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken: refresh });
        localStorage.setItem('accessToken',  data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        err.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return API(err.config);
      } catch { localStorage.clear(); window.location.href = '/'; }
    }
  }
  return Promise.reject(err);
});

// ─── Auth context ─────────────────────────────────────────────
const AuthCtx = createContext<any>(null);
export const useAuth = () => useContext(AuthCtx);

// ─── Shared style helpers (used throughout all pages) ─────────
const labelStyle: React.CSSProperties = {
  display:'block', fontSize:11, fontWeight:600, color:'var(--muted)',
  textTransform:'uppercase', letterSpacing:.5, marginBottom:5, marginTop:14,
};
const inputStyle: React.CSSProperties = {
  width:'100%', padding:'8px 12px', borderRadius:'var(--r-md)' as any,
  border:'1.5px solid var(--border)', background:'var(--surface)',
  color:'var(--text)', fontSize:14, boxSizing:'border-box', outline:'none',
  fontFamily:'inherit', transition:'border-color .12s',
};
const smBtn: React.CSSProperties = {
  padding:'6px 14px', borderRadius:'var(--r-md)' as any,
  border:'1px solid var(--border)', background:'transparent',
  cursor:'pointer', fontSize:12, color:'var(--text-sub)', fontFamily:'inherit',
};

// ─── Login Page (Mobile-first redesign) ──────────────────────
function LoginPage() {
  const { login }             = useAuth();
  const [email, setEmail]     = useState('superadmin@company.com');
  const [pass,  setPass]      = useState('');
  const [err,   setErr]       = useState('');
  const [busy,  setBusy]      = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [focused, setFocused] = useState<'email'|'pass'|null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const { data } = await API.post('/auth/login', { email, password: pass });
      login(data.data);
    } catch (ex: any) {
      setErr(ex.response?.data?.message || 'Invalid email or password. Please try again.');
    }
    finally { setBusy(false); }
  };

  const fieldBox = (isFocused: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10,
    background:'#fff', border: isFocused ? '2px solid #0C66E4' : '1.5px solid #DFE1E6',
    borderRadius:14, padding:'0 16px', height:54,
    boxShadow: isFocused ? '0 0 0 3px rgba(12,102,228,.12)' : 'none',
    transition:'border-color .15s, box-shadow .15s',
  });
  const fieldInput: React.CSSProperties = {
    flex:1, border:'none', outline:'none', background:'transparent',
    fontSize:15, color:'#172B4D', fontFamily:'inherit',
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', background:'#EBF2FF' }}>

      {/* ── Brand hero header ─────────────────────────── */}
      <div style={{
        background:'linear-gradient(145deg, #0C66E4 0%, #0747A6 100%)',
        padding:'60px 32px 72px',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center',
        position:'relative', overflow:'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-70, right:-70, width:220, height:220,
          borderRadius:'50%', background:'rgba(255,255,255,.06)' }} />
        <div style={{ position:'absolute', bottom:-50, left:-50, width:180, height:180,
          borderRadius:'50%', background:'rgba(255,255,255,.04)' }} />

        {/* App logo */}
        <div style={{
          width:72, height:72, borderRadius:20, marginBottom:18,
          background:'rgba(255,255,255,.2)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:26, fontWeight:900, color:'#fff', letterSpacing:-1,
          boxShadow:'0 8px 28px rgba(0,0,0,.18)',
          border:'1.5px solid rgba(255,255,255,.28)',
        }}>EP</div>

        <h1 style={{ color:'#fff', fontSize:22, fontWeight:800, margin:'0 0 8px', letterSpacing:-0.3 }}>
          Enterprise Productivity
        </h1>
        <p style={{ color:'rgba(255,255,255,.72)', fontSize:13, margin:'0 0 22px', lineHeight:1.6 }}>
          One platform for your entire team
        </p>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
          {['📋 Tasks','📅 Attendance','🕐 Shifts','📊 KPI'].map(f => (
            <span key={f} style={{
              fontSize:11, padding:'5px 13px', borderRadius:99,
              background:'rgba(255,255,255,.15)', color:'rgba(255,255,255,.92)',
              fontWeight:600,
            }}>{f}</span>
          ))}
        </div>
      </div>

      {/* ── Form card ─────────────────────────────────── */}
      <div style={{
        flex:1, background:'#EBF2FF',
        display:'flex', flexDirection:'column', alignItems:'center',
        padding:'0 20px 36px',
      }}>
        <div style={{
          width:'100%', maxWidth:440,
          background:'#fff', borderRadius:24,
          padding:'28px 24px 24px',
          boxShadow:'0 -4px 32px rgba(7,71,166,.14)',
          marginTop:-28, position:'relative', zIndex:10,
        }}>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#172B4D', margin:'0 0 4px' }}>
            Welcome back 👋
          </h2>
          <p style={{ fontSize:13, color:'#626F86', margin:'0 0 22px' }}>
            Sign in to continue to your workspace
          </p>

          {/* Error banner */}
          {err && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:10,
              background:'#FFF0EE', border:'1.5px solid #FFBDAD',
              borderRadius:12, padding:'12px 14px', marginBottom:18,
            }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>⚠️</span>
              <span style={{ fontSize:13, color:'#AE2E24', fontWeight:500, lineHeight:1.5 }}>{err}</span>
            </div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Email */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#44546F',
                letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>
                Email Address
              </label>
              <div style={fieldBox(focused === 'email')}>
                <span style={{ fontSize:16, color:'#626F86', flexShrink:0 }}>✉️</span>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  type="email" required
                  placeholder="you@company.com"
                  style={fieldInput}
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#44546F',
                letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>
                Password
              </label>
              <div style={fieldBox(focused === 'pass')}>
                <span style={{ fontSize:16, color:'#626F86', flexShrink:0 }}>🔒</span>
                <input
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  type={showPw ? 'text' : 'password'} required
                  placeholder="Enter your password"
                  style={fieldInput}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    color:'#626F86', fontSize:19, padding:'0 2px', lineHeight:1, flexShrink:0 }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={busy} style={{
              width:'100%', height:54, borderRadius:14, border:'none', marginTop:4,
              background: busy ? '#7CB4F7' : 'linear-gradient(135deg, #0C66E4 0%, #0747A6 100%)',
              color:'#fff', fontSize:16, fontWeight:700,
              cursor: busy ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow: busy ? 'none' : '0 4px 16px rgba(12,102,228,.32)',
              transition:'all .15s', letterSpacing:.2,
            }}>
              {busy ? (
                <>
                  <span style={{
                    display:'inline-block', width:18, height:18, borderRadius:'50%',
                    border:'2.5px solid rgba(255,255,255,.35)', borderTopColor:'#fff',
                    animation:'ep-spin .7s linear infinite',
                  }} />
                  Signing in…
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          {/* Demo credentials */}
          <div style={{
            marginTop:20, padding:'13px 16px',
            background:'#F7F8F9', borderRadius:12,
            border:'1px dashed #DFE1E6',
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#44546F', marginBottom:5,
              textTransform:'uppercase', letterSpacing:.5 }}>🧪 Demo Credentials</div>
            <div style={{ fontSize:12, color:'#172B4D', fontFamily:'monospace', lineHeight:1.8 }}>
              superadmin@company.com<br/>
              <span style={{ color:'#0C66E4', fontWeight:600 }}>Admin@123456</span>
            </div>
          </div>
        </div>

        <p style={{ fontSize:11, color:'#8993A4', marginTop:24, textAlign:'center' }}>
          © 2025 Enterprise Productivity Suite
        </p>
      </div>

      <style>{`@keyframes ep-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Role-based navigation ────────────────────────────────────
const ALL_NAV = [
  { to:'/dashboard',     label:'Dashboard',       icon:'🏠', roles:[] },
  // Employees see "My Tasks"; managers see "Task Mgmt"
  { to:'/my-tasks',      label:'My Tasks',         icon:'✅', roles:['EMPLOYEE'] },
  { to:'/tasks',         label:'Task Management',  icon:'📋', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
  { to:'/employees',     label:'Employees',        icon:'👥', roles:['SUPER_ADMIN','ADMIN','MANAGER'] },
  { to:'/departments',   label:'Departments',      icon:'🏛️',  roles:['SUPER_ADMIN','ADMIN'] },
  { to:'/teams',         label:'Teams',            icon:'🏢', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
  { to:'/shifts',        label:'Shift Master',     icon:'🕐', roles:['SUPER_ADMIN','ADMIN'] },
  { to:'/plants',        label:'Plant Master',     icon:'🏭', roles:['SUPER_ADMIN','ADMIN'] },
  { to:'/attendance',    label:'Attendance',       icon:'📅', roles:[] },
  { to:'/leaves',        label:'Leave',            icon:'🌴', roles:[] },
  { to:'/kpi',           label:'KPI Reports',      icon:'📊', roles:['SUPER_ADMIN','ADMIN','MANAGER'] },
  { to:'/rights',        label:'Rights Master',    icon:'🔐', roles:['SUPER_ADMIN'] },
  { to:'/announcements', label:'Announcements',    icon:'📢', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
  { to:'/leaderboard',   label:'Leaderboard',      icon:'🏆', roles:[] },
  { to:'/audit',         label:'Audit Logs',       icon:'🔍', roles:['SUPER_ADMIN','ADMIN'] },
];

// ─── Nav sections for Jira-style grouping ─────────────────────
const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { to:'/dashboard',  label:'Dashboard',      icon:'🏠', roles:[] },
      { to:'/my-tasks',   label:'My Tasks',        icon:'✅', roles:['EMPLOYEE'] },
      { to:'/tasks',      label:'Task Management', icon:'📋', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
      { to:'/attendance', label:'Attendance',      icon:'📅', roles:[] },
      { to:'/leaves',     label:'Leave',           icon:'🌴', roles:[] },
    ],
  },
  {
    label: 'People',
    items: [
      { to:'/employees',    label:'Employees',    icon:'👥', roles:['SUPER_ADMIN','ADMIN','MANAGER'] },
      { to:'/departments',  label:'Departments',  icon:'🏛️',  roles:['SUPER_ADMIN','ADMIN'] },
      { to:'/teams',        label:'Teams',        icon:'🏢', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to:'/shifts', label:'Shift Master', icon:'🕐', roles:['SUPER_ADMIN','ADMIN'] },
      { to:'/plants', label:'Plant Master', icon:'🏭', roles:['SUPER_ADMIN','ADMIN'] },
      { to:'/rights', label:'Rights Master', icon:'🔐', roles:['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to:'/kpi',           label:'KPI Reports',  icon:'📊', roles:['SUPER_ADMIN','ADMIN','MANAGER'] },
      { to:'/leaderboard',   label:'Leaderboard',  icon:'🏆', roles:[] },
      { to:'/announcements', label:'Announcements',icon:'📢', roles:['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'] },
      { to:'/audit',         label:'Audit Logs',   icon:'🔍', roles:['SUPER_ADMIN','ADMIN'] },
    ],
  },
];

function Sidebar({ user, logout, toggleTheme, isDark }: any) {
  const role = user?.role || '';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon">EP</div>
        <div className="sidebar__logo-text">
          <span className="sidebar__logo-name">Enterprise</span>
          <span className="sidebar__logo-sub">Productivity Suite</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav">
        {NAV_SECTIONS.map(section => {
          const visible = section.items.filter(n => n.roles.length === 0 || n.roles.includes(role));
          if (visible.length === 0) return null;
          return (
            <div key={section.label}>
              <div className="sidebar__section-label">{section.label}</div>
              {visible.map(n => (
                <NavLink key={n.to} to={n.to}
                  className={({ isActive }) => `sidebar__link${isActive ? ' active' : ''}`}>
                  <span className="sidebar__link-icon">{n.icon}</span>
                  {n.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="avatar" style={{ background:'var(--primary-bg)', color:'var(--primary)', flexShrink:0 }}>
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">{user?.firstName} {user?.lastName}</div>
            <div className="sidebar__user-role">{(user?.role || '').replace(/_/g,' ')}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={toggleTheme} className="btn btn--ghost btn--sm" style={{ flex:1 }}>
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button onClick={logout} className="btn btn--ghost btn--sm" style={{ flex:1 }}>
            🚪 Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Page title map (for mobile top bar) ─────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/my-tasks':      'My Tasks',
  '/tasks':         'Tasks',
  '/employees':     'Employees',
  '/departments':   'Departments',
  '/teams':         'Teams',
  '/shifts':        'Shifts',
  '/plants':        'Plants',
  '/attendance':    'Attendance',
  '/leaves':        'Leave',
  '/kpi':           'KPI Reports',
  '/rights':        'Rights',
  '/announcements': 'Announcements',
  '/leaderboard':   'Leaderboard',
  '/audit':         'Audit Logs',
};

// ─── Mobile Top Bar ───────────────────────────────────────────
function MobileTopBar({ user, logout, isDark, toggleTheme }: any) {
  const { pathname } = useLocation();
  const title   = PAGE_TITLES[pathname] || 'Enterprise Productivity';
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;
  return (
    <header className="mobile-topbar">
      {/* Left: logo + title */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{
          width:32, height:32, borderRadius:9,
          background:'linear-gradient(135deg,#0C66E4 0%,#0747A6 100%)',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontWeight:900, fontSize:12, flexShrink:0,
          boxShadow:'0 2px 8px rgba(12,102,228,.3)',
        }}>EP</div>
        <span style={{ fontWeight:700, fontSize:17, color:'var(--text)', letterSpacing:-.2 }}>{title}</span>
      </div>

      {/* Right: theme toggle + avatar */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={toggleTheme} style={{
          width:36, height:36, borderRadius:'50%', background:'var(--bg)',
          border:'1.5px solid var(--border)', cursor:'pointer', fontSize:17,
          display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink:0,
        }}>{isDark ? '☀️' : '🌙'}</button>
        <button onClick={logout} style={{
          width:36, height:36, borderRadius:'50%',
          background:'linear-gradient(135deg,#0C66E4,#0747A6)',
          border:'none', cursor:'pointer', color:'#fff', fontWeight:700, fontSize:13,
          display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink:0, boxShadow:'0 2px 8px rgba(12,102,228,.3)',
        }}>{initials}</button>
      </div>
    </header>
  );
}

// ─── Bottom Navigation + More Drawer ─────────────────────────
function BottomNav({ user }: any) {
  const role = user?.role || '';
  const [showDrawer, setShowDrawer] = useState(false);

  const PRIMARY_TABS = [
    { to:'/dashboard',  label:'Home',       icon:'🏠' },
    role === 'EMPLOYEE'
      ? { to:'/my-tasks',   label:'My Tasks',  icon:'✅' }
      : { to:'/tasks',      label:'Tasks',     icon:'📋' },
    { to:'/attendance', label:'Attend',      icon:'📅' },
    { to:'/leaves',     label:'Leave',       icon:'🌴' },
  ];

  const DRAWER_ITEMS = ALL_NAV.filter(n =>
    !PRIMARY_TABS.find(p => p.to === n.to) &&
    (n.roles.length === 0 || n.roles.includes(role))
  );

  return (
    <>
      {/* ── Fixed bottom bar ──────────────────────────────── */}
      <nav className="m-bnav">
        {PRIMARY_TABS.map(tab => (
          <NavLink key={tab.to} to={tab.to}
            className={({ isActive }) => `m-bnav__item${isActive ? ' active' : ''}`}>
            <span className="m-bnav__icon">{tab.icon}</span>
            <span className="m-bnav__label">{tab.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setShowDrawer(true)} className="m-bnav__item">
          <span className="m-bnav__icon">☰</span>
          <span className="m-bnav__label">More</span>
        </button>
      </nav>

      {/* ── Slide-up More drawer ──────────────────────────── */}
      {showDrawer && (
        <div className="m-drawer-bg" onClick={() => setShowDrawer(false)}>
          <div className="m-drawer" onClick={e => e.stopPropagation()}>
            <div className="m-drawer__handle" />

            {/* Header row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0 20px 14px', borderBottom:'1px solid var(--border)', marginBottom:14 }}>
              <span style={{ fontWeight:700, fontSize:17, color:'var(--text)' }}>More</span>
              <button onClick={() => setShowDrawer(false)} style={{
                width:32, height:32, borderRadius:'50%', background:'var(--bg)',
                border:'1.5px solid var(--border)', cursor:'pointer', fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>✕</button>
            </div>

            {/* 3-column grid */}
            <div className="m-drawer__grid">
              {DRAWER_ITEMS.map(item => (
                <NavLink key={item.to} to={item.to}
                  onClick={() => setShowDrawer(false)}
                  className={({ isActive }) => `m-drawer__item${isActive ? ' active' : ''}`}>
                  <span className="m-drawer__icon">{item.icon}</span>
                  <span className="m-drawer__label">{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* User info footer */}
            <div style={{ display:'flex', alignItems:'center', gap:12,
              padding:'14px 20px 18px', borderTop:'1px solid var(--border)' }}>
              <div style={{
                width:40, height:40, borderRadius:'50%',
                background:'linear-gradient(135deg,#0C66E4,#0747A6)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#fff', fontWeight:700, fontSize:14, flexShrink:0,
              }}>
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{user?.firstName} {user?.lastName}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>
                  {(user?.role || '').replace(/_/g,' ')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Placeholder pages ────────────────────────────────────────
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding:32 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>{title}</h1>
      <p style={{ color:'var(--muted)' }}>This section is under development.</p>
    </div>
  );
}

// ─── Leaderboard page ─────────────────────────────────────────
function LeaderboardPage() {
  const [data,    setData]    = useState<any[]>([]);
  const [period,  setPeriod]  = useState<'weekly'|'monthly'>('weekly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    API.get('/leaderboard', { params: { period } })
       .then(r => { setData(r.data.data); setLoading(false); })
       .catch(() => setLoading(false));
  }, [period]);

  const COLORS = ['#FFD700','#C0C0C0','#CD7F32','var(--primary)','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899'];

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🏆 Leaderboard</h1>
        <div style={{ display:'flex', gap:8 }}>
          {(['weekly','monthly'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding:'7px 16px', borderRadius:20, border:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:500, background: period===p ? 'var(--primary)' : 'var(--bg)', color: period===p ? '#fff' : 'var(--text)' }}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {data.map((entry: any) => (
            <div key={entry.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, transition:'box-shadow .15s' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background: COLORS[(entry.rank-1) % COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color: entry.rank<=3?'#000':'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>
                {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : entry.rank}
              </div>
              <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:13, flexShrink:0 }}>
                {entry.user?.firstName?.[0]}{entry.user?.lastName?.[0]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{entry.user?.firstName} {entry.user?.lastName}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{entry.user?.team?.name || entry.user?.employeeId}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:20, fontWeight:800, color:'var(--primary)' }}>⭐ {entry.points.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>points</div>
              </div>
            </div>
          ))}
          {data.length === 0 && <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>No leaderboard data for this period yet.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Announcements page ───────────────────────────────────────
function AnnouncementsPage() {
  const [items,   setItems]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form,    setForm]    = useState({ title:'', content:'', type:'GENERAL', targetType:'COMPANY', isPinned:false });

  const load = () => {
    setLoading(true);
    API.get('/announcements').then(r => { setItems(r.data.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await API.post('/announcements', form);
    setShowNew(false);
    setForm({ title:'', content:'', type:'GENERAL', targetType:'COMPANY', isPinned:false });
    load();
  };

  const TYPE_COLORS: any = { GENERAL:'var(--primary)', URGENT:'#EF4444', POLICY:'#F59E0B', EVENT:'#10B981' };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>📢 Announcements</h1>
        <button onClick={() => setShowNew(true)} style={{ padding:'9px 18px', borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>+ New Announcement</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {items.map((a: any) => (
            <div key={a.id} style={{ background:'var(--surface)', border:`1px solid ${a.isPinned ? 'var(--primary)' : 'var(--border)'}`, borderRadius:12, padding:20 }}>
              <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'flex-start' }}>
                {a.isPinned && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'var(--primary-bg)', color:'var(--primary)', fontWeight:700 }}>📌 PINNED</span>}
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:`${TYPE_COLORS[a.type]}20`, color:TYPE_COLORS[a.type]||'#6B7280', fontWeight:700 }}>{a.type}</span>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#F3F4F6', color:'#6B7280' }}>{a.targetType}</span>
                <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
              <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:700 }}>{a.title}</h3>
              <p style={{ margin:0, fontSize:14, color:'var(--muted)', lineHeight:1.6 }}>{a.content}</p>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:10 }}>
                By {a.author?.firstName} {a.author?.lastName}
              </div>
            </div>
          ))}
          {items.length === 0 && <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>No announcements yet.</div>}
        </div>
      )}

      {showNew && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
          onClick={e => e.target===e.currentTarget && setShowNew(false)}>
          <div style={{ width:520, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'80vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>New Announcement</h2>
            <form onSubmit={submit}>
              <label style={labelStyle}>Title</label>
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required style={inputStyle} />
              <label style={labelStyle}>Content</label>
              <textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} required rows={4} style={{ ...inputStyle, resize:'vertical' as const }} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={inputStyle}>
                    {['GENERAL','URGENT','POLICY','EVENT'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Target</label>
                  <select value={form.targetType} onChange={e=>setForm({...form,targetType:e.target.value})} style={inputStyle}>
                    {['COMPANY','DEPARTMENT','TEAM'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label style={{ ...labelStyle, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={form.isPinned} onChange={e=>setForm({...form,isPinned:e.target.checked})} />
                Pin this announcement
              </label>
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button type="button" onClick={()=>setShowNew(false)} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
                <button type="submit" style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>Post</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Departments page ─────────────────────────────────────────
function DepartmentsPage() {
  const [depts,   setDepts]   = useState<any[]>([]);
  const [users,   setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create'|'edit'|null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [form,    setForm]    = useState({ name:'', code:'', description:'', managerId:'' });

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get('/departments'),
      API.get('/users', { params: { limit: 200 } }),
    ]).then(([dRes, uRes]) => {
      setDepts(dRes.data.data || []);
      setUsers((uRes.data.data?.users || uRes.data.data || []).filter(
        (u: any) => ['MANAGER','ADMIN','SUPER_ADMIN'].includes(u.role?.name ?? u.role)
      ));
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setForm({ name:'', code:'', description:'', managerId:'' });
    setEditing(null);
    setErr('');
    setModal('create');
  };
  const openEdit = (d: any) => {
    setForm({ name: d.name, code: d.code || '', description: d.description || '', managerId: d.managerId || '' });
    setEditing(d);
    setErr('');
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditing(null); setErr(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr('');
    const payload: any = { name: form.name, code: form.code, description: form.description };
    if (form.managerId) payload.managerId = form.managerId;
    try {
      if (modal === 'create') {
        await API.post('/departments', payload);
      } else if (editing) {
        await API.put(`/departments/${editing.id}`, payload);
      }
      closeModal();
      load();
    } catch (ex: any) {
      setErr(ex.response?.data?.message || 'Failed to save department');
    } finally { setSaving(false); }
  };

  const deleteDept = async (d: any) => {
    if (!window.confirm(`Delete department "${d.name}"? This will fail if it has active employees.`)) return;
    try {
      await API.delete(`/departments/${d.id}`);
      load();
    } catch (ex: any) {
      alert(ex.response?.data?.message || 'Cannot delete department');
    }
  };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🏛️ Departments</h1>
          <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>Manage company departments and their managers</p>
        </div>
        <button onClick={openCreate} style={{ padding:'9px 20px', borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>+ New Department</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {depts.map((d: any) => (
            <div key={d.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🏛️</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{d.name}</div>
                    {d.code && <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace', background:'var(--bg)', padding:'1px 6px', borderRadius:4, display:'inline-block', marginTop:2 }}>{d.code}</div>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => openEdit(d)} title="Edit" style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--muted)' }}>✏️</button>
                  <button onClick={() => deleteDept(d)} title="Delete" style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #FCA5A5', background:'transparent', cursor:'pointer', fontSize:12, color:'#EF4444' }}>🗑️</button>
                </div>
              </div>

              {d.description && <p style={{ fontSize:13, color:'var(--muted)', margin:0, lineHeight:1.5 }}>{d.description}</p>}

              <div style={{ display:'flex', gap:20, fontSize:12, color:'var(--muted)' }}>
                <span>👥 {d._count?.users ?? 0} employees</span>
                <span>🏢 {d._count?.teams ?? 0} teams</span>
              </div>

              {d.manager && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg)', borderRadius:8 }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:10, flexShrink:0 }}>
                    {d.manager.firstName?.[0]}{d.manager.lastName?.[0]}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{d.manager.firstName} {d.manager.lastName}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>Department Manager</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {depts.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', padding:60, color:'var(--muted)' }}>
              No departments yet. Click "New Department" to create one.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{ width:480, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>
              {modal === 'create' ? '🏛️ New Department' : `✏️ Edit — ${editing?.name}`}
            </h2>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
            <form onSubmit={submit}>
              <label style={labelStyle}>Department Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name:e.target.value })} required placeholder="e.g. Engineering" style={inputStyle} />

              <label style={labelStyle}>Department Code *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code:e.target.value.toUpperCase() })} required placeholder="e.g. ENG" maxLength={10} style={inputStyle} />
              <p style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 0' }}>Short uppercase code (max 10 chars)</p>

              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description:e.target.value })} rows={3} placeholder="Optional description…" style={{ ...inputStyle, resize:'vertical' as const }} />

              <label style={labelStyle}>Department Manager (optional)</label>
              <select value={form.managerId} onChange={e => setForm({ ...form, managerId:e.target.value })} style={inputStyle}>
                <option value="">— No manager assigned —</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.role?.name ?? u.role})
                  </option>
                ))}
              </select>

              <div style={{ display:'flex', gap:10, marginTop:22 }}>
                <button type="button" onClick={closeModal} style={{ ...smBtn, flex:1, padding:12, textAlign:'center' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:saving?.7:1 }}>
                  {saving ? 'Saving…' : modal === 'create' ? 'Create Department' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Teams page ───────────────────────────────────────────────
function TeamsPage() {
  const [teams,   setTeams]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/teams').then(r => { setTeams(r.data.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding:24 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:20 }}>Teams</h1>
      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {teams.map((t: any) => (
            <div key={t.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏢</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{t.department?.name}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:20, fontSize:12, color:'var(--muted)', marginBottom:12 }}>
                <span>👥 {t._count?.members || 0} members</span>
                <span>📋 {t._count?.tasks   || 0} tasks</span>
              </div>
              {t.leader && (
                <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 12px', background:'var(--bg)', borderRadius:8 }}>
                  👑 {t.leader.firstName} {t.leader.lastName}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KPI Reports Page ─────────────────────────────────────────
function KpiPage() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoad]  = useState(true);
  useEffect(() => {
    API.get('/kpi/company').then(r => { setData(r.data.data); setLoad(false); }).catch(() => setLoad(false));
  }, []);

  if (loading) return <div style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>Loading KPI data…</div>;

  return (
    <div style={{ padding:24 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:24 }}>KPI Reports</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:24 }}>
        {(data?.overallTasks || []).map((t: any) => (
          <div key={t.status} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:26, fontWeight:800 }}>{t._count._all}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>{t.status.replace('_',' ')}</div>
          </div>
        ))}
      </div>
      {data?.topPerformers?.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>🏆 Top Performers</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {data.topPerformers.slice(0,8).map((u: any, i: number) => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--bg)', borderRadius:10 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:12 }}>
                  {u.firstName?.[0]}{u.lastName?.[0]}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{u.firstName} {u.lastName}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>⭐ {u.totalPoints?.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers shared across master pages ──────────────────────
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PRIORITY_COLORS: Record<string,string> = { CRITICAL:'#EF4444', HIGH:'#F97316', MEDIUM:'#F59E0B', LOW:'#10B981' };
const STATUS_COLORS:   Record<string,string> = { PENDING:'#94A3B8', ACCEPTED:'var(--primary)', IN_PROGRESS:'#3B82F6', ON_HOLD:'#F59E0B', COMPLETED:'#10B981', REJECTED:'#EF4444', REOPENED:'#8B5CF6' };

// ─── Shift Master Page ────────────────────────────────────────
function ShiftMasterPage() {
  const [shifts,  setShifts]  = useState<any[]>([]);
  const [users,   setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create'|'edit'|'assign'|null>(null);
  const [active,  setActive]  = useState<any>(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [search,  setSearch]  = useState('');
  const [form, setForm] = useState({ name:'', shiftType:'MORNING', startTime:'09:00', endTime:'18:00', workingDays:[1,2,3,4,5] as number[], gracePeriodMins:15, description:'' });
  const [assignUserId, setAssignUserId] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get('/shifts'),
      API.get('/users', { params: { limit: 200 } }),
    ]).then(([sRes, uRes]) => {
      setShifts(sRes.data.data || []);
      setUsers(uRes.data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setForm({ name:'', shiftType:'MORNING', startTime:'09:00', endTime:'18:00', workingDays:[1,2,3,4,5], gracePeriodMins:15, description:'' });
    setActive(null); setErr(''); setModal('create');
  };
  const openEdit = (s: any) => {
    setForm({ name:s.name, shiftType:s.shiftType||'MORNING', startTime:s.startTime, endTime:s.endTime, workingDays:s.workingDays||[1,2,3,4,5], gracePeriodMins:s.gracePeriodMins??15, description:s.description||'' });
    setActive(s); setErr(''); setModal('edit');
  };
  const openAssign = (s: any) => { setActive(s); setAssignUserId(''); setSearch(''); setErr(''); setModal('assign'); };
  const closeModal = () => { setModal(null); setActive(null); setErr(''); };

  const toggleDay = (d: number) => setForm(f => ({
    ...f, workingDays: f.workingDays.includes(d) ? f.workingDays.filter(x=>x!==d) : [...f.workingDays, d].sort()
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      if (modal === 'create') await API.post('/shifts', form);
      else if (active)        await API.put(`/shifts/${active.id}`, form);
      closeModal(); load();
    } catch (ex: any) { setErr(ex.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const deleteShift = async (s: any) => {
    if (!window.confirm(`Deactivate shift "${s.name}"?`)) return;
    try { await API.delete(`/shifts/${s.id}`); load(); }
    catch (ex: any) { alert(ex.response?.data?.message || 'Cannot delete'); }
  };

  const assignShift = async () => {
    if (!assignUserId) return;
    setSaving(true); setErr('');
    try {
      await API.patch(`/shifts/${active.id}/assign`, { userId: assignUserId });
      closeModal(); load();
    } catch (ex: any) { setErr(ex.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.employeeId}`.toLowerCase().includes(search.toLowerCase())
  );

  const SHIFT_TYPE_COLORS: any = { MORNING:'#F59E0B', AFTERNOON:'var(--primary)', NIGHT:'#1E293B', FLEXIBLE:'#10B981' };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🕐 Shift Master</h1>
          <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>Define work shifts and assign employees</p>
        </div>
        <button onClick={openCreate} style={{ padding:'9px 20px', borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>+ New Shift</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }}>
          {shifts.map((s: any) => (
            <div key={s.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{s.name}</div>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:`${SHIFT_TYPE_COLORS[s.shiftType]||'var(--primary)'}20`, color:SHIFT_TYPE_COLORS[s.shiftType]||'var(--primary)', fontWeight:700 }}>{s.shiftType}</span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openAssign(s)} title="Assign employee" style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--primary)' }}>👤+</button>
                  <button onClick={() => openEdit(s)}   title="Edit"            style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12 }}>✏️</button>
                  <button onClick={() => deleteShift(s)} title="Delete"         style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #FCA5A5',        background:'transparent', cursor:'pointer', fontSize:12, color:'#EF4444' }}>🗑️</button>
                </div>
              </div>
              <div style={{ display:'flex', gap:24, fontSize:13, marginBottom:10 }}>
                <div><span style={{ color:'var(--muted)', fontSize:11 }}>START</span><br/><strong>{s.startTime}</strong></div>
                <div><span style={{ color:'var(--muted)', fontSize:11 }}>END</span><br/><strong>{s.endTime}</strong></div>
                <div><span style={{ color:'var(--muted)', fontSize:11 }}>GRACE</span><br/><strong>{s.gracePeriodMins} min</strong></div>
                <div><span style={{ color:'var(--muted)', fontSize:11 }}>STAFF</span><br/><strong>{s._count?.users ?? 0}</strong></div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {DAYS.map((d, i) => (
                  <span key={d} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, fontWeight:600,
                    background: (s.workingDays||[]).includes(i+1) ? 'var(--primary)' : 'var(--bg)',
                    color:      (s.workingDays||[]).includes(i+1) ? '#fff'    : 'var(--muted)' }}>{d}</span>
                ))}
              </div>
            </div>
          ))}
          {shifts.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:60, color:'var(--muted)' }}>No shifts yet. Click "New Shift" to create one.</div>}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div style={{ width:500, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>{modal==='create' ? '🕐 New Shift' : `✏️ Edit — ${active?.name}`}</h2>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
            <form onSubmit={submit}>
              <label style={labelStyle}>Shift Name *</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required placeholder="e.g. Morning Shift A" style={inputStyle} />

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Shift Type</label>
                  <select value={form.shiftType} onChange={e=>setForm({...form,shiftType:e.target.value})} style={inputStyle}>
                    {['MORNING','AFTERNOON','NIGHT','FLEXIBLE'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Grace Period (min)</label>
                  <input type="number" value={form.gracePeriodMins} min={0} max={60} onChange={e=>setForm({...form,gracePeriodMins:+e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Start Time *</label>
                  <input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})} required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Time *</label>
                  <input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} required style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>Working Days</label>
              <div style={{ display:'flex', gap:8, marginBottom:4 }}>
                {DAYS.map((d, i) => (
                  <button key={d} type="button" onClick={() => toggleDay(i+1)}
                    style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:600,
                      background: form.workingDays.includes(i+1) ? 'var(--primary)' : 'var(--bg)',
                      color:      form.workingDays.includes(i+1) ? '#fff'    : 'var(--muted)' }}>{d}</button>
                ))}
              </div>

              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' as const }} />

              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button type="button" onClick={closeModal} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:saving?.7:1 }}>
                  {saving ? 'Saving…' : modal==='create' ? 'Create Shift' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Employee Modal */}
      {modal === 'assign' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div style={{ width:460, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'80vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>👤 Assign to Shift</h2>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>Shift: <strong>{active?.name}</strong> ({active?.startTime}–{active?.endTime})</p>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee…" style={{ ...inputStyle, marginBottom:10 }} />
            <div style={{ maxHeight:260, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10 }}>
              {filteredUsers.slice(0,30).map((u: any) => (
                <label key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background: assignUserId===u.id ? 'var(--primary-bg)' : 'transparent', borderBottom:'1px solid var(--border)' }}>
                  <input type="radio" name="assignUser" value={u.id} checked={assignUserId===u.id} onChange={()=>setAssignUserId(u.id)} />
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700 }}>{u.firstName?.[0]}{u.lastName?.[0]}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{u.employeeId} · {u.role?.name||u.role} · {u.shift?.name ? `Current: ${u.shift.name}` : 'No shift'}</div>
                  </div>
                </label>
              ))}
              {filteredUsers.length === 0 && <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No employees found</div>}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button type="button" onClick={closeModal} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
              <button onClick={assignShift} disabled={!assignUserId||saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:(!assignUserId||saving)?.6:1 }}>
                {saving ? 'Assigning…' : 'Assign Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plant Master Page ────────────────────────────────────────
function PlantMasterPage() {
  const [plants,  setPlants]  = useState<any[]>([]);
  const [users,   setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create'|'edit'|'assign'|null>(null);
  const [active,  setActive]  = useState<any>(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [search,  setSearch]  = useState('');
  const [form, setForm] = useState({ name:'', code:'', address:'', city:'', description:'' });
  const [assignUserId, setAssignUserId] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get('/plants'),
      API.get('/users', { params: { limit: 200 } }),
    ]).then(([pRes, uRes]) => {
      setPlants(pRes.data.data || []);
      setUsers(uRes.data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setForm({ name:'', code:'', address:'', city:'', description:'' }); setActive(null); setErr(''); setModal('create'); };
  const openEdit   = (p: any) => { setForm({ name:p.name, code:p.code||'', address:p.address||'', city:p.city||'', description:p.description||'' }); setActive(p); setErr(''); setModal('edit'); };
  const openAssign = (p: any) => { setActive(p); setAssignUserId(''); setSearch(''); setErr(''); setModal('assign'); };
  const closeModal = () => { setModal(null); setActive(null); setErr(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const payload = { ...form, code: form.code || null };
    try {
      if (modal === 'create') await API.post('/plants', payload);
      else if (active)        await API.put(`/plants/${active.id}`, payload);
      closeModal(); load();
    } catch (ex: any) { setErr(ex.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const deletePlant = async (p: any) => {
    if (!window.confirm(`Deactivate plant "${p.name}"?`)) return;
    try { await API.delete(`/plants/${p.id}`); load(); }
    catch (ex: any) { alert(ex.response?.data?.message || 'Cannot delete'); }
  };

  const assignPlant = async () => {
    if (!assignUserId) return;
    setSaving(true); setErr('');
    try {
      await API.patch(`/plants/${active.id}/assign`, { userId: assignUserId });
      closeModal(); load();
    } catch (ex: any) { setErr(ex.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.employeeId}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🏭 Plant Master</h1>
          <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>Manage work locations and assign employees</p>
        </div>
        <button onClick={openCreate} style={{ padding:'9px 20px', borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>+ New Plant</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {plants.map((p: any) => (
            <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🏭</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{p.name}</div>
                    {p.code && <span style={{ fontSize:11, fontFamily:'monospace', background:'var(--bg)', padding:'1px 6px', borderRadius:4, color:'var(--muted)' }}>{p.code}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => openAssign(p)} title="Assign employee" style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--primary)' }}>👤+</button>
                  <button onClick={() => openEdit(p)} title="Edit"              style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12 }}>✏️</button>
                  <button onClick={() => deletePlant(p)} title="Delete"         style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #FCA5A5',        background:'transparent', cursor:'pointer', fontSize:12, color:'#EF4444' }}>🗑️</button>
                </div>
              </div>
              {(p.city || p.address) && (
                <div style={{ fontSize:13, color:'var(--muted)' }}>
                  📍 {[p.city, p.address].filter(Boolean).join(', ')}
                </div>
              )}
              {p.description && <p style={{ fontSize:12, color:'var(--muted)', margin:0, lineHeight:1.5 }}>{p.description}</p>}
              <div style={{ fontSize:12, color:'var(--muted)' }}>👥 {p._count?.users ?? 0} employees assigned</div>
            </div>
          ))}
          {plants.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:60, color:'var(--muted)' }}>No plants yet. Click "New Plant" to create one.</div>}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div style={{ width:460, background:'var(--surface)', borderRadius:16, padding:28 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>{modal==='create' ? '🏭 New Plant' : `✏️ Edit — ${active?.name}`}</h2>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
            <form onSubmit={submit}>
              <label style={labelStyle}>Plant Name *</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required placeholder="e.g. Plant Alpha — North" style={inputStyle} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Plant Code</label>
                  <input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="e.g. PLT-A" maxLength={20} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="e.g. Mumbai" style={inputStyle} />
                </div>
              </div>
              <label style={labelStyle}>Address</label>
              <input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Full address…" style={inputStyle} />
              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' as const }} />
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button type="button" onClick={closeModal} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:saving?.7:1 }}>
                  {saving ? 'Saving…' : modal==='create' ? 'Create Plant' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Employee Modal */}
      {modal === 'assign' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div style={{ width:460, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'80vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>👤 Assign to Plant</h2>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>Plant: <strong>{active?.name}</strong></p>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee…" style={{ ...inputStyle, marginBottom:10 }} />
            <div style={{ maxHeight:260, overflowY:'auto', border:'1px solid var(--border)', borderRadius:10 }}>
              {filteredUsers.slice(0,30).map((u: any) => (
                <label key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background: assignUserId===u.id ? 'var(--primary-bg)' : 'transparent', borderBottom:'1px solid var(--border)' }}>
                  <input type="radio" name="assignPlantUser" value={u.id} checked={assignUserId===u.id} onChange={()=>setAssignUserId(u.id)} />
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700 }}>{u.firstName?.[0]}{u.lastName?.[0]}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{u.firstName} {u.lastName}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{u.employeeId} · {u.plant?.name ? `Current: ${u.plant.name}` : 'No plant'}</div>
                  </div>
                </label>
              ))}
              {filteredUsers.length === 0 && <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No employees found</div>}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button type="button" onClick={closeModal} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
              <button onClick={assignPlant} disabled={!assignUserId||saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:(!assignUserId||saving)?.6:1 }}>
                {saving ? 'Assigning…' : 'Assign Plant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── My Tasks Page (Employee task completion view) ────────────
function MyTasksPage() {
  const { user } = useAuth();
  const [tasks,    setTasks]   = useState<any[]>([]);
  const [loading,  setLoading] = useState(true);
  const [tab,      setTab]     = useState<'active'|'completed'>('active');
  const [updating, setUpdating]= useState<string|null>(null);
  const [selected, setSelected]= useState<any>(null);
  const [note,     setNote]    = useState('');

  const load = () => {
    setLoading(true);
    API.get('/tasks', { params: { assigneeId: user?.id, limit: 50 } })
      .then(r => { setTasks(r.data.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const active    = tasks.filter(t => !['COMPLETED','REJECTED'].includes(t.status));
  const completed = tasks.filter(t =>  ['COMPLETED','REJECTED'].includes(t.status));
  const shown     = tab === 'active' ? active : completed;

  const updateStatus = async (taskId: string, status: string, notes?: string) => {
    setUpdating(taskId);
    try {
      await API.patch(`/tasks/${taskId}/status`, { status, notes });
      setSelected(null); setNote('');
      load();
    } catch (ex: any) { alert(ex.response?.data?.message || 'Update failed'); }
    finally { setUpdating(null); }
  };

  const ACTIONS: Record<string, {label:string; status:string; color:string}[]> = {
    PENDING:     [{ label:'✅ Accept',       status:'ACCEPTED',    color:'var(--primary)' }, { label:'❌ Reject', status:'REJECTED', color:'#EF4444' }],
    ACCEPTED:    [{ label:'▶️ Start Work',   status:'IN_PROGRESS', color:'#3B82F6' }],
    IN_PROGRESS: [{ label:'✅ Mark Complete', status:'COMPLETED',   color:'#10B981' }, { label:'⏸️ Hold', status:'ON_HOLD', color:'#F59E0B' }],
    ON_HOLD:     [{ label:'▶️ Resume',       status:'IN_PROGRESS', color:'#3B82F6' }],
    REOPENED:    [{ label:'▶️ Start Work',   status:'IN_PROGRESS', color:'#3B82F6' }],
  };

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const isOverdue = (t: any) => t.dueDate && new Date(t.dueDate) < new Date() && !['COMPLETED','REJECTED'].includes(t.status);

  return (
    <div style={{ padding:24 }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>✅ My Tasks</h1>
        <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>
          Your assigned work — {active.length} active, {completed.length} completed
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--bg)', padding:4, borderRadius:10, width:'fit-content' }}>
        {([['active','Active Tasks'],['completed','Completed']] as const).map(([key,label]) => (
          <button key={key} onClick={()=>setTab(key)}
            style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
              background: tab===key ? 'var(--surface)' : 'transparent',
              color:      tab===key ? 'var(--primary)' : 'var(--muted)',
              boxShadow:  tab===key ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>{label}
            <span style={{ marginLeft:6, fontSize:11, background: tab===key?'var(--primary-bg)':'transparent', color:'var(--primary)', padding:'1px 6px', borderRadius:10 }}>
              {key==='active' ? active.length : completed.length}
            </span>
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading tasks…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {shown.map((t: any) => (
            <div key={t.id} style={{ background:'var(--surface)', border:`1px solid ${isOverdue(t)?'#FCA5A5':'var(--border)'}`, borderRadius:14, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:`${STATUS_COLORS[t.status]}20`, color:STATUS_COLORS[t.status], fontWeight:700 }}>{t.status.replace('_',' ')}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:`${PRIORITY_COLORS[t.priority]}20`, color:PRIORITY_COLORS[t.priority], fontWeight:700 }}>{t.priority}</span>
                    {isOverdue(t) && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#FEF2F2', color:'#EF4444', fontWeight:700 }}>⚠️ OVERDUE</span>}
                    {t.team && <span style={{ fontSize:11, color:'var(--muted)' }}>🏢 {t.team.name}</span>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{t.title}</div>
                  {t.description && <p style={{ fontSize:13, color:'var(--muted)', margin:'0 0 6px', lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{t.description}</p>}
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
                    <span>📅 Due: {fmt(t.dueDate)}</span>
                    {t.estimatedHours && <span>⏱️ Est: {t.estimatedHours}h</span>}
                    <span>💬 {t._count?.comments||0} comments</span>
                  </div>
                </div>

                {/* Action buttons */}
                {ACTIONS[t.status] && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                    {ACTIONS[t.status].map(a => (
                      <button key={a.status} disabled={!!updating} onClick={() => updateStatus(t.id, a.status)}
                        style={{ padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                          background: a.color, color:'#fff', opacity: updating===t.id ? .6 : 1, whiteSpace:'nowrap' }}>
                        {updating===t.id ? '…' : a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>{tab==='active' ? '🎉' : '📭'}</div>
              <div style={{ fontSize:16, fontWeight:600 }}>{tab==='active' ? 'All caught up!' : 'No completed tasks yet'}</div>
              <div style={{ fontSize:13, marginTop:4 }}>{tab==='active' ? 'No active tasks assigned to you.' : 'Completed tasks will appear here.'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rights Master Page ───────────────────────────────────────
const ALL_PERMISSIONS = [
  // category, key, label
  { cat:'Employees',  key:'users.view',             label:'View employee list & profiles' },
  { cat:'Employees',  key:'users.create',            label:'Create new employees' },
  { cat:'Employees',  key:'users.edit',              label:'Edit employee details' },
  { cat:'Employees',  key:'users.delete',            label:'Deactivate / delete employees' },
  { cat:'Tasks',      key:'tasks.view_all',          label:'View all tasks (not just own)' },
  { cat:'Tasks',      key:'tasks.create',            label:'Create & assign tasks' },
  { cat:'Tasks',      key:'tasks.edit',              label:'Edit / update any task' },
  { cat:'Tasks',      key:'tasks.delete',            label:'Delete tasks' },
  { cat:'Attendance', key:'attendance.view',         label:'View attendance records' },
  { cat:'Attendance', key:'attendance.manage',       label:'Correct / edit attendance' },
  { cat:'Leaves',     key:'leaves.view',             label:'View all leave requests' },
  { cat:'Leaves',     key:'leaves.approve',          label:'Approve or reject leave requests' },
  { cat:'Setup',      key:'departments.manage',      label:'Create / edit departments' },
  { cat:'Setup',      key:'shifts.manage',           label:'Create / edit shifts & assign' },
  { cat:'Setup',      key:'plants.manage',           label:'Create / edit plants & assign' },
  { cat:'Setup',      key:'teams.manage',            label:'Create / edit teams' },
  { cat:'Reports',    key:'kpi.view',                label:'View KPI & productivity reports' },
  { cat:'System',     key:'announcements.create',    label:'Post company announcements' },
  { cat:'System',     key:'audit.view',              label:'View audit logs' },
  { cat:'System',     key:'roles.manage',            label:'Edit role rights & permissions' },
];

function RightsMasterPage() {
  const { user: me } = useAuth();
  const [roles,    setRoles]   = useState<any[]>([]);
  const [loading,  setLoading] = useState(true);
  const [editing,  setEditing] = useState<any>(null);
  const [draft,    setDraft]   = useState<string[]>([]);
  const [saving,   setSaving]  = useState(false);
  const [err,      setErr]     = useState('');

  const load = () => {
    setLoading(true);
    API.get('/roles').then(r => { setRoles(r.data.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (r: any) => {
    const perms: string[] = Array.isArray(r.permissions) ? r.permissions : (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : []);
    setDraft(perms.includes('*') ? ALL_PERMISSIONS.map(p=>p.key) : perms);
    setEditing(r); setErr('');
  };

  const toggle = (key: string) => setDraft(d => d.includes(key) ? d.filter(x=>x!==key) : [...d, key]);
  const toggleCat = (cat: string) => {
    const catKeys = ALL_PERMISSIONS.filter(p=>p.cat===cat).map(p=>p.key);
    const allOn   = catKeys.every(k => draft.includes(k));
    setDraft(d => allOn ? d.filter(x=>!catKeys.includes(x)) : [...new Set([...d, ...catKeys])]);
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await API.put(`/roles/${editing.id}/permissions`, { permissions: draft });
      setEditing(null); load();
    } catch (ex: any) { setErr(ex.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const categories = [...new Set(ALL_PERMISSIONS.map(p=>p.cat))];
  const ROLE_COLORS: any = { SUPER_ADMIN:'#EF4444', ADMIN:'#F97316', MANAGER:'var(--primary)', TEAM_LEADER:'#3B82F6', EMPLOYEE:'#10B981' };

  return (
    <div style={{ padding:24 }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🔐 Rights Master</h1>
        <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>Define what each role can access and do</p>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading…</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {roles.map((r: any) => {
            const perms: string[] = Array.isArray(r.permissions) ? r.permissions : (typeof r.permissions === 'string' ? (() => { try { return JSON.parse(r.permissions); } catch { return []; } })() : []);
            const isSuperAdmin = r.name === 'SUPER_ADMIN';
            const hasAll       = perms.includes('*');
            const count        = hasAll ? ALL_PERMISSIONS.length : perms.length;

            return (
              <div key={r.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:11, padding:'4px 10px', borderRadius:8, background:`${ROLE_COLORS[r.name]||'var(--primary)'}20`, color:ROLE_COLORS[r.name]||'var(--primary)', fontWeight:800 }}>{r.name.replace(/_/g,' ')}</span>
                    <span style={{ fontSize:13, fontWeight:600 }}>{r.displayName}</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>· {r._count?.users ?? 0} users</span>
                  </div>
                  {!isSuperAdmin && me?.role === 'SUPER_ADMIN' && (
                    <button onClick={()=>openEdit(r)} style={{ padding:'7px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--primary)' }}>
                      ✏️ Edit Rights
                    </button>
                  )}
                </div>
                {isSuperAdmin ? (
                  <div style={{ fontSize:13, color:'#10B981', fontWeight:600 }}>⭐ All permissions (cannot be changed)</div>
                ) : (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {hasAll
                      ? <span style={{ fontSize:12, padding:'2px 8px', borderRadius:6, background:'#D1FAE5', color:'#065F46', fontWeight:700 }}>All {ALL_PERMISSIONS.length} permissions</span>
                      : ALL_PERMISSIONS.filter(p=>perms.includes(p.key)).map(p=>(
                          <span key={p.key} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'var(--primary-bg)', color:'var(--primary)' }}>{p.label}</span>
                        ))
                    }
                    {!hasAll && perms.length === 0 && <span style={{ fontSize:12, color:'var(--muted)' }}>No special permissions (basic access only)</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }} onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div style={{ width:580, background:'var(--surface)', borderRadius:16, padding:28, maxHeight:'88vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>🔐 Edit Rights — {editing.displayName}</h2>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>{draft.length} of {ALL_PERMISSIONS.length} permissions granted</p>
            {err && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}

            {categories.map(cat => {
              const catPerms = ALL_PERMISSIONS.filter(p=>p.cat===cat);
              const allOn    = catPerms.every(p=>draft.includes(p.key));
              const someOn   = catPerms.some(p=>draft.includes(p.key));
              return (
                <div key={cat} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer' }} onClick={()=>toggleCat(cat)}>
                    <div style={{ width:16, height:16, borderRadius:4, border:'2px solid #6366F1', background: allOn?'var(--primary)':someOn?'#A5B4FC':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {allOn && <span style={{ color:'#fff', fontSize:10 }}>✓</span>}
                      {someOn && !allOn && <span style={{ color:'var(--primary)', fontSize:10, fontWeight:900 }}>─</span>}
                    </div>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{cat}</span>
                  </div>
                  <div style={{ paddingLeft:24, display:'flex', flexDirection:'column', gap:6 }}>
                    {catPerms.map(p => (
                      <label key={p.key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                        <input type="checkbox" checked={draft.includes(p.key)} onChange={()=>toggle(p.key)} style={{ accentColor:'var(--primary)' }} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            <div style={{ display:'flex', gap:10, marginTop:20, borderTop:'1px solid var(--border)', paddingTop:20 }}>
              <button onClick={()=>setEditing(null)} style={{ ...smBtn, flex:1, padding:12 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex:1, padding:12, borderRadius:9, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:saving?.7:1 }}>
                {saving ? 'Saving…' : 'Save Rights'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────
export default function AdminApp() {
  const [user,  setUser]  = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [theme, setTheme] = useState<'light'|'dark'>(() => localStorage.getItem('theme') as any || 'light');

  const login = (d: any) => {
    localStorage.setItem('accessToken',  d.accessToken);
    localStorage.setItem('refreshToken', d.refreshToken);
    localStorage.setItem('user', JSON.stringify(d.user));
    setUser(d.user);
  };
  const logout = () => { localStorage.clear(); setUser(null); };
  const toggleTheme = () => setTheme(t => {
    const next = t === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    return next;
  });

  const isDark = theme === 'dark';

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <div data-theme={isDark ? 'dark' : undefined}
           style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', display:'flex' }}>
        <BrowserRouter>
          {!user ? (
            <div style={{ flex:1 }}><LoginPage /></div>
          ) : (
            <>
              {/* Desktop: left sidebar */}
              <Sidebar user={user} logout={logout} toggleTheme={toggleTheme} isDark={isDark} />

              {/* Mobile: fixed top bar (hidden on desktop via CSS) */}
              <MobileTopBar user={user} logout={logout} isDark={isDark} toggleTheme={toggleTheme} />

              {/* Page content */}
              <main className="app-main" style={{ flex:1, overflowY:'auto', minHeight:'100vh', background:'var(--bg)' }}>
                <Routes>
                  <Route path="/"             element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard"    element={<DashboardPage />} />
                  <Route path="/my-tasks"     element={<MyTasksPage />} />
                  <Route path="/tasks"        element={<TasksManagementPage />} />
                  <Route path="/employees"    element={<EmployeesPage />} />
                  <Route path="/departments"  element={<DepartmentsPage />} />
                  <Route path="/shifts"       element={<ShiftMasterPage />} />
                  <Route path="/plants"       element={<PlantMasterPage />} />
                  <Route path="/teams"        element={<TeamsPage />} />
                  <Route path="/attendance"   element={<AttendancePage />} />
                  <Route path="/leaves"       element={<LeavePage />} />
                  <Route path="/kpi"          element={<KpiPage />} />
                  <Route path="/rights"       element={<RightsMasterPage />} />
                  <Route path="/announcements"element={<AnnouncementsPage />} />
                  <Route path="/leaderboard"  element={<LeaderboardPage />} />
                  <Route path="/audit"        element={<AuditPage />} />
                  <Route path="*"             element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </main>

              {/* Mobile: bottom navigation (hidden on desktop via CSS) */}
              <BottomNav user={user} />
            </>
          )}
        </BrowserRouter>
      </div>
    </AuthCtx.Provider>
  );
}
