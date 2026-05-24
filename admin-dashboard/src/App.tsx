import React, { useState, useRef, createContext, useContext, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { io as socketIO } from 'socket.io-client';
import { BiometricAuth, BiometryErrorType } from '@aparajita/capacitor-biometric-auth';
import { App as CapApp }  from '@capacitor/app';
import { API } from './lib/api';
export { API } from './lib/api'; // re-export so existing consumers still work
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage, TasksManagementPage, AttendancePage, LeavePage, AuditPage } from './pages/index';

// ─── Auth context ─────────────────────────────────────────────
const AuthCtx = createContext<any>(null);
export const useAuth = () => useContext(AuthCtx);

// ─── Error Boundary ───────────────────────────────────────────
// Catches any page-level crash and shows a friendly screen instead of blank white.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(err: any, info: any) {
    console.error('Page crash:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          minHeight:'60vh', padding:32, textAlign:'center',
        }}>
          <div style={{ fontSize:52, marginBottom:16 }}>😕</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8, color:'var(--text)' }}>
            Something went wrong
          </div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24, maxWidth:300 }}>
            {this.state.message || 'An unexpected error occurred on this page.'}
          </div>
          <button
            onClick={() => { this.setState({ hasError:false, message:'' }); window.history.back(); }}
            style={{
              padding:'10px 24px', borderRadius:10, background:'var(--primary)',
              color:'#fff', border:'none', cursor:'pointer', fontWeight:600, fontSize:14,
            }}>
            ← Go Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Logout Confirmation Dialog ───────────────────────────────
function LogoutConfirm({ onConfirm, onCancel }: { onConfirm:()=>void; onCancel:()=>void }) {
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:9999,
    }} onClick={onCancel}>
      <div style={{
        width:'100%', maxWidth:480, background:'var(--surface)',
        borderRadius:'24px 24px 0 0', padding:'20px 24px 32px',
        boxShadow:'0 -4px 32px rgba(0,0,0,.18)',
        animation:'slideUp .2s cubic-bezier(.32,1,.56,1)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2, margin:'0 auto 20px' }} />
        <div style={{ fontSize:20, marginBottom:8, textAlign:'center' }}>👋</div>
        <div style={{ fontWeight:700, fontSize:17, textAlign:'center', marginBottom:6 }}>Sign out?</div>
        <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', marginBottom:24 }}>
          You'll need to sign in again to access your workspace.
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onCancel} style={{
            flex:1, padding:'13px', borderRadius:12, border:'1.5px solid var(--border)',
            background:'var(--bg)', color:'var(--text)', cursor:'pointer',
            fontWeight:600, fontSize:15, fontFamily:'inherit',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex:1, padding:'13px', borderRadius:12, border:'none',
            background:'#EF4444', color:'#fff', cursor:'pointer',
            fontWeight:700, fontSize:15, fontFamily:'inherit',
          }}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

// ─── PG Brand Logo ────────────────────────────────────────────
function PGLogo({ size = 32, textSize = 12 }: { size?: number; textSize?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink:0 }}>
      <circle cx="22" cy="22" r="22" fill="#C8102E"/>
      <circle cx="22" cy="22" r="19.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1"/>
      <text
        x="22" y="29"
        textAnchor="middle"
        fill="white"
        fontFamily="'Arial Black','Arial Bold',Arial,sans-serif"
        fontWeight="900"
        fontSize={textSize + 5}
        letterSpacing="-0.8"
      >PG</text>
    </svg>
  );
}

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

// ─── Login Page — PG World-Class Design ──────────────────────
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
    } finally { setBusy(false); }
  };

  const field = (active: boolean): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:12,
    background: active ? '#fff' : '#F9FAFB',
    border: active ? '2px solid #C8102E' : '1.5px solid #E5E7EB',
    borderRadius:14, padding:'0 16px', height:54,
    boxShadow: active ? '0 0 0 4px rgba(200,16,46,.10)' : 'none',
    transition:'all .18s cubic-bezier(.4,0,.2,1)',
  });
  const fieldInput: React.CSSProperties = {
    flex:1, border:'none', outline:'none', background:'transparent',
    fontSize:15, color:'#111827', fontFamily:'inherit',
  };

  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(150deg, #0D0D12 0%, #1A060A 40%, #0D0D12 100%)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      padding:'24px 20px',
      position:'relative', overflow:'hidden',
    }}>
      {/* Glow orbs */}
      <div style={{ position:'absolute', top:'-8%', right:'-4%', width:520, height:520,
        borderRadius:'50%',
        background:'radial-gradient(circle at center, rgba(200,16,46,0.18) 0%, transparent 65%)',
        pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-12%', left:'-8%', width:600, height:600,
        borderRadius:'50%',
        background:'radial-gradient(circle at center, rgba(200,16,46,0.09) 0%, transparent 65%)',
        pointerEvents:'none' }} />
      {/* Dot grid */}
      <div style={{ position:'absolute', inset:0, opacity:.4,
        backgroundImage:'radial-gradient(circle, rgba(200,16,46,0.18) 1px, transparent 1px)',
        backgroundSize:'32px 32px', pointerEvents:'none' }} />

      {/* ── Brand mark ── */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:28, zIndex:10 }}>
        {/* PG circular logo with glow rings */}
        <div style={{ position:'relative', marginBottom:20 }}>
          <div style={{
            position:'absolute', inset:-10, borderRadius:'50%',
            background:'rgba(200,16,46,.12)', filter:'blur(12px)',
          }} />
          <div style={{
            width:88, height:88, borderRadius:'50%',
            background:'linear-gradient(145deg, #E8122F 0%, #A00D24 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 0 6px rgba(200,16,46,.14), 0 0 0 12px rgba(200,16,46,.06), 0 12px 40px rgba(200,16,46,.40)',
            border:'2px solid rgba(255,255,255,.18)',
            position:'relative' as any,
          }}>
            <span style={{
              color:'#fff', fontSize:30, fontWeight:900, letterSpacing:-1.5,
              fontFamily:"'Arial Black',Arial,sans-serif",
              textShadow:'0 1px 4px rgba(0,0,0,.25)',
            }}>PG</span>
          </div>
        </div>
        <h1 style={{
          color:'#fff', fontSize:28, fontWeight:900,
          margin:'0 0 6px', letterSpacing:-0.8, textAlign:'center',
          textShadow:'0 2px 20px rgba(0,0,0,.4)',
        }}>PG Enterprise Suite</h1>
        <p style={{ color:'rgba(255,255,255,.40)', fontSize:12.5, margin:0,
          textAlign:'center', letterSpacing:1, textTransform:'uppercase', fontWeight:600 }}>
          Workforce Management Platform
        </p>
      </div>

      {/* ── Card ── */}
      <div style={{
        width:'100%', maxWidth:440, zIndex:10,
        background:'rgba(255,255,255,0.97)',
        borderRadius:24, padding:'32px 28px 26px',
        boxShadow:'0 30px 80px rgba(0,0,0,.50), 0 0 0 1px rgba(255,255,255,.08)',
        backdropFilter:'blur(20px)',
      }}>
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#111827', margin:'0 0 5px', letterSpacing:-.4 }}>
            Welcome back
          </h2>
          <p style={{ fontSize:13.5, color:'#6B7280', margin:0, lineHeight:1.5 }}>
            Sign in to access your workspace
          </p>
        </div>

        {err && (
          <div style={{
            display:'flex', alignItems:'flex-start', gap:10,
            background:'#FFF0F2', border:'1.5px solid #FECDD3',
            borderRadius:12, padding:'12px 14px', marginBottom:20,
          }}>
            <span style={{ fontSize:15, flexShrink:0 }}>⚠️</span>
            <span style={{ fontSize:13, color:'#C8102E', fontWeight:500, lineHeight:1.5 }}>{err}</span>
          </div>
        )}

        <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Email */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#374151',
              letterSpacing:.6, textTransform:'uppercase', marginBottom:8 }}>Email Address</label>
            <div style={field(focused === 'email')}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24"
                stroke={focused === 'email' ? '#C8102E' : '#9CA3AF'} strokeWidth="1.8">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <input value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                type="email" required placeholder="you@company.com" style={fieldInput}
                autoCapitalize="none" autoCorrect="off" inputMode="email" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#374151',
              letterSpacing:.6, textTransform:'uppercase', marginBottom:8 }}>Password</label>
            <div style={field(focused === 'pass')}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24"
                stroke={focused === 'pass' ? '#C8102E' : '#9CA3AF'} strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              <input value={pass} onChange={e => setPass(e.target.value)}
                onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
                type={showPw ? 'text' : 'password'} required
                placeholder="Enter your password" style={fieldInput} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color: focused === 'pass' ? '#C8102E' : '#9CA3AF',
                  fontSize:14, padding:'0 2px', lineHeight:1, flexShrink:0,
                  display:'flex', alignItems:'center', transition:'color .15s' }}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={busy} style={{
            width:'100%', height:54, borderRadius:14, border:'none', marginTop:6,
            background: busy
              ? 'linear-gradient(135deg,#E8849A,#C06075)'
              : 'linear-gradient(135deg, #E8122F 0%, #A00D24 100%)',
            color:'#fff', fontSize:16, fontWeight:800,
            cursor: busy ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            boxShadow: busy ? 'none' : '0 6px 24px rgba(200,16,46,.42)',
            transition:'all .2s cubic-bezier(.4,0,.2,1)',
            letterSpacing:.3,
          }}>
            {busy ? (
              <>
                <span style={{ display:'inline-block', width:18, height:18, borderRadius:'50%',
                  border:'2.5px solid rgba(255,255,255,.4)', borderTopColor:'#fff',
                  animation:'pg-spin .7s linear infinite' }} />
                Signing in…
              </>
            ) : (
              <>
                Sign In
                <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Feature pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginTop:20, marginBottom:16 }}>
          {['📋 Tasks','📅 Attendance','🏆 Leaderboard','🚪 Gatepass'].map(f => (
            <span key={f} style={{ fontSize:11, padding:'4px 12px', borderRadius:99,
              background:'#F4F4F5', color:'#374151', fontWeight:600, border:'1px solid #E4E4E7' }}>{f}</span>
          ))}
        </div>

        {/* Demo credentials */}
        <div style={{ padding:'13px 16px', background:'#F9FAFB', borderRadius:12,
          border:'1.5px dashed #E5E7EB' }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:'#6B7280', marginBottom:5,
            textTransform:'uppercase', letterSpacing:.6 }}>🧪 Demo Credentials</div>
          <div style={{ fontSize:12.5, color:'#111827', fontFamily:'monospace', lineHeight:1.9 }}>
            superadmin@company.com<br/>
            <span style={{ color:'#C8102E', fontWeight:700 }}>Admin@123456</span>
          </div>
        </div>
      </div>

      <p style={{ fontSize:11.5, color:'rgba(255,255,255,.20)', marginTop:28, textAlign:'center', zIndex:10 }}>
        © 2025 PG Enterprise Suite · All rights reserved
      </p>

      <style>{`
        @keyframes pg-spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      `}</style>
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
  { to:'/gatepass',     label:'Gatepass',         icon:'🚪', roles:[] },
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
      { to:'/gatepass',   label:'Gatepass',        icon:'🚪', roles:[] },
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
        <PGLogo size={30} textSize={10} />
        <div className="sidebar__logo-text">
          <span className="sidebar__logo-name">PG Enterprise</span>
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
  '/gatepass':      'Gatepass',
};

