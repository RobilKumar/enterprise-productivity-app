import React, { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API } from '../App';

const COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899'];

function KpiCard({ label, value, icon, color, sub }: any) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
      <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
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

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Loading dashboard…</div>;

  const s = dash?.summary || {};
  const trend = (company?.productivityTrend || []).map((t: any) => ({
    date:  new Date(t.date).toLocaleDateString('en',{month:'short',day:'numeric'}),
    score: Math.round(t._avg?.productivityScore || 0),
    hours: Math.round((t._avg?.totalWorkHours || 0) * 10) / 10,
  }));
  const taskStatus = (company?.overallTasks || []).map((t: any) => ({ name: t.status.replace('_',' '), value: t._count._all }));
  const priority   = (company?.workloadByPriority || []).map((p: any) => ({ name: p.priority, count: p._count._all }));
  const PCOLORS: any = { CRITICAL:'#EF4444', HIGH:'#F59E0B', MEDIUM:'#3B82F6', LOW:'#10B981' };

  return (
    <div className="m-page" style={{ padding:24 }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Dashboard</h1>
      <p style={{ color:'var(--muted)', fontSize:13, marginBottom:20 }}>
        {new Date().toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
      </p>

      <div className="m-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        <KpiCard label="Total Tasks"    value={s.totalTasks    ??0} icon="📋" color="#6366F1" />
        <KpiCard label="Completed"      value={s.completedTasks??0} icon="✅" color="#10B981" />
        <KpiCard label="In Progress"    value={s.inProgressTasks??0} icon="⚡" color="#F59E0B" />
        <KpiCard label="Overdue"        value={s.overdueTask   ??0} icon="⏰" color="#EF4444" />
        <KpiCard label="Escalated"      value={s.escalatedTasks??0} icon="🚨" color="#DC2626" />
        <KpiCard label="Productivity"   value={`${s.productivityScore??0}%`} icon="📈" color="#6366F1" />
        <KpiCard label="Active Users"   value={s.activeUsers   ??0} icon="🟢" color="#10B981" sub={`of ${s.totalUsers??0} total`} />
        <KpiCard label="Present Today"  value={s.todayAttendance??0} icon="📅" color="#3B82F6" />
      </div>

      <div className="m-chart-grid" style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14, marginBottom:14 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:13, fontWeight:600, marginBottom:14, margin:'0 0 14px' }}>Productivity Score Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize:10, fill:'var(--muted)' }} />
              <YAxis tick={{ fontSize:10, fill:'var(--muted)' }} domain={[0,100]} />
              <Tooltip formatter={(v:any)=>[`${v}%`,'Score']} contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8 }} />
              <Area type="monotone" dataKey="score" stroke="#6366F1" fill="url(#g1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Task Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={taskStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                {taskStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
            {taskStatus.map((t: any, i: number) => (
              <span key={t.name} style={{ fontSize:10, display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:COLORS[i%COLORS.length], display:'inline-block' }}/>
                {t.name} ({t.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="m-chart-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Daily Work Hours Avg</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize:9, fill:'var(--muted)' }} />
              <YAxis tick={{ fontSize:9, fill:'var(--muted)' }} />
              <Tooltip formatter={(v:any)=>[`${v}h`,'Hours']} contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8 }} />
              <Bar dataKey="hours" fill="#10B981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>Active Tasks by Priority</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={priority} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize:9, fill:'var(--muted)' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize:9, fill:'var(--muted)' }} width={65} />
              <Tooltip contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8 }} />
              <Bar dataKey="count" radius={[0,4,4,0]}>
                {priority.map((p: any, i: number) => <Cell key={i} fill={PCOLORS[p.name]||'#6B7280'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {company?.topPerformers?.length > 0 && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
          <h3 style={{ fontSize:13, fontWeight:600, margin:'0 0 14px' }}>🏆 Top Performers</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:10 }}>
            {company.topPerformers.slice(0,8).map((u: any, i: number) => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg)', borderRadius:10 }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:COLORS[i%COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color: i<3?'#000':'#fff', fontWeight:700, fontSize:13, flexShrink:0 }}>
                  {i<3 ? ['🥇','🥈','🥉'][i] : `${u.firstName?.[0]}${u.lastName?.[0]}`}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{u.firstName} {u.lastName}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>⭐ {u.totalPoints?.toLocaleString()} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
