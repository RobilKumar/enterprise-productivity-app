/**
 * DashboardPage — role-scoped views
 *
 * SUPER_ADMIN / ADMIN  → full company-wide dashboard
 * MANAGER              → full company-wide dashboard + "view any employee" panel
 * TEAM_LEADER          → personal stats + their team overview
 * EMPLOYEE             → personal stats only
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { API } from '../lib/api';
import { useAuth } from '../App';

// ── Colour palette ──────────────────────────────────────────────
const C = {
  indigo:  '#6366F1', indigoL: '#A5B4FC',
  green:   '#10B981', greenL:  '#6EE7B7',
  amber:   '#F59E0B', amberL:  '#FCD34D',
  red:     '#EF4444', redL:    '#FCA5A5',
  blue:    '#3B82F6', blueL:   '#93C5FD',
  purple:  '#8B5CF6', purpleL: '#C4B5FD',
  teal:    '#14B8A6', pg:      '#C8102E',
};
const PIE_COLORS  = [C.indigo, C.green, C.amber, C.red, C.blue, C.purple, C.teal];
const PRIO_COLOR: Record<string, string> = {
  CRITICAL: C.red, HIGH: C.amber, MEDIUM: C.blue, LOW: C.green,
};

// ── Helpers ─────────────────────────────────────────────────────
const fmt = (n: any, def = '0') => (n === null || n === undefined ? def : String(n));
const pct = (n: any) => `${Math.round(Number(n) || 0)}%`;
const short = (d: string) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });

// ── Shared sub-components ───────────────────────────────────────

function StatCard({
  label, value, icon, color = C.indigo, sub, trend, compact,
}: {
  label: string; value: any; icon: string;
  color?: string; sub?: string; trend?: { up: boolean; text: string }; compact?: boolean;
}) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: compact ? '14px 16px' : '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: compact ? 22 : 26, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
          {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
          {trend && (
            <div style={{ fontSize: 10, marginTop: 4, color: trend.up ? C.green : C.red, fontWeight: 700 }}>
              {trend.up ? '▲' : '▼'} {trend.text}
            </div>
          )}
        </div>
        <div style={{
          width: compact ? 38 : 44, height: compact ? 38 : 44, borderRadius: 12,
          background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: compact ? 18 : 22, flexShrink: 0,
        }}>{icon}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: any }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 20px', ...style,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Legend2({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
      {items.map(i => (
        <span key={i.label} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.color, display: 'inline-block' }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ProgressBar({ label, value, max, color = C.indigo }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${pct}%`, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}

// ── Custom tooltip ───────────────────────────────────────────────
const TipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

// ═══════════════════════════════════════════════════════════════════
//  EMPLOYEE personal dashboard
// ═══════════════════════════════════════════════════════════════════
function EmployeeDashboard({ userId, userName }: { userId: string; userName?: string }) {
  const [dash,    setDash]    = useState<any>(null);
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [attend,  setAttend]  = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API.get('/kpi/dashboard'),
      API.get('/tasks', { params: { limit: 6, sortBy: 'createdAt', sortOrder: 'desc' } }),
      API.get('/attendance', { params: { limit: 30 } }).catch(() => ({ data: { data: [] } })),
    ]).then(([d, t, a]) => {
      setDash(d.data.data);
      setTasks(t.data.data || []);
      // compute attendance summary
      const recs = a.data.data || [];
      const present = recs.filter((r: any) => r.status === 'PRESENT').length;
      const late    = recs.filter((r: any) => r.isLate).length;
      const absent  = recs.filter((r: any) => r.status === 'ABSENT').length;
      setAttend({ present, late, absent, total: recs.length });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  if (loading) return <Spinner />;

  const s = dash?.summary || {};
  const total     = s.totalTasks     ?? 0;
  const completed = s.completedTasks ?? 0;
  const inProg    = s.inProgressTasks ?? 0;
  const overdue   = s.overdueTask    ?? 0;
  const pending   = total - completed - inProg - overdue;
  const compRate  = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Donut data
  const taskDonut = [
    { name: 'Completed',  value: completed, color: C.green },
    { name: 'In Progress',value: inProg,    color: C.amber },
    { name: 'Overdue',    value: overdue,   color: C.red   },
    { name: 'Pending',    value: pending > 0 ? pending : 0, color: C.blue },
  ].filter(d => d.value > 0);

  const attendDonut = attend ? [
    { name: 'Present', value: attend.present, color: C.green  },
    { name: 'Late',    value: attend.late,    color: C.amber  },
    { name: 'Absent',  value: attend.absent,  color: C.red    },
  ].filter(d => d.value > 0) : [];

  const STATUS_COLOR: Record<string, string> = {
    COMPLETED: C.green, IN_PROGRESS: C.amber, PENDING: C.blue,
    REJECTED: C.red, ACCEPTED: C.indigo, ON_HOLD: C.purple,
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Welcome banner */}
      <div style={{
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        background: `linear-gradient(135deg, ${C.pg} 0%, #8B0D1F 100%)`,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, opacity: .75, marginBottom: 4 }}>
            {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            Welcome back{userName ? `, ${userName}` : ''} 👋
          </div>
          <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>
            You have <strong>{inProg}</strong> tasks in progress and <strong>{overdue}</strong> overdue
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 36, fontWeight: 900 }}>{s.totalPoints ?? 0}</div>
          <div style={{ fontSize: 11, opacity: .7 }}>⭐ Total Points</div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Tasks"    value={total}       icon="📋" color={C.indigo} compact />
        <StatCard label="Completed"      value={completed}   icon="✅" color={C.green}  compact />
        <StatCard label="In Progress"    value={inProg}      icon="⚡" color={C.amber}  compact />
        <StatCard label="Overdue"        value={overdue}     icon="⏰" color={C.red}    compact />
        <StatCard label="Completion Rate" value={`${compRate}%`} icon="📈" color={C.blue} compact />
        <StatCard label="Present (30d)"  value={attend?.present ?? 0} icon="📅" color={C.teal} compact sub={`${attend?.late ?? 0} late`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Task breakdown donut */}
        <ChartCard title="📋 My Tasks Breakdown">
          {taskDonut.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={taskDonut} cx="50%" cy="50%" innerRadius={48} outerRadius={78}
                    paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {taskDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={taskDonut.map(d => ({ color: d.color, label: `${d.name} (${d.value})` }))} />
            </>
          ) : <Empty text="No tasks yet" />}
        </ChartCard>

        {/* Attendance donut */}
        <ChartCard title="📅 Attendance (Last 30 Days)">
          {attendDonut.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={attendDonut} cx="50%" cy="50%" innerRadius={48} outerRadius={78}
                    paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {attendDonut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={attendDonut.map(d => ({ color: d.color, label: `${d.name} (${d.value})` }))} />
            </>
          ) : <Empty text="No attendance records" />}
        </ChartCard>
      </div>

      {/* Task progress bars */}
      <ChartCard title="📊 Task Progress" style={{ marginBottom: 14 }}>
        <ProgressBar label="Completed"   value={completed} max={total} color={C.green} />
        <ProgressBar label="In Progress" value={inProg}    max={total} color={C.amber} />
        <ProgressBar label="Overdue"     value={overdue}   max={total} color={C.red}   />
        <ProgressBar label="Pending"     value={pending > 0 ? pending : 0} max={total} color={C.blue} />
      </ChartCard>

      {/* Recent tasks */}
      <ChartCard title="🗂 Recent Tasks">
        {tasks.length === 0 ? <Empty text="No tasks found" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((t: any) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10, background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString()}` : 'No due date'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                    background: `${PRIO_COLOR[t.priority] || C.blue}18`,
                    color: PRIO_COLOR[t.priority] || C.blue, fontWeight: 700,
                  }}>{t.priority}</span>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                    background: `${STATUS_COLOR[t.status] || C.indigo}18`,
                    color: STATUS_COLOR[t.status] || C.indigo, fontWeight: 700,
                  }}>{t.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TEAM LEADER dashboard  (personal + their team)
// ═══════════════════════════════════════════════════════════════════
function TeamLeaderDashboard() {
  const { user } = useAuth();
  const [dash,   setDash]   = useState<any>(null);
  const [team,   setTeam]   = useState<any>(null);
  const [tasks,  setTasks]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/kpi/dashboard'),
      API.get('/tasks', { params: { limit: 5, sortBy: 'createdAt', sortOrder: 'desc' } }),
    ]).then(([d, t]) => {
      const dashData = d.data.data;
      setDash(dashData);
      setTasks(t.data.data || []);
      // Load team stats if user has a team
      const teamId = dashData?.team?.id;
      if (teamId) {
        return API.get(`/kpi/team/${teamId}`).then(r => setTeam(r.data.data));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const s = dash?.summary || {};
  const memberStats = team?.memberKPIs || [];

  const teamTaskData = team?.taskStats
    ? team.taskStats.map((t: any) => ({ name: t.status.replace('_', ' '), value: t._count._all, color: PIE_COLORS[0] }))
    : [];

  return (
    <div style={{ padding: 20 }}>
      {/* Welcome banner */}
      <div style={{
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        background: `linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)`,
        color: '#fff',
      }}>
        <div style={{ fontSize: 13, opacity: .75, marginBottom: 4 }}>Team Leader</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>
          {user?.firstName} {user?.lastName}'s Dashboard
        </div>
        <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>
          Team: <strong>{dash?.team?.name || '—'}</strong> · {memberStats.length} members
        </div>
      </div>

      {/* My stats */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6,
        textTransform: 'uppercase', marginBottom: 10 }}>My Stats</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="My Tasks"     value={s.totalTasks      ?? 0} icon="📋" color={C.indigo}  compact />
        <StatCard label="Completed"    value={s.completedTasks  ?? 0} icon="✅" color={C.green}   compact />
        <StatCard label="In Progress"  value={s.inProgressTasks ?? 0} icon="⚡" color={C.amber}   compact />
        <StatCard label="Overdue"      value={s.overdueTask     ?? 0} icon="⏰" color={C.red}     compact />
        <StatCard label="Points"       value={`⭐ ${s.totalPoints ?? 0}`} icon="🏆" color={C.purple} compact />
        <StatCard label="Present Today" value={s.todayAttendance ?? 0} icon="📅" color={C.teal}  compact />
      </div>

      {team && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: .6,
            textTransform: 'uppercase', marginBottom: 10 }}>Team Overview</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Team task breakdown */}
            <ChartCard title="📋 Team Task Distribution">
              {teamTaskData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={teamTaskData} cx="50%" cy="50%" innerRadius={48} outerRadius={78}
                        paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {teamTaskData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Legend2 items={teamTaskData.map((d: any, i: number) => ({
                    color: PIE_COLORS[i % PIE_COLORS.length],
                    label: `${d.name} (${d.value})`,
                  }))} />
                </>
              ) : <Empty text="No team task data" />}
            </ChartCard>

            {/* Member productivity */}
            <ChartCard title="👥 Member Productivity">
              {memberStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={memberStats.slice(0, 6).map((m: any) => ({
                    name: m.user ? `${m.user.firstName?.[0]}.${m.user.lastName?.[0] ?? ''}` : '?',
                    score: Math.round(m.avgProductivity || 0),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Score']} contentStyle={TipStyle} />
                    <Bar dataKey="score" fill={C.indigo} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No member data" />}
            </ChartCard>
          </div>

          {/* Member cards */}
          <ChartCard title="👥 Team Members">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
              {memberStats.map((m: any, i: number) => (
                <div key={m.userId} style={{
                  padding: '12px 14px', borderRadius: 10, background: 'var(--bg)',
                  border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: PIE_COLORS[i % PIE_COLORS.length],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                  }}>
                    {m.user?.firstName?.[0]}{m.user?.lastName?.[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.user?.firstName} {m.user?.lastName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {m.completedTasks ?? 0} done · {Math.round(m.avgProductivity || 0)}% score
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </>
      )}

      {/* Recent tasks */}
      {tasks.length > 0 && (
        <ChartCard title="🗂 My Recent Tasks" style={{ marginTop: 14 }}>
          {tasks.map((t: any) => (
            <div key={t.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 12px', borderRadius: 8, marginBottom: 6, background: 'var(--bg)',
            }}>
              <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 99, marginLeft: 8,
                background: `${PRIO_COLOR[t.priority] || C.blue}18`,
                color: PRIO_COLOR[t.priority] || C.blue, fontWeight: 700, flexShrink: 0,
              }}>{t.status.replace('_', ' ')}</span>
            </div>
          ))}
        </ChartCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN / SUPER_ADMIN company-wide dashboard
// ═══════════════════════════════════════════════════════════════════
function AdminDashboard() {
  const [dash,    setDash]    = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/kpi/dashboard'),
      API.get('/kpi/company').catch(() => ({ data: { data: null } })),
    ]).then(([d, c]) => {
      setDash(d.data.data);
      setCompany(c.data.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const s       = dash?.summary || {};
  const trend   = buildTrend(company?.productivityTrend || []);
  const taskPie = buildTaskPie(company?.overallTasks || []);
  const priority = (company?.workloadByPriority || []).map((p: any) => ({
    name: p.priority, count: p._count._all,
  }));
  const deptData = (company?.deptStats || []).map((d: any) => ({
    name:       d.departmentName?.slice(0, 10) || '—',
    total:      Number(d.totalTasks  || 0),
    completed:  Number(d.completed   || 0),
    inProgress: Number(d.inProgress  || 0),
    rate:       Number(d.completionRate || 0),
    head:       Number(d.headCount   || 0),
  }));

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: 'var(--text)' }}>Company Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
          {new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px,1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Tasks"    value={s.totalTasks     ?? 0} icon="📋" color={C.indigo} sub="all time" />
        <StatCard label="Completed"      value={s.completedTasks ?? 0} icon="✅" color={C.green}  />
        <StatCard label="In Progress"    value={s.inProgressTasks?? 0} icon="⚡" color={C.amber}  />
        <StatCard label="Overdue"        value={s.overdueTask    ?? 0} icon="⏰" color={C.red}    />
        <StatCard label="Escalated"      value={s.escalatedTasks ?? 0} icon="🚨" color={C.red}    />
        <StatCard label="Productivity"   value={pct(s.productivityScore)} icon="📈" color={C.blue} />
        <StatCard label="Active Users"   value={s.activeUsers    ?? 0} icon="🟢" color={C.green}  sub={`of ${s.totalUsers ?? 0}`} />
        <StatCard label="Present Today"  value={s.todayAttendance?? 0} icon="📅" color={C.teal}   />
      </div>

      {/* Trend + Task pie */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, marginBottom: 14 }}>
        <ChartCard title="📈 Productivity Score Trend (30 days)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.indigo} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'Score']} contentStyle={TipStyle} />
              <Area type="monotone" dataKey="score" stroke={C.indigo} fill="url(#ga)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🍩 Task Status">
          {taskPie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={taskPie} cx="50%" cy="50%" innerRadius={52} outerRadius={85}
                    paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {taskPie.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={taskPie.map((t: any, i: number) => ({
                color: PIE_COLORS[i % PIE_COLORS.length],
                label: `${t.name} (${t.value})`,
              }))} />
            </>
          ) : <Empty text="No task data" />}
        </ChartCard>
      </div>

      {/* Work hours + Priority */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <ChartCard title="⏱ Avg Daily Work Hours">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <Tooltip formatter={(v: any) => [`${v}h`, 'Hours']} contentStyle={TipStyle} />
              <Bar dataKey="hours" fill={C.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🔥 Active Tasks by Priority">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priority} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} width={65} />
              <Tooltip contentStyle={TipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {priority.map((p: any, i: number) => <Cell key={i} fill={PRIO_COLOR[p.name] || C.blue} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Department comparison */}
      {deptData.length > 0 && (
        <ChartCard title="🏛 Department Performance" style={{ marginBottom: 14 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <Tooltip contentStyle={TipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed"  name="Completed"   fill={C.green}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="inProgress" name="In Progress" fill={C.amber}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="total"      name="Total"       fill={C.indigo} radius={[4, 4, 0, 0]} fillOpacity={.35} />
            </BarChart>
          </ResponsiveContainer>
          {/* Completion rate progress bars */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {deptData.map((d: any) => (
              <ProgressBar key={d.name} label={`${d.name} (${d.head} people)`} value={d.rate} max={100} color={C.green} />
            ))}
          </div>
        </ChartCard>
      )}

      {/* SLA + Productivity side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <ChartCard title="📉 Productivity vs Work Hours">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <YAxis yAxisId="s" domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <YAxis yAxisId="h" orientation="right" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
              <Tooltip contentStyle={TipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="s" type="monotone" dataKey="score" name="Score %" stroke={C.indigo} strokeWidth={2} dot={false} />
              <Line yAxisId="h" type="monotone" dataKey="hours" name="Hours" stroke={C.green}  strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="🚀 SLA & Avg Productivity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: C.indigo }}>
                {pct(company?.avgProductivity)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Avg Productivity Score</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: C.red }}>
                {company?.slaBreaches ?? 0}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>SLA Breaches (period)</div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top performers */}
      {(company?.topPerformers?.length ?? 0) > 0 && (
        <ChartCard title="🏆 Top Performers">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            {company.topPerformers.slice(0, 8).map((u: any, i: number) => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: i < 3
                    ? ['linear-gradient(135deg,#FFD700,#FFA500)', 'linear-gradient(135deg,#C0C0C0,#A8A8A8)', 'linear-gradient(135deg,#CD7F32,#A0522D)'][i]
                    : PIE_COLORS[i % PIE_COLORS.length],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                }}>
                  {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${u.firstName?.[0]}${u.lastName?.[0]}`}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.firstName} {u.lastName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>⭐ {(u.totalPoints || 0).toLocaleString()} pts</div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MANAGER dashboard — company overview + view any employee
// ═══════════════════════════════════════════════════════════════════
function ManagerDashboard() {
  return <AdminDashboard />;
}

// ═══════════════════════════════════════════════════════════════════
//  ROOT — picks the right dashboard by role
// ═══════════════════════════════════════════════════════════════════
export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || '';

  if (role === 'EMPLOYEE') {
    return <EmployeeDashboard userId={user!.id} userName={user?.firstName} />;
  }
  if (role === 'TEAM_LEADER') {
    return <TeamLeaderDashboard />;
  }
  if (role === 'MANAGER') {
    return <ManagerDashboard />;
  }
  // SUPER_ADMIN, ADMIN
  return <AdminDashboard />;
}

// ── Shared utilities ────────────────────────────────────────────
function buildTrend(raw: any[]) {
  return raw.map((t: any) => ({
    date:  short(t.date),
    score: Math.round(t._avg?.productivityScore || 0),
    hours: Math.round((t._avg?.totalWorkHours || 0) * 10) / 10,
  }));
}

function buildTaskPie(raw: any[]) {
  return raw.map((t: any) => ({
    name:  t.status.replace(/_/g, ' '),
    value: t._count._all,
  }));
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--border)`, borderTopColor: C.pg, animation: 'pg-spin .8s linear infinite' }} />
      <span style={{ fontSize: 13 }}>Loading dashboard…</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: 13 }}>
      {text}
    </div>
  );
}
