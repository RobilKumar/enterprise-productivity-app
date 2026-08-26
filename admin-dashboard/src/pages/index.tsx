import React, { useEffect, useState, useCallback } from 'react';
import { API } from '../lib/api';

/* ─── shared style helpers ──────────────────────────────────────── */
const cardStyle: React.CSSProperties = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const thStyle:   React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle:   React.CSSProperties = { padding: '12px 16px' };
const inputSt:   React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '9px 20px', borderRadius: 10, background: '#C8102E', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(200,16,46,.25)', display:'inline-flex', alignItems:'center', gap:6 };
const btnSecondary: React.CSSProperties = { padding: '9px 18px', borderRadius: 10, background: 'transparent', color: 'var(--text)', border: '1.5px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const btnDanger: React.CSSProperties  = { padding: '5px 12px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
const btnSuccess: React.CSSProperties = { padding: '5px 12px', borderRadius: 8, background: '#D1FAE5', color: '#059669', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
const labelSt:   React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--muted)', textTransform: 'uppercase' };
const tableScroll: React.CSSProperties = { overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any };

const STATUS_COLORS: Record<string, string> = { ACTIVE: '#10B981', INACTIVE: '#6B7280', SUSPENDED: '#EF4444', ON_LEAVE: '#F59E0B' };

/* ─── Modal wrapper ─────────────────────────────────────────────── */
function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: width, background: 'var(--card)', borderRadius: 16, padding: '20px 18px 24px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, paddingRight: 12 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', flexShrink: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EMPLOYEES PAGE — full CRUD
══════════════════════════════════════════════════════════════════════ */
export function EmployeesPage() {
  const storedUser  = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const currentRole = storedUser?.role || '';
  const canChangeId = ['SUPER_ADMIN', 'ADMIN'].includes(currentRole);

  const [users,   setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [statusF, setStatusF] = useState('');

  // lookup data for dropdowns
  const [roles,    setRoles]    = useState<any[]>([]);
  const [depts,    setDepts]    = useState<any[]>([]);
  const [teams,    setTeams]    = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // modal state
  const [modal,   setModal]   = useState<'add' | 'edit' | 'view' | null>(null);
  const [target,  setTarget]  = useState<any>(null);
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  // bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile,      setBulkFile]      = useState<File | null>(null);
  const [bulkResult,    setBulkResult]    = useState<any>(null);
  const [bulkLoading,   setBulkLoading]   = useState(false);
  const [bulkErr,       setBulkErr]       = useState('');

  // password reset state
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwTarget,    setPwTarget]    = useState<any>(null);
  const [newPw,       setNewPw]       = useState('');
  const [pwLoading,   setPwLoading]   = useState(false);
  const [pwErr,       setPwErr]       = useState('');
  const [pwOk,        setPwOk]        = useState(false);

  const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', password: '', roleId: '', departmentId: '', teamId: '', reportingManagerId: '', employeeId: '' };
  const [form, setForm] = useState(EMPTY_FORM);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/users', {
        params: { page, limit: LIMIT, search: search || undefined, status: statusF || undefined },
      });
      setUsers(data.data || []);
      setTotal(data.pagination?.total ?? 0);
    } catch {}
    setLoading(false);
  }, [page, search, statusF]);

  useEffect(() => { load(); }, [load]);

  // load dropdowns once
  useEffect(() => {
    API.get('/roles').then(r => setRoles(r.data.data || [])).catch(() => {});
    API.get('/departments').then(r => setDepts(r.data.data || [])).catch(() => {});
    API.get('/teams').then(r => setTeams(r.data.data || []))  .catch(() => {});
    API.get('/users', { params: { limit: 300 } }).then(r => setAllUsers(r.data.data || [])).catch(() => {});
  }, []);

  function openAdd() {
    setTarget(null);
    setForm(EMPTY_FORM);
    setErrMsg('');
    setModal('add');
  }

  function openEdit(u: any) {
    setTarget(u);
    setForm({
      firstName:          u.firstName || '',
      lastName:           u.lastName  || '',
      email:              u.email     || '',
      phone:              u.phone     || '',
      password:           '',
      roleId:             u.role?.id  || '',
      departmentId:       u.department?.id || '',
      teamId:             u.team?.id  || '',
      reportingManagerId: u.reportingManagerId || '',
      employeeId:         u.employeeId || '',
    });
    setErrMsg('');
    setModal('edit');
  }

  async function handleSave() {
    setSaving(true); setErrMsg('');
    try {
      let savedId: string | null = null;

      if (modal === 'add') {
        // create via auth/register
        const payload: any = {
          firstName: form.firstName,
          lastName:  form.lastName,
          email:     form.email,
          password:  form.password,
          roleId:    form.roleId,
        };
        if (form.phone)        payload.phone        = form.phone;
        if (form.departmentId) payload.departmentId = form.departmentId;
        if (form.teamId)       payload.teamId       = form.teamId;
        if (form.employeeId)   payload.employeeId   = form.employeeId.trim().toUpperCase();
        const res = await API.post('/auth/register', payload);
        // extract new user id from response (various response shapes)
        savedId = res.data?.data?.user?.id || res.data?.data?.id || res.data?.user?.id || null;
      } else {
        // If Employee ID changed and user has permission, update it first
        const trimmedId = form.employeeId.trim().toUpperCase();
        if (canChangeId && trimmedId && trimmedId !== (target.employeeId || '').toUpperCase()) {
          if (!/^[A-Z0-9_\-]{1,20}$/.test(trimmedId)) {
            setErrMsg('Employee ID: use 1–20 letters/digits/_ or - only');
            setSaving(false);
            return;
          }
          await API.patch(`/users/${target.id}/employee-id`, { newEmployeeId: trimmedId });
        }
        // update other fields via users/:id
        const payload: any = {
          firstName:    form.firstName,
          lastName:     form.lastName,
          phone:        form.phone || undefined,
          roleId:       form.roleId       || undefined,
          departmentId: form.departmentId || undefined,
          teamId:       form.teamId       || undefined,
        };
        await API.put(`/users/${target.id}`, payload);
        savedId = target.id;
      }

      // Assign / clear Reporting Manager (for gatepass approval routing)
      if (savedId && (modal === 'edit' || form.reportingManagerId)) {
        await API.patch(`/gatepass/users/${savedId}/set-rm`, {
          reportingManagerId: form.reportingManagerId || null,
        }).catch(() => {}); // non-blocking — don't fail the whole save
      }

      setModal(null);
      load();
      // refresh allUsers so RM names stay up-to-date in dropdowns
      API.get('/users', { params: { limit: 300 } }).then(r => setAllUsers(r.data.data || [])).catch(() => {});
    } catch (e: any) {
      setErrMsg(e.response?.data?.message || 'Failed to save. Check all required fields.');
    }
    setSaving(false);
  }

  async function toggleStatus(u: any) {
    const next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await API.put(`/users/${u.id}`, { status: next });
      load();
    } catch {}
  }

  async function downloadTemplate() {
    try {
      const res = await API.get('/users/bulk-upload/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'employee-bulk-upload-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Could not download template.'); }
  }

  async function submitBulkUpload() {
    if (!bulkFile) return;
    setBulkLoading(true); setBulkErr(''); setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append('file', bulkFile);
      const { data } = await API.post('/users/bulk-upload', fd);
      setBulkResult(data.data);
      setBulkFile(null);
      load();
    } catch (e: any) {
      setBulkErr(e.response?.data?.message || 'Upload failed. Check the file and try again.');
    }
    setBulkLoading(false);
  }

  function openPwModal(u: any) {
    setPwTarget(u); setNewPw(''); setPwErr(''); setPwOk(false); setShowPwModal(true);
  }

  async function submitPwChange() {
    if (!newPw || newPw.length < 8) { setPwErr('Password must be at least 8 characters'); return; }
    setPwLoading(true); setPwErr(''); setPwOk(false);
    try {
      await API.patch(`/users/${pwTarget.id}/change-password`, { newPassword: newPw });
      setPwOk(true); setNewPw('');
    } catch (e: any) {
      setPwErr(e.response?.data?.message || 'Failed to change password');
    }
    setPwLoading(false);
  }

  const f = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const totalPages = Math.ceil(total / LIMIT) || 1;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Employee Management</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>{total} total employees</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setBulkFile(null); setBulkResult(null); setBulkErr(''); setShowBulkModal(true); }}
            style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📊 Bulk Upload
          </button>
          <button onClick={openAdd} style={btnPrimary}>+ Add Employee</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, email, ID..."
          style={{ ...inputSt, flex: 1, minWidth: 200 }} />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} style={{ ...inputSt, width: 150 }}>
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <button onClick={load} style={btnSecondary}>↻ Refresh</button>
      </div>

      {/* Table */}
      <div style={cardStyle}>
        <div style={tableScroll}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              {['Employee', 'ID', 'Department / Team', 'Role', 'Status', 'Points', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)' }}>Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No employees found</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {u.firstName?.[0]}{u.lastName?.[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{u.firstName} {u.lastName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{u.employeeId}</td>
                <td style={tdStyle}>
                  <div style={{ fontSize: 13 }}>{u.department?.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.team?.name || ''}</div>
                  {u.reportingManagerId && (() => {
                    const rm = allUsers.find((a: any) => a.id === u.reportingManagerId);
                    return rm ? <div style={{ fontSize: 10, color: '#6366F1', marginTop: 2 }}>👤 RM: {rm.firstName} {rm.lastName}</div> : null;
                  })()}
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#EEF2FF', color: '#6366F1', fontWeight: 600, fontSize: 11 }}>
                    {u.role?.displayName || u.role?.name}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[u.status] || '#6B7280', background: `${STATUS_COLORS[u.status] || '#6B7280'}20` }}>
                    {u.isOnline ? '🟢 ' : ''}{u.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#6366F1', fontSize: 13 }}>⭐ {u.totalPoints?.toLocaleString() || 0}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setTarget(u); setModal('view'); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 11 }}>
                      View
                    </button>
                    <button onClick={() => openEdit(u)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #6366F1', color: '#6366F1', background: 'transparent', cursor: 'pointer', fontSize: 11 }}>
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(u)}
                      style={u.status === 'ACTIVE' ? btnDanger : btnSuccess}>
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>{/* end tableScroll */}

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {total > 0 ? `Showing ${((page - 1) * LIMIT) + 1}–${Math.min(page * LIMIT, total)} of ${total}` : '0 records'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...btnSecondary, padding: '5px 12px', fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
            <span style={{ padding: '5px 12px', fontSize: 12 }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
              style={{ ...btnSecondary, padding: '5px 12px', fontSize: 12, opacity: page >= totalPages ? 0.4 : 1 }}>Next →</button>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────── */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add New Employee' : `Edit — ${target?.firstName} ${target?.lastName}`} onClose={() => setModal(null)}>
          {/* Employee ID — shown for both add and edit */}
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10,
            background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '1.5px solid #BFDBFE' }}>
            <label style={{ ...labelSt, color: '#1D4ED8' }}>
              🪪 Employee ID (Login ID)
              {modal === 'add' && <span style={{ fontWeight: 400, marginLeft: 4 }}>*</span>}
              {modal === 'edit' && !canChangeId && <span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 6 }}>(read-only)</span>}
            </label>
            <input
              style={{ ...inputSt, fontFamily:'monospace', fontWeight:700, letterSpacing:1,
                textTransform:'uppercase', color:'#1D4ED8',
                ...(modal === 'edit' && !canChangeId ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
              value={form.employeeId}
              readOnly={modal === 'edit' && !canChangeId}
              onChange={e => f('employeeId', e.target.value.toUpperCase())}
              placeholder={modal === 'add' ? 'e.g. EMP00010 or PGT001' : ''}
            />
            {modal === 'add' && (
              <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 5 }}>
                ℹ️ This will be the employee's <strong>login ID</strong>. Leave blank to auto-generate (EMP00001, EMP00002…)
              </div>
            )}
            {modal === 'edit' && canChangeId && (
              <div style={{ fontSize: 11, color: '#D97706', marginTop: 5 }}>
                ⚠️ Changing this ID means the employee must use the new ID to log in.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelSt}>First Name *</label>
              <input style={inputSt} value={form.firstName} onChange={e => f('firstName', e.target.value)} placeholder="First name" />
            </div>
            <div>
              <label style={labelSt}>Last Name *</label>
              <input style={inputSt} value={form.lastName} onChange={e => f('lastName', e.target.value)} placeholder="Last name" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={labelSt}>Email Address *</label>
            <input type="email" style={inputSt} value={form.email} onChange={e => f('email', e.target.value)} placeholder="employee@company.com" readOnly={modal === 'edit'} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={labelSt}>Phone</label>
            <input style={inputSt} value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          {modal === 'add' && (
            <div style={{ marginTop: 14 }}>
              <label style={labelSt}>Password * (min 8 chars, must include A-Z, 0-9, special)</label>
              <input type="password" style={inputSt} value={form.password} onChange={e => f('password', e.target.value)} placeholder="e.g. Pass@1234" />
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <label style={labelSt}>Role *</label>
            <select style={inputSt} value={form.roleId} onChange={e => f('roleId', e.target.value)}>
              <option value="">— Select role —</option>
              {roles.map((r: any) => <option key={r.id} value={r.id}>{r.displayName || r.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginTop: 14 }}>
            <div>
              <label style={labelSt}>Department</label>
              <select style={inputSt} value={form.departmentId} onChange={e => f('departmentId', e.target.value)}>
                <option value="">— None —</option>
                {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Team</label>
              <select style={inputSt} value={form.teamId} onChange={e => f('teamId', e.target.value)}>
                <option value="">— None —</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Reporting Manager ── */}
          <div style={{ marginTop: 14 }}>
            <label style={labelSt}>Reporting Manager 👤</label>
            <select style={inputSt} value={form.reportingManagerId} onChange={e => f('reportingManagerId', e.target.value)}>
              <option value="">— None (defaults to Team Leader) —</option>
              {allUsers
                .filter(u => u.id !== target?.id)
                .map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                    {u.role?.displayName ? ` · ${u.role.displayName}` : u.role?.name ? ` · ${u.role.name}` : ''}
                  </option>
                ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
              🚪 Gatepass requests from this employee will go to the selected person for approval.
              If left blank, requests route to their Team Leader.
            </div>
          </div>

          {errMsg && <p style={{ color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 14 }}>{errMsg}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <div>
              {modal === 'edit' && canChangeId && (
                <button onClick={() => { setModal(null); openPwModal(target); }}
                  style={{ ...btnSecondary, color: '#7C3AED', borderColor: '#C4B5FD' }}>
                  🔑 Reset Password
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Employee' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── View Detail Modal ─────────────────────────────────── */}
      {modal === 'view' && target && (
        <Modal title="Employee Details" onClose={() => setModal(null)} width={440}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
              {target.firstName?.[0]}{target.lastName?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{target.firstName} {target.lastName}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{target.email}</div>
            </div>
          </div>

          {/* Login ID callout */}
          <div style={{ padding: '12px 14px', borderRadius: 10, marginBottom: 16,
            background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '1.5px solid #BFDBFE',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#3B82F6', letterSpacing: .8,
                textTransform: 'uppercase', marginBottom: 4 }}>🪪 Login ID (Employee ID)</div>
              <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900,
                color: '#1D4ED8', letterSpacing: 2 }}>{target.employeeId}</div>
            </div>
            <div style={{ fontSize: 10, color: '#3B82F6', textAlign: 'right', maxWidth: 120, lineHeight: 1.5 }}>
              Employee uses this ID to sign in to the app
            </div>
          </div>

          {[
            ['Employee ID', target.employeeId],
            ['Role',        target.role?.displayName || target.role?.name],
            ['Department',  target.department?.name || '—'],
            ['Team',        target.team?.name || '—'],
            ['Reporting Manager', (() => {
              const rm = allUsers.find((u: any) => u.id === target.reportingManagerId);
              return rm ? `${rm.firstName} ${rm.lastName}` : '— (Team Leader fallback)';
            })()],
            ['Status',      target.status],
            ['Online',      target.isOnline ? '🟢 Online' : '⚫ Offline'],
            ['Points',      `⭐ ${target.totalPoints?.toLocaleString() || 0}`],
            ['Phone',       target.phone || '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={() => openEdit(target)} style={{ ...btnPrimary, flex: 1 }}>✏️ Edit</button>
            <button onClick={() => { toggleStatus(target); setModal(null); }}
              style={{ ...btnSecondary, flex: 1, color: target.status === 'ACTIVE' ? '#DC2626' : '#059669' }}>
              {target.status === 'ACTIVE' ? '🚫 Suspend' : '✅ Activate'}
            </button>
            {canChangeId && (
              <button onClick={() => { setModal(null); openPwModal(target); }}
                style={{ ...btnSecondary, width: '100%', color: '#7C3AED', borderColor: '#C4B5FD' }}>
                🔑 Reset Password
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Bulk Upload Modal ─────────────────────────────────── */}
      {showBulkModal && (
        <Modal title="📊 Bulk Upload Employees" onClose={() => setShowBulkModal(false)} width={560}>
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
            <p style={{ fontSize: 13, color: '#065F46', margin: 0 }}>
              Upload an Excel file (.xlsx) to create multiple employees at once. All created employees will receive a default password shown after upload.
            </p>
          </div>
          <button onClick={downloadTemplate}
            style={{ ...btnSecondary, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ⬇️ Download Template
          </button>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Select Excel File (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls"
              onChange={e => { setBulkFile(e.target.files?.[0] || null); setBulkResult(null); setBulkErr(''); }}
              style={{ ...inputSt, padding: '7px 10px' }} />
          </div>
          {bulkErr && <p style={{ color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{bulkErr}</p>}
          {bulkResult && (
            <div style={{ marginBottom: 14, padding: '14px', borderRadius: 10, background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
              <div style={{ fontWeight: 700, color: '#065F46', marginBottom: 8 }}>✅ Upload Complete</div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                <div><span style={{ fontWeight: 700, color: '#059669' }}>{bulkResult.summary?.created ?? 0}</span> <span style={{ fontSize: 12, color: '#065F46' }}>Created</span></div>
                <div><span style={{ fontWeight: 700, color: '#DC2626' }}>{bulkResult.summary?.failed ?? 0}</span> <span style={{ fontSize: 12, color: '#065F46' }}>Failed</span></div>
                <div><span style={{ fontWeight: 700 }}>{bulkResult.summary?.total ?? 0}</span> <span style={{ fontSize: 12, color: '#065F46' }}>Total Rows</span></div>
              </div>
              {bulkResult.defaultPassword && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: '#DBEAFE', border: '1px solid #BFDBFE', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#1D4ED8' }}>🔑 Default Password: </span>
                  <strong style={{ fontFamily: 'monospace', color: '#1D4ED8' }}>{bulkResult.defaultPassword}</strong>
                </div>
              )}
              {bulkResult.results?.filter((r: any) => r.status === 'failed').length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>Failed rows:</div>
                  {bulkResult.results.filter((r: any) => r.status === 'failed').slice(0, 10).map((r: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: '#DC2626', marginBottom: 2 }}>
                      Row {r.row}: {r.email} — {r.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setShowBulkModal(false)} style={btnSecondary}>Close</button>
            <button onClick={submitBulkUpload} disabled={!bulkFile || bulkLoading}
              style={{ ...btnPrimary, opacity: !bulkFile || bulkLoading ? 0.6 : 1 }}>
              {bulkLoading ? 'Uploading…' : '📤 Upload'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Password Reset Modal ──────────────────────────────── */}
      {showPwModal && pwTarget && (
        <Modal title={`🔑 Reset Password — ${pwTarget.firstName} ${pwTarget.lastName}`} onClose={() => setShowPwModal(false)} width={420}>
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
              As a Super Admin / Admin, you can set a new password for this employee. The employee will need to use the new password on their next login.
            </p>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>New Password (min 8 characters)</label>
            <input type="password" style={inputSt} value={newPw}
              onChange={e => { setNewPw(e.target.value); setPwErr(''); setPwOk(false); }}
              placeholder="Enter new password" />
          </div>
          {pwErr && <p style={{ color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{pwErr}</p>}
          {pwOk && <p style={{ color: '#059669', background: '#F0FDF4', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>✅ Password changed successfully!</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => setShowPwModal(false)} style={btnSecondary}>Close</button>
            <button onClick={submitPwChange} disabled={pwLoading || pwOk}
              style={{ ...btnPrimary, opacity: pwLoading || pwOk ? 0.7 : 1, background: '#7C3AED' }}>
              {pwLoading ? 'Saving…' : '🔑 Set Password'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TASKS MANAGEMENT PAGE — list + create
══════════════════════════════════════════════════════════════════════ */
export function TasksManagementPage() {
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [status,  setStatus]  = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState('');
  const [users,   setUsers]   = useState<any[]>([]);
  const [teams,   setTeams]   = useState<any[]>([]);

  const LIMIT = 25;
  const STATUSES = ['', 'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'REJECTED'];
  const SC: Record<string, string> = { COMPLETED: '#059669', REJECTED: '#DC2626', IN_PROGRESS: '#D97706', PENDING: '#6B7280', ACCEPTED: '#2563EB', ON_HOLD: '#9333EA' };
  const PC: Record<string, string> = { CRITICAL: '#DC2626', HIGH: '#F59E0B', MEDIUM: '#3B82F6', LOW: '#10B981' };

  const EMPTY_TASK = { title: '', description: '', assigneeId: '', teamId: '', priority: 'MEDIUM', dueDate: '', estimatedHours: '' };
  const [form, setForm] = useState(EMPTY_TASK);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/tasks', { params: { page, limit: LIMIT, status: status || undefined } });
      setTasks(data.data || []); setTotal(data.pagination?.total ?? 0);
    } catch {}
    setLoading(false);
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    API.get('/users', { params: { limit: 100 } }).then(r => setUsers(r.data.data || [])).catch(() => {});
    API.get('/teams').then(r => setTeams(r.data.data || [])).catch(() => {});
  }, []);

  async function createTask() {
    setSaving(true); setErrMsg('');
    try {
      const payload: any = {
        title:      form.title,
        assigneeId: form.assigneeId,
        priority:   form.priority,
      };
      if (form.description)    payload.description    = form.description;
      if (form.teamId)         payload.teamId         = form.teamId;
      if (form.dueDate)        payload.dueDate        = new Date(form.dueDate).toISOString();
      if (form.estimatedHours) payload.estimatedHours = Number(form.estimatedHours);
      await API.post('/tasks', payload);
      setShowAdd(false);
      setForm(EMPTY_TASK);
      load();
    } catch (e: any) {
      setErrMsg(e.response?.data?.message || 'Failed to create task');
    }
    setSaving(false);
  }

  const f = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const totalPages = Math.ceil(total / LIMIT) || 1;

  return (
    <div className="pg-page" style={{ padding: 24 }}>
      {/* Header */}
      <div className="pg-page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, marginBottom:3, letterSpacing:-.3 }}>Task Management</h1>
          <p style={{ color:'var(--muted)', fontSize:13 }}>{total} total tasks</p>
        </div>
        <div className="pg-page-actions">
          <button onClick={() => { setForm(EMPTY_TASK); setErrMsg(''); setShowAdd(true); }} style={btnPrimary}>
            + Create Task
          </button>
        </div>
      </div>

      {/* Status filter chips — horizontally scrollable */}
      <div className="chip-bar">
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`chip${status === s ? ' active' : ''}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* ── Desktop table ─────────────────────────────────── */}
      <div className="m-table" style={cardStyle}>
        <div style={tableScroll}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
            <thead>
              <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Title','Assignee','Team','Priority','Status','Due Date','Escalated'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', color:'var(--muted)', padding:40 }}>Loading…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign:'center', color:'var(--muted)', padding:40 }}>No tasks found. Create one above.</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...tdStyle, maxWidth:260 }}>
                    <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                    {t.category && <div style={{ fontSize:11, color:'var(--muted)' }}>{t.category}</div>}
                  </td>
                  <td style={{ ...tdStyle, fontSize:12 }}>{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '—'}</td>
                  <td style={{ ...tdStyle, fontSize:12, color:'var(--muted)' }}>{t.team?.name || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, color:PC[t.priority]||'#6B7280', background:`${PC[t.priority]||'#6B7280'}18` }}>{t.priority}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, color:SC[t.status]||'#6B7280', background:`${SC[t.status]||'#6B7280'}18` }}>{t.status?.replace('_',' ')}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize:12, color: t.dueDate && new Date(t.dueDate)<new Date() && t.status!=='COMPLETED' ? '#EF4444' : 'var(--muted)' }}>
                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontSize:12 }}>{t.isEscalated ? '🚨 Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--muted)', alignItems:'center' }}>
          <span>{total > 0 ? `Showing ${((page-1)*LIMIT)+1}–${Math.min(page*LIMIT,total)} of ${total}` : '0 tasks'}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ ...btnSecondary, padding:'5px 12px', opacity:page===1?0.4:1 }}>← Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={page>=totalPages} style={{ ...btnSecondary, padding:'5px 12px', opacity:page>=totalPages?0.4:1 }}>Next →</button>
          </div>
        </div>
      </div>

      {/* ── Mobile card list ──────────────────────────────── */}
      <div className="m-card-list">
        {loading ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>Loading…</div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>No tasks found.</div>
        ) : tasks.map(t => (
          <div key={t.id} className="m-item-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              <div className="m-item-card__title">{t.title}</div>
              <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, flexShrink:0,
                color:PC[t.priority]||'#6B7280', background:`${PC[t.priority]||'#6B7280'}18` }}>
                {t.priority}
              </span>
            </div>
            <div className="m-item-card__row">
              {t.assignee && (
                <span className="m-item-card__meta">
                  <span>👤</span>{t.assignee.firstName} {t.assignee.lastName}
                </span>
              )}
              {t.team && (
                <span className="m-item-card__meta">
                  <span>👥</span>{t.team.name}
                </span>
              )}
            </div>
            <div className="m-item-card__row" style={{ justifyContent:'space-between' }}>
              <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700,
                color:SC[t.status]||'#6B7280', background:`${SC[t.status]||'#6B7280'}18` }}>
                {t.status?.replace('_',' ')}
              </span>
              {t.dueDate && (
                <span className="m-item-card__meta" style={{ color: new Date(t.dueDate)<new Date() && t.status!=='COMPLETED' ? '#EF4444' : undefined }}>
                  📅 {new Date(t.dueDate).toLocaleDateString()}
                </span>
              )}
              {t.isEscalated && <span style={{ fontSize:12 }}>🚨 Escalated</span>}
            </div>
          </div>
        ))}
        {/* Mobile pagination */}
        <div style={{ display:'flex', gap:10, padding:'4px 0 8px' }}>
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
            style={{ ...btnSecondary, flex:1, opacity:page===1?0.4:1, justifyContent:'center' }}>← Prev</button>
          <button onClick={() => setPage(p => p+1)} disabled={page>=totalPages}
            style={{ ...btnSecondary, flex:1, opacity:page>=totalPages?0.4:1, justifyContent:'center' }}>Next →</button>
        </div>
      </div>

      {/* ── Create Task Modal ─────────────────────────────────── */}
      {showAdd && (
        <Modal title="Create New Task" onClose={() => setShowAdd(false)}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Task Title *</label>
            <input style={inputSt} value={form.title} onChange={e => f('title', e.target.value)} placeholder="e.g. Fix login bug" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Description</label>
            <textarea style={{ ...inputSt, minHeight: 80, resize: 'vertical' as const }} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Task details..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelSt}>Assign To *</label>
              <select style={inputSt} value={form.assigneeId} onChange={e => f('assigneeId', e.target.value)}>
                <option value="">— Select employee —</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Team</label>
              <select style={inputSt} value={form.teamId} onChange={e => f('teamId', e.target.value)}>
                <option value="">— None —</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelSt}>Priority</label>
              <select style={inputSt} value={form.priority} onChange={e => f('priority', e.target.value)}>
                {['CRITICAL','HIGH','MEDIUM','LOW'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Due Date</label>
              <input type="date" style={inputSt} value={form.dueDate} onChange={e => f('dueDate', e.target.value)} />
            </div>
            <div>
              <label style={labelSt}>Est. Hours</label>
              <input type="number" style={inputSt} value={form.estimatedHours} onChange={e => f('estimatedHours', e.target.value)} placeholder="8" min="0.5" step="0.5" />
            </div>
          </div>
          {errMsg && <p style={{ color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errMsg}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button>
            <button onClick={createTask} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ATTENDANCE PAGE
══════════════════════════════════════════════════════════════════════ */
export function AttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [stats,   setStats]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0]);

  const SC: Record<string, string> = { PRESENT: '#10B981', ABSENT: '#EF4444', LATE: '#F59E0B', HALF_DAY: '#3B82F6', ON_LEAVE: '#8B5CF6', HOLIDAY: '#6B7280', REMOTE: '#6366F1' };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API.get('/attendance', { params: { date, limit: 100 } }),
      API.get('/attendance/summary', { params: { date } }),
    ]).then(([r, s]) => {
      setRecords(r.data.data || []);
      setStats(s.data.data?.stats || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [date]);

  const total = stats.reduce((s: number, x: any) => s + (x._count?._all || 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Attendance</h1>

      {/* Date picker */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ ...inputSt, width: 180 }} />
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Stats chips */}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {stats.map((s: any) => (
            <div key={s.status} style={{ padding: '12px 20px', background: 'var(--card)', border: `1px solid ${SC[s.status] || '#6B7280'}40`, borderRadius: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: SC[s.status] || '#6B7280' }}>{s._count?._all || 0}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.status}</div>
            </div>
          ))}
          <div style={{ padding: '12px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{total}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>TOTAL</div>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <div style={tableScroll}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              {['Employee', 'ID', 'Team', 'Check In', 'Check Out', 'Hours', 'Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No attendance records for this date.</td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontSize: 13, fontWeight: 500 }}>{r.user?.firstName} {r.user?.lastName}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.user?.employeeId}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{r.user?.team?.name || '—'}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : '—'}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : '—'}</td>
                <td style={{ ...tdStyle, fontSize: 12, fontWeight: 600 }}>{r.totalWorkHours != null ? `${r.totalWorkHours.toFixed(1)}h` : '—'}</td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: SC[r.status] || '#6B7280', background: `${SC[r.status] || '#6B7280'}20` }}>
                    {r.status}{r.isLate ? ' (Late)' : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>{/* end tableScroll */}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LEAVE MANAGEMENT PAGE
══════════════════════════════════════════════════════════════════════ */
export function LeavePage() {
  const [leaves,  setLeaves]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('PENDING');
  const [total,   setTotal]   = useState(0);

  const SC: Record<string, string> = { APPROVED: '#10B981', REJECTED: '#EF4444', PENDING: '#F59E0B', CANCELLED: '#6B7280' };
  const LC: Record<string, string> = { ANNUAL: '#6366F1', SICK: '#EF4444', CASUAL: '#F59E0B', MATERNITY: '#EC4899', PATERNITY: '#3B82F6', UNPAID: '#6B7280', OTHER: '#8B5CF6' };

  const load = useCallback(() => {
    setLoading(true);
    API.get('/leaves', { params: { status: status || undefined, limit: 50 } })
      .then(r => { setLeaves(r.data.data || []); setTotal(r.data.pagination?.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    let note = '';
    if (newStatus === 'REJECTED') {
      const input = window.prompt('Reason for rejection (required):');
      if (!input || !input.trim()) return;
      note = input.trim();
    }
    try {
      await API.patch(`/leaves/${id}/review`, { status: newStatus, reviewNote: note || undefined });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to process review');
    }
  };

  return (
    <div className="pg-page" style={{ padding:24 }}>
      <div className="pg-page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, marginBottom:3, letterSpacing:-.3 }}>Leave Management</h1>
          <p style={{ color:'var(--muted)', fontSize:13 }}>{total} requests</p>
        </div>
      </div>

      {/* Filter chips — scrollable single row */}
      <div className="chip-bar">
        {['PENDING','APPROVED','REJECTED','CANCELLED',''].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`chip${status === s ? ' active' : ''}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* ── Desktop table ──────────────────────────────── */}
      <div className="m-table" style={cardStyle}>
        <div style={tableScroll}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
            <thead>
              <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Employee','Type','Dates','Days','Reason','Status','Reviewed By','Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', color:'var(--muted)', padding:40 }}>Loading…</td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign:'center', color:'var(--muted)', padding:40 }}>No {status||''} leave requests.</td></tr>
              ) : leaves.map(l => (
                <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ ...tdStyle, fontSize:13, fontWeight:600 }}>{l.user?.firstName} {l.user?.lastName}</td>
                  <td style={tdStyle}>
                    <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, color:LC[l.type]||'#6B7280', background:`${LC[l.type]||'#6B7280'}18` }}>{l.type}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize:12, whiteSpace:'nowrap' }}>
                    {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td style={{ ...tdStyle, fontSize:13, fontWeight:700 }}>{l.totalDays}d</td>
                  <td style={{ ...tdStyle, fontSize:12, maxWidth:160 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{l.reason}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:700, color:SC[l.status]||'#6B7280', background:`${SC[l.status]||'#6B7280'}18` }}>{l.status}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize:12, color:'var(--muted)' }}>
                    {l.reviewer ? `${l.reviewer.firstName} ${l.reviewer.lastName}` : '—'}
                  </td>
                  <td style={tdStyle}>
                    {l.status === 'PENDING' && (
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => review(l.id, 'APPROVED')} style={btnSuccess}>✓ Approve</button>
                        <button onClick={() => review(l.id, 'REJECTED')} style={btnDanger}>✗ Reject</button>
                      </div>
                    )}
                    {l.reviewNote && <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{l.reviewNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile card list ──────────────────────────── */}
      <div className="m-card-list">
        {loading ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>Loading…</div>
        ) : leaves.length === 0 ? (
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>No {status||''} leave requests.</div>
        ) : leaves.map(l => (
          <div key={l.id} className="m-item-card">
            {/* Name + type badge */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              <div className="m-item-card__title">{l.user?.firstName} {l.user?.lastName}</div>
              <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, flexShrink:0,
                color:LC[l.type]||'#6B7280', background:`${LC[l.type]||'#6B7280'}18` }}>
                {l.type}
              </span>
            </div>
            {/* Dates + days */}
            <div className="m-item-card__row">
              <span className="m-item-card__meta">
                📅 {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', background:'var(--surface-2)',
                padding:'2px 8px', borderRadius:6 }}>
                {l.totalDays}d
              </span>
            </div>
            {/* Reason */}
            {l.reason && (
              <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic', lineHeight:1.4 }}>"{l.reason}"</div>
            )}
            {/* Status row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700,
                color:SC[l.status]||'#6B7280', background:`${SC[l.status]||'#6B7280'}18` }}>
                {l.status}
              </span>
              {l.reviewer && (
                <span className="m-item-card__meta">✅ {l.reviewer.firstName} {l.reviewer.lastName}</span>
              )}
            </div>
            {/* Action buttons for pending */}
            {l.status === 'PENDING' && (
              <div className="m-item-card__actions">
                <button className="m-btn-approve" onClick={() => review(l.id, 'APPROVED')}>✓ Approve</button>
                <button className="m-btn-reject"  onClick={() => review(l.id, 'REJECTED')}>✗ Reject</button>
              </div>
            )}
            {l.reviewNote && (
              <div style={{ fontSize:11, color:'var(--muted)', padding:'6px 10px',
                background:'var(--surface-2)', borderRadius:8 }}>📝 {l.reviewNote}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   AUDIT LOG PAGE
══════════════════════════════════════════════════════════════════════ */
export function AuditPage() {
  const [logs,    setLogs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    setLoading(true);
    API.get('/audit', { params: { page, limit: LIMIT } })
      .then(r => { setLogs(r.data.data || []); setTotal(r.data.pagination?.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page]);

  const ACTION_COLORS: Record<string, string> = {
    LOGIN: '#10B981', LOGOUT: '#6B7280', CREATE_USER: '#6366F1', UPDATE_USER: '#3B82F6',
    DELETE_USER: '#EF4444', CREATE_TASK: '#F59E0B', UPDATE_TASK: '#D97706',
    PASSWORD_RESET: '#8B5CF6', DELETE_TASK: '#EF4444',
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Audit Logs</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{total} total events</p>
      </div>
      <div style={cardStyle}>
        <div style={tableScroll}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border)' }}>
              {['Time', 'User', 'Action', 'Entity', 'IP Address'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} style={{ borderBottom: '0.5px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td style={{ ...tdStyle, fontSize: 13 }}>{l.user ? `${l.user.firstName} ${l.user.lastName}` : '—'}</td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: `${ACTION_COLORS[l.action] || '#6366F1'}20`, color: ACTION_COLORS[l.action] || '#6366F1' }}>
                    {l.action}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: 12 }}>
                  {l.entity}{l.entityId ? ` (${l.entityId.substring(0, 8)}…)` : ''}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{l.ipAddress || '—'}</td>

              </tr>
            ))}
          </tbody>
        </table>
        </div>{/* end tableScroll */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Page {page} of {Math.ceil(total / LIMIT) || 1}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}
              style={{ ...btnSecondary, padding: '4px 10px', fontSize: 12, opacity: page * LIMIT >= total ? 0.4 : 1 }}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