// ─── Mobile Top Bar ───────────────────────────────────────────
function MobileTopBar({ user, logout, isDark, toggleTheme }: any) {
  const { pathname } = useLocation();
  const title   = PAGE_TITLES[pathname] || 'Enterprise Productivity';
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;
  return (
    <header className="mobile-topbar">
      {/* Left: PG logo + page title */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <PGLogo size={32} textSize={10} />
        <span style={{ fontWeight:700, fontSize:17, color:'var(--text)', letterSpacing:-.3 }}>{title}</span>
      </div>

      {/* Right: theme toggle + avatar */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={toggleTheme} style={{
          width:36, height:36, borderRadius:'50%', background:'var(--surface-2)',
          border:'1.5px solid var(--border)', cursor:'pointer', fontSize:16,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          transition:'all .15s',
        }}>{isDark ? '☀️' : '🌙'}</button>
        <button onClick={logout} style={{
          width:36, height:36, borderRadius:'50%',
          background:'linear-gradient(135deg,#E8122F,#A00D24)',
          border:'none', cursor:'pointer', color:'#fff', fontWeight:700, fontSize:13,
          display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink:0, boxShadow:'0 2px 10px rgba(200,16,46,.35)',
          transition:'all .15s',
        }}>{initials}</button>
      </div>
    </header>
  );
}

// ─── Icon tile colors per route ──────────────────────────────
const TILE_COLORS: Record<string, string> = {
  '/dashboard':     'linear-gradient(145deg,#6366F1,#4F46E5)',
  '/tasks':         'linear-gradient(145deg,#3B82F6,#2563EB)',
  '/my-tasks':      'linear-gradient(145deg,#3B82F6,#2563EB)',
  '/employees':     'linear-gradient(145deg,#8B5CF6,#7C3AED)',
  '/departments':   'linear-gradient(145deg,#14B8A6,#0D9488)',
  '/teams':         'linear-gradient(145deg,#06B6D4,#0891B2)',
  '/shifts':        'linear-gradient(145deg,#F59E0B,#D97706)',
  '/plants':        'linear-gradient(145deg,#22C55E,#16A34A)',
  '/attendance':    'linear-gradient(145deg,#0EA5E9,#0284C7)',
  '/leaves':        'linear-gradient(145deg,#10B981,#059669)',
  '/kpi':           'linear-gradient(145deg,#EAB308,#B45309)',
  '/rights':        'linear-gradient(145deg,#EF4444,#DC2626)',
  '/announcements': 'linear-gradient(145deg,#EC4899,#DB2777)',
  '/leaderboard':   'linear-gradient(145deg,#F97316,#EA580C)',
  '/audit':         'linear-gradient(145deg,#64748B,#475569)',
  '/gatepass':      'linear-gradient(145deg,#C8102E,#8B0D1F)',
};

// ─── Bottom Navigation + More Drawer ─────────────────────────
function BottomNav({ user }: any) {
  const role = user?.role || '';
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer  = () => { setShowDrawer(true);  setTimeout(() => setDrawerOpen(true), 10); };
  const closeDrawer = () => { setDrawerOpen(false); setTimeout(() => setShowDrawer(false), 220); };

  // Primary bar items: 2 left + FAB center + 2 right
  const LEFT_TABS = [
    { to:'/dashboard', label:'Home',   icon:'🏠' },
    role === 'EMPLOYEE'
      ? { to:'/my-tasks', label:'Tasks', icon:'✅' }
      : { to:'/tasks',    label:'Tasks', icon:'📋' },
  ];
  const RIGHT_TABS = [
    { to:'/attendance', label:'Attend', icon:'📅' },
    { to:'/leaves',     label:'Leave',  icon:'🌴' },
  ];

  // All nav items for the drawer, skip ones already in primary bar
  const primaryRoutes = ['/dashboard','/tasks','/my-tasks','/attendance','/leaves'];
  const DRAWER_ALL = ALL_NAV.filter(n =>
    !primaryRoutes.includes(n.to) &&
    (n.roles.length === 0 || n.roles.includes(role))
  );

  // Split drawer items into two groups: main features + admin tools
  const ADMIN_ROUTES = ['/employees','/departments','/teams','/shifts','/plants','/rights','/audit'];
  const drawerMain  = DRAWER_ALL.filter(n => !ADMIN_ROUTES.includes(n.to));
  const drawerAdmin = DRAWER_ALL.filter(n => ADMIN_ROUTES.includes(n.to));

  const TileItem = ({ item }: { item: any }) => (
    <NavLink to={item.to} onClick={closeDrawer}
      className={({ isActive }) => `m-drawer__tile${isActive ? ' active' : ''}`}>
      {() => (
        <>
          <div className="m-drawer__tile-box"
            style={{ background: TILE_COLORS[item.to] || 'linear-gradient(145deg,#6B7280,#4B5563)' }}>
            <span style={{ fontSize:24, lineHeight:1 }}>{item.icon}</span>
          </div>
          <span className="m-drawer__tile-label">{item.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {/* ── Fixed bottom bar ──────────────────────────────── */}
      <nav className="m-bnav">
        {LEFT_TABS.map(tab => (
          <NavLink key={tab.to} to={tab.to}
            className={({ isActive }) => `m-bnav__item${isActive ? ' active' : ''}`}>
            <div className="m-bnav__icon-wrap">
              <span className="m-bnav__icon">{tab.icon}</span>
            </div>
            <span className="m-bnav__label">{tab.label}</span>
          </NavLink>
        ))}

        {/* ── Floating center FAB ─────────────────────────── */}
        <div className="m-bnav__fab">
          <button className="m-bnav__fab-btn" onClick={openDrawer}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.2">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>

        {RIGHT_TABS.map(tab => (
          <NavLink key={tab.to} to={tab.to}
            className={({ isActive }) => `m-bnav__item${isActive ? ' active' : ''}`}>
            <div className="m-bnav__icon-wrap">
              <span className="m-bnav__icon">{tab.icon}</span>
            </div>
            <span className="m-bnav__label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Slide-up drawer ───────────────────────────────── */}
      {showDrawer && (
        <div className="m-drawer-bg"
          style={{ opacity: drawerOpen ? 1 : 0, transition:'opacity .22s' }}
          onClick={closeDrawer}>
          <div className="m-drawer"
            style={{ transform: drawerOpen ? 'translateY(0)' : 'translateY(60%)',
              opacity: drawerOpen ? 1 : 0,
              transition:'transform .26s cubic-bezier(.32,1,.56,1), opacity .22s' }}
            onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div className="m-drawer__handle" />

            {/* User banner */}
            <div className="m-drawer__banner">
              <div className="m-drawer__banner-avatar">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div>
                <div className="m-drawer__banner-name">{user?.firstName} {user?.lastName}</div>
                <div className="m-drawer__banner-role">{(user?.role||'').replace(/_/g,' ')}</div>
              </div>
              <button className="m-drawer__banner-close" onClick={closeDrawer}>✕</button>
            </div>

            {/* Quick Access */}
            {drawerMain.length > 0 && (
              <>
                <div className="m-drawer__section">Quick Access</div>
                <div className="m-drawer__grid">
                  {drawerMain.map(item => <TileItem key={item.to} item={item} />)}
                </div>
              </>
            )}

            {/* Management (admin+ only) */}
            {drawerAdmin.length > 0 && (
              <>
                <div className="m-drawer__section" style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                  Management
                </div>
                <div className="m-drawer__grid">
                  {drawerAdmin.map(item => <TileItem key={item.to} item={item} />)}
                </div>
              </>
            )}

            {/* Security Settings — fingerprint toggle (only on native device) */}
            <div style={{ borderTop:'1px solid var(--border)', margin:'0 -4px', padding:'14px 4px 4px' }}>
              <div className="m-drawer__section" style={{ paddingTop:0, marginBottom:10 }}>Security</div>
              <BiometricToggle />
            </div>

            <div style={{ height: 16 }} />
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

// ═══════════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════
interface ToastItem { id: number; msg: string; type: 'success' | 'error' | 'info' | 'warn' }
const ToastCtx = createContext<(msg: string, type?: ToastItem['type']) => void>(() => {});
const useToast  = () => useContext(ToastCtx);

const TOAST_COLORS: Record<ToastItem['type'], { bg: string; border: string; icon: string }> = {
  success: { bg: '#064E3B', border: '#10B981', icon: '✅' },
  error:   { bg: '#7F1D1D', border: '#EF4444', icon: '❌' },
  info:    { bg: '#1E3A5F', border: '#3B82F6', icon: '🔔' },
  warn:    { bg: '#78350F', border: '#F59E0B', icon: '⚠️' },
};

function ToastContainer({ toasts, remove }: { toasts: ToastItem[]; remove: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position:'fixed', bottom:88, right:16, zIndex:9999, display:'flex', flexDirection:'column', gap:8, maxWidth:320, pointerEvents:'none' }}>
      {toasts.map(t => {
        const c = TOAST_COLORS[t.type];
        return (
          <div key={t.id} style={{ padding:'12px 14px', borderRadius:12, background:c.bg, border:`1px solid ${c.border}`,
            color:'#fff', fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:10,
            boxShadow:'0 6px 24px rgba(0,0,0,.45)', pointerEvents:'all',
            animation:'fadeInUp .3s ease' }}>
            <span style={{ fontSize:16 }}>{c.icon}</span>
            <span style={{ flex:1, lineHeight:1.4 }}>{t.msg}</span>
            <button onClick={() => remove(t.id)} style={{ background:'rgba(255,255,255,.18)', border:'none',
              borderRadius:6, width:22, height:22, color:'#fff', cursor:'pointer', fontSize:13,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BIOMETRIC AUTHENTICATION
//
//  HOW IT WORKS — a quick guide for understanding the code:
//
//  1. PLUGIN  : @aparajita/capacitor-biometric-auth
//               Capacitor is the "bridge" between your React (web) code
//               and the native Android/iOS APIs.  This plugin wraps
//               Android's BiometricPrompt API and iOS's LocalAuthentication.
//
//  2. BiometricAuth.checkBiometry()
//               Asks the device: "Do you have a fingerprint sensor / face ID
//               that is enrolled?"  Returns { isAvailable, biometryType }.
//               We call this when the user first tries to enable the feature
//               so we don't offer it on devices that don't support it.
//
//  3. BiometricAuth.authenticate({ ... })
//               Shows the native OS fingerprint/face dialog.
//               - Resolves (void)  → fingerprint matched ✅
//               - Rejects (BiometryError) → user cancelled or too many fails
//
//  4. CapApp.addListener('appStateChange', ...)
//               @capacitor/app lets us listen to foreground/background
//               transitions.  isActive=false means the user left the app;
//               isActive=true means they came back.  We use this to
//               RE-LOCK the app every time it's backgrounded, so nobody
//               can peek when the user returns.
//
//  5. STORAGE  : localStorage key 'bio_enabled'
//               Persisted across app restarts.  User can toggle it
//               in Profile → Security.  Fully optional — if the device
//               has no biometric sensor, the toggle is hidden.
//
//  FLOW:
//    App opens
//      └─► bio_enabled?  YES → show <LockScreen> overlay
//                             └─► user taps "Unlock" → authenticate()
//                                   ├─► success  → hide overlay, show app
//                                   └─► fail/cancel → stay locked
//    User backgrounds the app
//      └─► locked = true
//    User re-opens the app
//      └─► bio_enabled && locked → show <LockScreen> again
// ═══════════════════════════════════════════════════════════════════

const BIO_KEY = 'bio_enabled';           // localStorage key for the user preference
const IS_NATIVE = !!(window as any).Capacitor?.isNativePlatform?.();  // true only inside the APK

// ── useBiometric hook ────────────────────────────────────────────
// Encapsulates all biometric logic so the UI stays clean.
function useBiometric() {
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled,   setBioEnabled]   = useState(() => localStorage.getItem(BIO_KEY) === '1');
  const [locked,       setLocked]       = useState(() => IS_NATIVE && localStorage.getItem(BIO_KEY) === '1');
  const [bioError,     setBioError]     = useState('');
  const [verifying,    setVerifying]    = useState(false);

  // On mount: check if this device actually has a biometric sensor
  useEffect(() => {
    if (!IS_NATIVE) return;  // skip on web (no fingerprint sensor in browser)
    BiometricAuth.checkBiometry()
      .then(result => setBioAvailable(result.isAvailable))
      .catch(() => setBioAvailable(false));
  }, []);

  // Listen to app foreground/background transitions
  useEffect(() => {
    if (!IS_NATIVE || !bioEnabled) return;
    let listener: any;
    CapApp.addListener('appStateChange', (state) => {
      if (!state.isActive) {
        // App went to background → lock it for when they return
        setLocked(true);
      }
      // When isActive=true (foreground), the LockScreen is already showing
      // because locked=true, so the user will be prompted automatically
    }).then(h => { listener = h; });
    return () => { listener?.remove(); };
  }, [bioEnabled]);

  // Show the native fingerprint dialog
  const authenticate = useCallback(async () => {
    if (!IS_NATIVE) return;
    setVerifying(true);
    setBioError('');
    try {
      await BiometricAuth.authenticate({
        reason:                'Unlock Enterprise App',
        androidTitle:          'Fingerprint Login',
        androidSubtitle:       'Use your fingerprint to continue',
        allowDeviceCredential: true,   // fallback to PIN/pattern if fingerprint fails
        cancelTitle:           'Cancel',
      });
      // ✅ Authentication passed — remove the lock screen
      setLocked(false);
      setBioError('');
    } catch (err: any) {
      const code = err?.code as BiometryErrorType | undefined;
      if (code === BiometryErrorType.userCancel || code === BiometryErrorType.systemCancel) {
        setBioError('Authentication cancelled.');
      } else if (code === BiometryErrorType.biometryLockout) {
        setBioError('Too many attempts. Use your PIN to unlock.');
      } else {
        setBioError(err?.message || 'Fingerprint not recognised. Try again.');
      }
    }
    setVerifying(false);
  }, []);

  // Toggle the setting on/off (called from Profile settings)
  const toggleBio = useCallback(async (enable: boolean) => {
    if (enable) {
      // Verify once before enabling so the user knows it works
      try {
        await BiometricAuth.authenticate({
          reason:      'Confirm fingerprint to enable biometric lock',
          androidTitle:'Enable Fingerprint Unlock',
          allowDeviceCredential: false,
        });
        localStorage.setItem(BIO_KEY, '1');
        setBioEnabled(true);
      } catch {
        // User cancelled — don't enable
      }
    } else {
      localStorage.removeItem(BIO_KEY);
      setBioEnabled(false);
      setLocked(false);
    }
  }, []);

  return { bioAvailable, bioEnabled, locked, bioError, verifying, authenticate, toggleBio };
}

// ── LockScreen overlay ───────────────────────────────────────────
function LockScreen({ onUnlock, error, verifying }: {
  onUnlock: () => void; error: string; verifying: boolean;
}) {
  // Auto-trigger fingerprint dialog as soon as the lock screen appears
  useEffect(() => { onUnlock(); }, []);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:'linear-gradient(160deg,#1a0510 0%,#2d0a1a 50%,#1a0510 100%)' }}>

      {/* PG Logo */}
      <img src="/pg-logo.jpg" alt="PG" style={{ width:80, height:80, borderRadius:12, marginBottom:24, objectFit:'contain' }} />

      {/* Fingerprint icon */}
      <div style={{ width:88, height:88, borderRadius:'50%', marginBottom:28,
        background:'rgba(200,16,46,.18)', border:'2px solid rgba(200,16,46,.5)',
        display:'flex', alignItems:'center', justifyContent:'center',
        animation: verifying ? 'gpPulse 1.2s ease-in-out infinite' : 'none' }}>
        <span style={{ fontSize:44 }}>🔐</span>
      </div>

      <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:8 }}>
        {verifying ? 'Verifying…' : 'App Locked'}
      </div>
      <div style={{ fontSize:14, color:'rgba(255,255,255,.55)', marginBottom:32, textAlign:'center', maxWidth:260 }}>
        {verifying ? 'Place your finger on the sensor' : 'Tap the button below to unlock with your fingerprint'}
      </div>

      {error ? (
        <div style={{ marginBottom:20, padding:'10px 20px', borderRadius:10,
          background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.4)',
          color:'#FCA5A5', fontSize:13, textAlign:'center', maxWidth:280 }}>
          {error}
        </div>
      ) : null}

      <button onClick={onUnlock} disabled={verifying}
        style={{ padding:'16px 40px', borderRadius:50, fontSize:16, fontWeight:700, cursor:'pointer',
          background: verifying ? 'rgba(200,16,46,.4)' : 'linear-gradient(135deg,#C8102E,#8B0D1F)',
          color:'#fff', border:'2px solid rgba(255,255,255,.2)',
          boxShadow: verifying ? 'none' : '0 8px 32px rgba(200,16,46,.5)',
          transition:'all .2s', minWidth:200, fontFamily:'inherit' }}>
        {verifying ? '⏳ Checking…' : '👆 Unlock with Fingerprint'}
      </button>

      <div style={{ marginTop:20, fontSize:12, color:'rgba(255,255,255,.35)' }}>
        Or use PIN/pattern as fallback
      </div>
    </div>
  );
}

// ── BiometricToggle UI component (used in Profile settings) ──────
export function BiometricToggle() {
  const { bioAvailable, bioEnabled, toggleBio } = useBiometricCtx();
  if (!IS_NATIVE || !bioAvailable) return null;   // hide on web or unsupported device

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'14px 16px', borderRadius:12, background:'var(--surface)',
      border:'1px solid var(--border)', marginBottom:12 }}>
      <div>
        <div style={{ fontSize:14, fontWeight:600 }}>🔐 Fingerprint Unlock</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
          {bioEnabled ? 'App locks when backgrounded' : 'Enable to lock app with fingerprint'}
        </div>
      </div>
      {/* Toggle switch */}
      <button onClick={() => toggleBio(!bioEnabled)}
        style={{ width:48, height:26, borderRadius:13, border:'none', cursor:'pointer',
          background: bioEnabled ? '#C8102E' : 'var(--border)',
          position:'relative', transition:'background .2s', flexShrink:0 }}>
        <span style={{ position:'absolute', top:3,
          left: bioEnabled ? 24 : 3,
          width:20, height:20, borderRadius:'50%', background:'#fff',
          transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.3)',
          display:'block' }} />
      </button>
    </div>
  );
}

// Context so the toggle can be used anywhere without prop drilling
const BiometricCtx = createContext<ReturnType<typeof useBiometric> | null>(null);
const useBiometricCtx = () => useContext(BiometricCtx)!;

// ═══════════════════════════════════════════════════════════════════
//  GATEPASS MODULE — Employee Outpass System
//  Uses the existing API axios instance → /api/v1/gatepass/*
// ═══════════════════════════════════════════════════════════════════

const GP_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:   { color: '#92400E', bg: '#FEF3C7', label: 'Pending'   },
  APPROVED:  { color: '#065F46', bg: '#D1FAE5', label: 'Approved'  },
  REJECTED:  { color: '#991B1B', bg: '#FEE2E2', label: 'Rejected'  },
  CANCELLED: { color: '#374151', bg: '#F3F4F6', label: 'Cancelled' },
  EXITED:    { color: '#1E40AF', bg: '#DBEAFE', label: 'Exited'    },
  RETURNED:  { color: '#4C1D95', bg: '#EDE9FE', label: 'Returned'  },
};
const GP_TYPE: Record<string, { color: string; icon: string }> = {
  OFFICIAL:  { color: '#3B82F6', icon: '💼' },
  PERSONAL:  { color: '#8B5CF6', icon: '🏠' },
  MEDICAL:   { color: '#10B981', icon: '🏥' },
  EMERGENCY: { color: '#EF4444', icon: '🚨' },
};

const gpCardSt: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20,
};
const gpBtnPri: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 9, background: 'var(--primary)', color: '#fff',
  border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
};
const gpBtnSec: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 9, background: 'transparent', color: 'var(--text)',
  border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};
const gpBtnGreen: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, background: '#D1FAE5', color: '#065F46',
  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
};
const gpBtnRed: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, background: '#FEE2E2', color: '#991B1B',
  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
};

function GpStatusBadge({ status }: { status: string }) {
  const s = GP_STATUS[status] || { color: '#374151', bg: '#F3F4F6', label: status };
  return <span style={{ padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700, color:s.color, background:s.bg }}>{s.label}</span>;
}
function GpTypeBadge({ type }: { type: string }) {
  const t = GP_TYPE[type] || { color: '#6B7280', icon: '📄' };
  return <span style={{ padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700, color:t.color, background:`${t.color}18` }}>{t.icon} {type}</span>;
}
function fmtDt(dt?: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

// ─── My Requests Tab ──────────────────────────────────────────────
function GpMyTab({ refreshTick }: { refreshTick?: number }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');
  const EMPTY = { outpassType: 'OFFICIAL', destination: '', purpose: '', isFullDay: false, expectedReturnTime: '', remarks: '' };
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(() => {
    setLoading(true);
    API.get('/gatepass/my')
      .then(r => { setRequests(r.data?.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Re-fetch when a socket event fires
  useEffect(() => { if (refreshTick && refreshTick > 0) load(); }, [refreshTick]);

  const submit = async () => {
    if (!form.destination.trim() || !form.purpose.trim()) {
      setErr('Please fill all required fields.'); return;
    }
    if (!form.isFullDay && !form.expectedReturnTime) {
      setErr('Expected return time is required for half-day passes.'); return;
    }
    setSaving(true); setErr('');
    try {
      await API.post('/gatepass', {
        outpassType: form.outpassType,
        destination: form.destination,
        purpose:     form.purpose,
        isFullDay:   form.isFullDay,
        expectedReturnTime: form.isFullDay ? undefined : new Date(form.expectedReturnTime).toISOString(),
        remarks:     form.remarks || undefined,
      });
      setShowAdd(false); setForm(EMPTY); load();
    } catch (e: any) { setErr(e.response?.data?.message || e.message || 'Failed to submit'); }
    setSaving(false);
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this request?')) return;
    try { await API.patch(`/gatepass/${id}/cancel`); load(); }
    catch (e: any) { alert(e.response?.data?.message || e.message || 'Cannot cancel'); }
  };

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <span style={{ fontSize:13, color:'var(--muted)' }}>{requests.length} total requests</span>
        <button onClick={() => { setForm(EMPTY); setErr(''); setShowAdd(true); }} style={gpBtnPri}>+ Raise Request</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      : requests.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🚪</div>
          <div style={{ fontSize:16, fontWeight:600 }}>No outpass requests yet</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>Click "Raise Request" to create your first request</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {requests.map((r: any) => (
            <div key={r.id} style={gpCardSt}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:'monospace', fontSize:11, color:'var(--muted)', marginBottom:4 }}>{r.passNumber}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <GpStatusBadge status={r.status} />
                    <GpTypeBadge   type={r.outpassType} />
                    {r.isFullDay
                      ? <span style={{ padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700, color:'#5B21B6', background:'#EDE9FE' }}>🌕 Full Day</span>
                      : <span style={{ padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>☀️ Half Day</span>}
                  </div>
                </div>
                {r.status === 'PENDING' && <button onClick={() => cancel(r.id)} style={gpBtnRed}>✕ Cancel</button>}
              </div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>📍 {r.destination}</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:8, lineHeight:1.5 }}>{r.purpose}</div>
              <div style={{ display:'flex', gap:14, fontSize:12, color:'var(--muted)', flexWrap:'wrap' }}>
                {r.isFullDay
                  ? <span>🌕 Full day pass — will not return today</span>
                  : <span>⏰ Expected: {fmtDt(r.expectedReturnTime)}</span>}
                {r.approvedBy && <span>✅ By: {r.approvedBy.firstName} {r.approvedBy.lastName}</span>}
                {r.actualExitTime   && <span>🚶 Exited: {fmtDt(r.actualExitTime)}</span>}
                {r.actualReturnTime && <span>🏠 Returned: {fmtDt(r.actualReturnTime)}</span>}
                <span style={{ marginLeft:'auto' }}>🕐 {fmtDt(r.createdAt)}</span>
              </div>
              {r.approvalRemarks && (
                <div style={{ marginTop:8, fontSize:12, padding:'6px 10px', borderRadius:8,
                  background: r.status==='REJECTED' ? '#FEF2F2' : 'var(--bg)',
                  color: r.status==='REJECTED' ? '#991B1B' : 'var(--muted)' }}>
                  💬 {r.approvalRemarks}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Raise Request Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16 }}
          onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', borderRadius:16, padding:'24px 20px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ fontSize:18, fontWeight:700, margin:0 }}>🚪 Raise Outpass Request</h2>
              <button onClick={() => setShowAdd(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color:'var(--muted)' }}>×</button>
            </div>

            {err && <div style={{ background:'#FEF2F2', color:'#991B1B', padding:'8px 12px', borderRadius:8, fontSize:13, marginBottom:14 }}>{err}</div>}

            <label style={labelStyle}>Outpass Type *</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              {(['OFFICIAL','PERSONAL','MEDICAL','EMERGENCY'] as const).map(type => (
                <button key={type} type="button" onClick={() => f('outpassType', type)}
                  style={{ padding:'8px 14px', borderRadius:9, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit',
                    border: form.outpassType===type ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: form.outpassType===type ? 'var(--primary-bg)' : 'var(--bg)',
                    color: form.outpassType===type ? 'var(--primary)' : 'var(--text)' }}>
                  {GP_TYPE[type]?.icon} {type}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Destination *</label>
            <input style={inputStyle} value={form.destination} onChange={e => f('destination', e.target.value)} placeholder="e.g. Client office, Hospital, Government office" />

            <label style={labelStyle}>Purpose / Reason *</label>
            <textarea style={{ ...inputStyle, minHeight:72, resize:'vertical' as const }} value={form.purpose} onChange={e => f('purpose', e.target.value)} placeholder="Briefly describe why you need to go out..." />

            {/* Full Day / Half Day toggle */}
            <label style={labelStyle}>Duration *</label>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button type="button" onClick={() => f('isFullDay', false)}
                style={{ flex:1, padding:'10px 16px', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
                  border: !form.isFullDay ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: !form.isFullDay ? 'var(--primary-bg)' : 'var(--bg)',
                  color: !form.isFullDay ? 'var(--primary)' : 'var(--muted)' }}>
                ☀️ Half Day<br />
                <span style={{ fontSize:11, fontWeight:400, opacity:.8 }}>Will return today</span>
              </button>
              <button type="button" onClick={() => f('isFullDay', true)}
                style={{ flex:1, padding:'10px 16px', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
                  border: form.isFullDay ? '2px solid #7C3AED' : '1px solid var(--border)',
                  background: form.isFullDay ? '#EDE9FE' : 'var(--bg)',
                  color: form.isFullDay ? '#5B21B6' : 'var(--muted)' }}>
                🌕 Full Day<br />
                <span style={{ fontSize:11, fontWeight:400, opacity:.8 }}>Won't return today</span>
              </button>
            </div>

            {!form.isFullDay && (
              <>
                <label style={labelStyle}>Expected Return Time *</label>
                <input type="datetime-local" style={inputStyle} value={form.expectedReturnTime} onChange={e => f('expectedReturnTime', e.target.value)} min={new Date().toISOString().slice(0,16)} />
              </>
            )}
            {form.isFullDay && (
              <div style={{ padding:'10px 14px', borderRadius:10, background:'#EDE9FE', border:'1px solid #C4B5FD', marginBottom:16, fontSize:13, color:'#5B21B6' }}>
                🌕 Full day pass — you will not be expected back until the next working day.
              </div>
            )}

            <label style={labelStyle}>Additional Remarks (optional)</label>
            <input style={inputStyle} value={form.remarks} onChange={e => f('remarks', e.target.value)} placeholder="Any extra notes for your manager…" />

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...gpBtnSec, flex:1 }}>Cancel</button>
              <button onClick={submit} disabled={saving} style={{ ...gpBtnPri, flex:1, opacity:saving?.7:1 }}>
                {saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Approvals Tab ─────────────────────────────────────────────────
function GpApprovalsTab({ refreshTick }: { refreshTick?: number }) {
  const [requests,   setRequests]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState<string|null>(null);
  const [rejectItem, setRejectItem] = useState<any>(null);
  const [remarks,    setRemarks]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    API.get('/gatepass/pending')
      .then(r => { setRequests(r.data?.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshTick && refreshTick > 0) load(); }, [refreshTick]);

  const decide = async (requestId: string, approved: boolean, note = '') => {
    setProcessing(requestId);
    try {
      await API.patch(`/gatepass/${requestId}/approve`, { approved, approvalRemarks: note || undefined });
      setRejectItem(null); setRemarks(''); load();
    } catch (e: any) { alert(e.response?.data?.message || e.message || 'Failed'); }
    setProcessing(null);
  };

  return (
    <div>
      {requests.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <span style={{ padding:'4px 12px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontWeight:700, fontSize:13 }}>
            {requests.length} pending approval{requests.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      : requests.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
          <div style={{ fontSize:16, fontWeight:600 }}>All caught up!</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>No pending approvals from your team.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {requests.map((r: any) => {
            const req  = r.requester || {};
            const name = `${req.firstName||''} ${req.lastName||''}`.trim();
            const dept = req.department?.name || '—';
            const role = req.role?.displayName || req.role?.name || '—';
            return (
            <div key={r.id} style={{ ...gpCardSt, border:'1px solid #FCD34D' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                    <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--muted)' }}>{r.passNumber}</span>
                    <GpTypeBadge type={r.outpassType} />
                  </div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{req.employeeId} · {dept} · {role}</div>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', textAlign:'right', flexShrink:0 }}>{fmtDt(r.createdAt)}</div>
              </div>

              <div style={{ padding:'10px 12px', background:'var(--bg)', borderRadius:10, marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>📍 {r.destination}</div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.5 }}>{r.purpose}</div>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  {r.isFullDay
                    ? <span style={{ fontSize:12, padding:'3px 9px', borderRadius:8, fontWeight:700, color:'#5B21B6', background:'#EDE9FE' }}>🌕 Full Day</span>
                    : <span style={{ fontSize:12, color:'var(--muted)' }}>⏰ Expected back: <strong>{fmtDt(r.expectedReturnTime)}</strong></span>}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { setRejectItem(r); setRemarks(''); }} style={gpBtnRed}>✕ Reject</button>
                  <button onClick={() => decide(r.id, true)} disabled={processing===r.id}
                    style={{ ...gpBtnGreen, padding:'9px 16px', fontSize:13, opacity:processing===r.id?.6:1 }}>
                    {processing===r.id ? '…' : '✓ Approve'}
                  </button>
                </div>
              </div>  {/* end approve/reject row */}
            </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectItem && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16 }}
          onClick={e => e.target===e.currentTarget && setRejectItem(null)}>
          <div style={{ width:'100%', maxWidth:400, background:'var(--surface)', borderRadius:16, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Reject Request</h3>
            <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
              Rejecting <strong>{rejectItem.passNumber}</strong> for {`${rejectItem.requester?.firstName||''} ${rejectItem.requester?.lastName||''}`.trim()}
            </p>
            <label style={labelStyle}>Reason for rejection *</label>
            <textarea style={{ ...inputStyle, minHeight:80, resize:'vertical' as const }} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Explain why this request is being rejected…" />
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={() => setRejectItem(null)} style={{ ...gpBtnSec, flex:1 }}>Cancel</button>
              <button onClick={() => decide(rejectItem.id, false, remarks)} disabled={!remarks.trim() || processing===rejectItem.id}
                style={{ flex:1, padding:'10px 18px', borderRadius:9, background:'#EF4444', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontFamily:'inherit', opacity:(!remarks.trim()||processing===rejectItem.id)?.6:1 }}>
                {processing===rejectItem.id ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gate Terminal Tab ─────────────────────────────────────────────
function GpGateTab({ refreshTick }: { refreshTick?: number }) {
  const [passes,     setPasses]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState<string|null>(null);

  const load = useCallback(() => {
    setLoading(true);
    API.get('/gatepass/security')
      .then(r => { setPasses(r.data?.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshTick && refreshTick > 0) load(); }, [refreshTick]);

  const markExit = async (id: string) => {
    setProcessing(id);
    try { await API.patch(`/gatepass/${id}/exit`); load(); }
    catch (e: any) { alert(e.response?.data?.message || e.message || 'Failed'); }
    setProcessing(null);
  };
  const markReturn = async (id: string) => {
    setProcessing(id);
    try { await API.patch(`/gatepass/${id}/return`); load(); }
    catch (e: any) { alert(e.response?.data?.message || e.message || 'Failed'); }
    setProcessing(null);
  };

  const readyToExit  = passes.filter(p => p.status === 'APPROVED');
  const currentlyOut = passes.filter(p => p.status === 'EXITED');

  return (
    <div>
      {/* Stats + LIVE indicator + Refresh */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        {[{ label:'Ready to Exit', count:readyToExit.length,  color:'#10B981' },
          { label:'Currently Out', count:currentlyOut.length, color:'#3B82F6' }].map(s => (
          <div key={s.label} style={{ padding:'12px 20px', background:'var(--surface)', border:`1px solid ${s.color}30`, borderRadius:12 }}>
            <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.count}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
        {/* LIVE pulsing indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:20,
          background:'#FEF2F2', border:'1px solid #FCA5A5', marginLeft:'auto' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#EF4444', display:'inline-block',
            animation:'gpPulse 1.4s ease-in-out infinite', boxShadow:'0 0 0 0 rgba(239,68,68,.4)' }} />
          <span style={{ fontSize:11, fontWeight:700, color:'#DC2626', letterSpacing:.8 }}>LIVE</span>
        </div>
        <button onClick={load} style={gpBtnSec}>↻ Refresh</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      : passes.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🚪</div>
          <div style={{ fontSize:16, fontWeight:600 }}>No active passes right now</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>Approved passes will appear here in real-time.</div>
        </div>
      ) : (
        <div>
          {/* Ready to Exit */}
          {readyToExit.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                🟢 Ready to Exit ({readyToExit.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {readyToExit.map((p: any) => {
                  const req = p.requester || {};
                  const name = `${req.firstName||''} ${req.lastName||''}`.trim();
                  return (
                  <div key={p.id} style={{ ...gpCardSt, border:'1px solid #A7F3D0', background:'#F0FDF4' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:180 }}>
                        <div style={{ fontFamily:'monospace', fontSize:11, color:'var(--muted)', marginBottom:2 }}>{p.passNumber}</div>
                        <div style={{ fontWeight:700, fontSize:15 }}>{name}</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>{req.employeeId} · {req.department?.name}</div>
                        <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                          <GpTypeBadge type={p.outpassType} />
                          {p.isFullDay
                            ? <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#5B21B6', background:'#EDE9FE' }}>🌕 Full Day</span>
                            : <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>☀️ Half Day</span>}
                          <span style={{ fontSize:12, color:'var(--muted)' }}>→ {p.destination}</span>
                        </div>
                        {!p.isFullDay && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>⏰ Expected back: {fmtDt(p.expectedReturnTime)}</div>}
                        {p.isFullDay && <div style={{ fontSize:11, color:'#7C3AED', marginTop:4 }}>🌕 Will not return today</div>}
                      </div>
                      <button onClick={() => markExit(p.id)} disabled={processing===p.id}
                        style={{ ...gpBtnPri, padding:'11px 18px', opacity:processing===p.id?.6:1, flexShrink:0 }}>
                        {processing===p.id ? '…' : '🚶 Mark Exit'}
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Currently Outside */}
          {currentlyOut.length > 0 && (
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1E40AF', marginBottom:10 }}>
                🔵 Currently Outside ({currentlyOut.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {currentlyOut.map((p: any) => {
                  const overdue = !p.isFullDay && p.expectedReturnTime && new Date(p.expectedReturnTime) < new Date();
                  const req = p.requester || {};
                  const name = `${req.firstName||''} ${req.lastName||''}`.trim();
                  return (
                    <div key={p.id} style={{ ...gpCardSt, border:`1px solid ${overdue ? '#FCA5A5' : '#BFDBFE'}`, background: overdue ? '#FFF5F5' : '#EFF6FF' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                        <div style={{ flex:1, minWidth:180 }}>
                          <div style={{ fontFamily:'monospace', fontSize:11, color:'var(--muted)', marginBottom:2 }}>{p.passNumber}</div>
                          <div style={{ fontWeight:700, fontSize:15 }}>{name}</div>
                          <div style={{ fontSize:12, color:'var(--muted)' }}>{req.employeeId} · {req.department?.name}</div>
                          <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                            {p.isFullDay
                              ? <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#5B21B6', background:'#EDE9FE' }}>🌕 Full Day</span>
                              : <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>☀️ Half Day</span>}
                          </div>
                          <div style={{ display:'flex', gap:12, marginTop:4, fontSize:12, flexWrap:'wrap' }}>
                            <span>🚶 Exit: {fmtDt(p.actualExitTime)}</span>
                            {!p.isFullDay && (
                              <span style={{ color: overdue ? '#EF4444' : 'var(--muted)', fontWeight: overdue ? 700 : 400 }}>
                                {overdue ? '⚠️ OVERDUE — ' : '⏰ '}Expected: {fmtDt(p.expectedReturnTime)}
                              </span>
                            )}
                            {p.isFullDay && <span style={{ color:'#7C3AED' }}>🌕 Full day — won't return today</span>}
                          </div>
                        </div>
                        {/* Full-day passes have no "Mark Return" — they won't come back today */}
                        {!p.isFullDay && (
                          <button onClick={() => markReturn(p.id)} disabled={processing===p.id}
                            style={{ ...gpBtnGreen, padding:'11px 16px', fontSize:13, opacity:processing===p.id?.6:1, flexShrink:0 }}>
                            {processing===p.id ? '…' : '🏠 Mark Return'}
                          </button>
                        )}
                        {p.isFullDay && (
                          <div style={{ padding:'9px 14px', borderRadius:9, background:'#EDE9FE', fontSize:12, color:'#5B21B6', fontWeight:600, flexShrink:0 }}>
                            Full Day Out
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HR Dashboard Tab ──────────────────────────────────────────────
function GpHRTab({ refreshTick }: { refreshTick?: number }) {
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [statusF,     setStatusF]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    API.get('/gatepass/hr')
      .then(r => { setAllRequests(r.data?.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshTick && refreshTick > 0) load(); }, [refreshTick]);

  const filtered = statusF ? allRequests.filter(r => r.status === statusF) : allRequests;

  return (
    <div>
      {/* Summary stat chips (act as filters) */}
      {allRequests.length > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'flex-start' }}>
          {Object.entries(GP_STATUS).map(([s, meta]) => {
            const count = allRequests.filter(r => r.status === s).length;
            if (count === 0) return null;
            return (
            <button key={s} onClick={() => setStatusF(statusF===s ? '' : s)}
              style={{ padding:'12px 20px', borderRadius:12, cursor:'pointer', textAlign:'left' as const, fontFamily:'inherit',
                background: statusF===s ? meta.bg : 'var(--surface)',
                border: `1px solid ${statusF===s ? meta.color : 'var(--border)'}` }}>
              <div style={{ fontSize:22, fontWeight:800, color:meta.color }}>{count}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{meta.label}</div>
            </button>
            );
          })}
          {statusF && <button onClick={() => setStatusF('')} style={{ ...gpBtnSec, alignSelf:'center' }}>✕ Clear</button>}
        </div>
      )}

      {loading ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>No records found.</div>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' as any }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                  {['Pass #','Employee','Dept','Type','Duration','Destination','Expected Return','Exited At','Returned At','Status','Approved By'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', whiteSpace:'nowrap', letterSpacing:.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const req = r.requester || {};
                  const name = `${req.firstName||''} ${req.lastName||''}`.trim() || '—';
                  const approvedBy = r.approvedBy ? `${r.approvedBy.firstName} ${r.approvedBy.lastName}` : '—';
                  return (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background='var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>{r.passNumber}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, whiteSpace:'nowrap' }}>{name}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)' }}>{req.department?.name||'—'}</td>
                    <td style={{ padding:'10px 14px' }}><GpTypeBadge type={r.outpassType} /></td>
                    <td style={{ padding:'10px 14px' }}>
                      {r.isFullDay
                        ? <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#5B21B6', background:'#EDE9FE' }}>🌕 Full</span>
                        : <span style={{ padding:'2px 8px', borderRadius:7, fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5' }}>☀️ Half</span>}
                    </td>
                    <td style={{ padding:'10px 14px', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.destination}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, whiteSpace:'nowrap' }}>{r.isFullDay ? '—' : fmtDt(r.expectedReturnTime)}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, whiteSpace:'nowrap' }}>{fmtDt(r.actualExitTime)}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, whiteSpace:'nowrap' }}>{fmtDt(r.actualReturnTime)}</td>
                    <td style={{ padding:'10px 14px' }}><GpStatusBadge status={r.status} /></td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>{approvedBy}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Gatepass Page ────────────────────────────────────────────
function GatepassPage() {
  const { user }  = useAuth();
  const addToast  = useToast();
  const [tab,     setTab]     = useState<'my'|'approve'|'gate'|'hr'>('my');
  const [gpTick,  setGpTick]  = useState(0);   // increment to trigger live refresh in all tabs

  const role    = user?.role || '';
  const isAdmin = ['SUPER_ADMIN','ADMIN'].includes(role);
  const isMgr   = ['MANAGER','TEAM_LEADER','SUPER_ADMIN','ADMIN'].includes(role);

  const TABS = [
    { key:'my',      label:'📋 My Requests',  show: true    },
    { key:'approve', label:'✅ Approvals',     show: isMgr   },
    { key:'gate',    label:'🚪 Gate Terminal', show: isAdmin },
    { key:'hr',      label:'📊 HR Dashboard', show: isAdmin },
  ].filter(t => t.show);

  const validTab = TABS.find(t => t.key === tab) ? tab : (TABS[0]?.key as any || 'my');

  // ── Socket.IO real-time connection ──────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const base  = (import.meta.env.VITE_API_URL as string || '').replace('/api/v1', '');
    const socket = socketIO(base, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect',    () => console.log('[Gatepass] 🔌 Socket connected:', socket.id));
    socket.on('disconnect', () => console.log('[Gatepass] 🔌 Socket disconnected'));

    // gatepass:new — backend sends ONLY to the RM's personal room, so if you receive this you ARE the RM
    socket.on('gatepass:new', (data: any) => {
      addToast(`🚪 New outpass: ${data.name || 'Someone'} → ${data.destination || ''}`, 'info');
      setGpTick(t => t + 1);
    });

    // gatepass:approved — backend sends ONLY to the requester's personal room
    socket.on('gatepass:approved', (data: any) => {
      addToast(`✅ Your gatepass ${data.passNumber || ''} has been approved!`, 'success');
      setGpTick(t => t + 1);
    });

    // gatepass:rejected — backend sends ONLY to the requester's personal room
    socket.on('gatepass:rejected', (data: any) => {
      addToast(`❌ Your gatepass ${data.passNumber || ''} was rejected`, 'error');
      setGpTick(t => t + 1);
    });

    // gatepass:exited — backend sends ONLY to 'mgmt' room (managers/admins), not the employee
    socket.on('gatepass:exited', (data: any) => {
      addToast(`🚶 ${data.name || 'An employee'} exited — ${data.passNumber || ''}`, 'info');
      setGpTick(t => t + 1);
    });

    // gatepass:returned — backend sends ONLY to 'mgmt' room
    socket.on('gatepass:returned', (data: any) => {
      addToast(`🏠 ${data.name || 'An employee'} returned — ${data.passNumber || ''}`, 'success');
      setGpTick(t => t + 1);
    });

    // gatepass:refresh — silent event (no toast), just refresh data panels for everyone
    socket.on('gatepass:refresh', () => {
      setGpTick(t => t + 1);
    });

    return () => { socket.disconnect(); };
  }, []); // connect once per mount

  return (
    <div style={{ padding:24 }}>
      {/* Header */}
      <div style={{ marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>🚪 Gatepass</h1>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>Employee Outpass Management</div>
        </div>
        {/* Real-time indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20,
          background:'#FEF2F2', border:'1px solid #FCA5A5' }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#EF4444', display:'inline-block',
            animation:'gpPulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize:11, fontWeight:700, color:'#DC2626' }}>REAL-TIME</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--bg)', padding:4, borderRadius:10, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ padding:'9px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit',
              background: validTab===t.key ? 'var(--surface)' : 'transparent',
              color:      validTab===t.key ? 'var(--primary)' : 'var(--muted)',
              boxShadow:  validTab===t.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — gpTick triggers live refresh across all tabs */}
      {validTab === 'my'      && <GpMyTab       refreshTick={gpTick} />}
      {validTab === 'approve' && <GpApprovalsTab refreshTick={gpTick} />}
      {validTab === 'gate'    && <GpGateTab      refreshTick={gpTick} />}
      {validTab === 'hr'      && <GpHRTab        refreshTick={gpTick} />}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────
export default function AdminApp() {
  const [user,         setUser]         = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [theme,        setTheme]        = useState<'light'|'dark'>(() => localStorage.getItem('theme') as any || 'light');
  const [showLogoutDlg, setShowLogoutDlg] = useState(false);

  // ── Toast state ────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const addToast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  // ── Biometric state ────────────────────────────────────────────
  const bio = useBiometric();

  const login = (d: any) => {
    localStorage.setItem('accessToken',  d.accessToken);
    localStorage.setItem('refreshToken', d.refreshToken);
    localStorage.setItem('user', JSON.stringify(d.user));
    setUser(d.user);
  };
  const requestLogout = () => setShowLogoutDlg(true);
  const logout        = () => {
    localStorage.clear();          // also clears bio_enabled on logout
    setUser(null);
    setShowLogoutDlg(false);
  };
  const toggleTheme = () => setTheme(t => {
    const next = t === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    return next;
  });

  const isDark = theme === 'dark';

  return (
    <BiometricCtx.Provider value={bio}>
    <ToastCtx.Provider value={addToast}>
    <AuthCtx.Provider value={{ user, login, logout }}>
      <div data-theme={isDark ? 'dark' : undefined}
           style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', display:'flex' }}>
        <BrowserRouter>
          {!user ? (
            <div style={{ flex:1 }}><LoginPage /></div>
          ) : (
            <>
              {/* Desktop: left sidebar */}
              <Sidebar user={user} logout={requestLogout} toggleTheme={toggleTheme} isDark={isDark} />

              {/* Mobile: fixed top bar (hidden on desktop via CSS) */}
              <MobileTopBar user={user} logout={requestLogout} isDark={isDark} toggleTheme={toggleTheme} />

              {/* Page content — wrapped in ErrorBoundary so crashes show a message, not blank white */}
              <main className="app-main" style={{ flex:1, overflowY:'auto', minHeight:'100vh', background:'var(--bg)' }}>
                <ErrorBoundary>
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
                    <Route path="/gatepass"     element={<GatepassPage />} />
                    <Route path="*"             element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </ErrorBoundary>
              </main>

              {/* Mobile: bottom navigation (hidden on desktop via CSS) */}
              <BottomNav user={user} />

              {/* Logout confirmation dialog */}
              {showLogoutDlg && (
                <LogoutConfirm onConfirm={logout} onCancel={() => setShowLogoutDlg(false)} />
              )}
            </>
          )}
        </BrowserRouter>

        {/* Global toast notifications */}
        <ToastContainer toasts={toasts} remove={removeToast} />

        {/* Biometric lock screen — shown on launch & foreground if bio is enabled */}
        {bio.locked && user && (
          <LockScreen
            onUnlock={bio.authenticate}
            error={bio.bioError}
            verifying={bio.verifying}
          />
        )}
      </div>
    </AuthCtx.Provider>
    </ToastCtx.Provider>
    </BiometricCtx.Provider>
  );
}
