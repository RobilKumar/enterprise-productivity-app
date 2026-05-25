import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Plus, Edit2, UserCheck, UserX, RefreshCw } from 'lucide-react';

interface User {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: string;
  isOnline: boolean;
  avatarUrl?: string;
  role: { name: string };
  department?: { name: string };
  team?: { name: string };
  createdAt: string;
  lastLoginAt?: string;
  totalPoints: number;
}

interface Role  { id: string; name: string; }
interface Dept  { id: string; name: string; }
interface Team  { id: string; name: string; }

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'badge-success',
  INACTIVE:  'badge-gray',
  SUSPENDED: 'badge-danger',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:  'badge-danger',
  ADMIN:        'badge-warning',
  MANAGER:      'badge-info',
  TEAM_LEADER:  'badge-info',
  EMPLOYEE:     'badge-gray',
};

export default function EmployeesPage() {
  // Current logged-in user role
  const storedUser  = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const currentRole = storedUser?.role || '';
  const canChangeId = ['SUPER_ADMIN', 'ADMIN'].includes(currentRole);

  const [users, setUsers]         = useState<User[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [statusF, setStatusF]     = useState('');
  const [roleF, setRoleF]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<User | null>(null);
  const [roles, setRoles]         = useState<Role[]>([]);
  const [depts, setDepts]         = useState<Dept[]>([]);
  const [teams, setTeams]         = useState<Team[]>([]);
  const [form, setForm]           = useState({
    employeeId:   '',
    firstName:    '',
    lastName:     '',
    email:        '',
    phone:        '',
    password:     '',
    roleId:       '',
    departmentId: '',
    teamId:       '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);

  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search)  params.search = search;
      if (statusF) params.status = statusF;
      if (roleF)   params.role   = roleF;
      const { data } = await axios.get('/api/v1/users', { params });
      setUsers(data.data);
      setTotal(data.pagination.total);
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); }
  }, [page, search, statusF, roleF]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    axios.get('/api/v1/roles').then(r => setRoles(r.data.data)).catch(() => {});
    axios.get('/api/v1/departments').then(r => setDepts(r.data.data)).catch(() => {});
    axios.get('/api/v1/teams').then(r => setTeams(r.data.data)).catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ employeeId: '', firstName: '', lastName: '', email: '', phone: '', password: '', roleId: '', departmentId: '', teamId: '' });
    setFormError('');
    setShowModal(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      employeeId:   u.employeeId,
      firstName:    u.firstName,
      lastName:     u.lastName,
      email:        u.email,
      phone:        u.phone || '',
      password:     '',
      roleId:       u.role.name,
      departmentId: '',
      teamId:       '',
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        // If Employee ID changed, update it via the dedicated endpoint first
        const trimmedId = form.employeeId.trim().toUpperCase();
        if (trimmedId && trimmedId !== editing.employeeId) {
          if (!/^[A-Z0-9_\-]{1,20}$/.test(trimmedId)) {
            setFormError('Employee ID: use 1–20 letters/digits/_ or - only');
            setSaving(false);
            return;
          }
          await axios.patch(`/api/v1/users/${editing.id}/employee-id`, { newEmployeeId: trimmedId });
        }
        // Update other fields
        const { employeeId: _eid, password: _pw, ...updateFields } = form;
        await axios.put(`/api/v1/users/${editing.id}`, updateFields);
      } else {
        // Create — send employeeId only if filled in
        const payload: any = { ...form };
        if (!payload.employeeId.trim()) delete payload.employeeId;
        else payload.employeeId = payload.employeeId.trim().toUpperCase();
        await axios.post('/api/v1/auth/register', payload);
      }
      setShowModal(false);
      fetchUsers();
    } catch (e: any) {
      setFormError(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  async function toggleStatus(u: User) {
    const newStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await axios.put(`/api/v1/users/${u.id}`, { status: newStatus });
      fetchUsers();
    } catch { /* */ }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total employees</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search name, email, ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-40" value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select className="input w-44" value={roleF} onChange={e => { setRoleF(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          {roles.map(r => <option key={r.id} value={r.name}>{r.name.replace('_', ' ')}</option>)}
        </select>
        <button onClick={fetchUsers} className="btn-secondary flex items-center gap-1">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Department / Team</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Points</th>
                <th className="px-4 py-3 text-left">Last Login</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400"><span className="spinner border-gray-400" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No employees found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center font-semibold text-blue-700 dark:text-blue-300 text-sm">
                          {u.firstName[0]}{u.lastName[0]}
                        </div>
                        {u.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{u.firstName} {u.lastName}</div>
                        <div className="text-xs text-gray-400 font-mono">{u.employeeId} · {u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ROLE_COLORS[u.role.name] || 'badge-gray'}`}>{u.role.name.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 dark:text-gray-300">{u.department?.name || '—'}</div>
                    <div className="text-xs text-gray-400">{u.team?.name || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_COLORS[u.status] || 'badge-gray'}`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{u.totalPoints.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} title="Edit employee" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => toggleStatus(u)} title={u.status === 'ACTIVE' ? 'Suspend' : 'Activate'} className={`p-1.5 rounded-lg transition-colors ${u.status === 'ACTIVE' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950' : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950'}`}>
                        {u.status === 'ACTIVE' ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1}         onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Employee Modal ─────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Employee' : 'Add New Employee'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-4">

              {/* ── Employee ID ──────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium mb-1">
                  Employee ID
                  {!editing && <span className="ml-1 text-gray-400 font-normal">(optional — auto-generated if blank)</span>}
                  {editing && !canChangeId && <span className="ml-1 text-gray-400 font-normal">(read-only)</span>}
                </label>
                <input
                  className="input font-mono tracking-widest uppercase"
                  placeholder={editing ? editing.employeeId : 'e.g. EMP00042 or leave blank'}
                  value={form.employeeId}
                  maxLength={20}
                  readOnly={editing !== null && !canChangeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value.toUpperCase() }))}
                  style={editing !== null && !canChangeId ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                />
                {editing && canChangeId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠ Changing this ID means the employee must use the new ID to log in.
                  </p>
                )}
              </div>

              {/* ── Name ──────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">First Name *</label>
                  <input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Last Name *</label>
                  <input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>

              {/* ── Contact ───────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium mb-1">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>

              {/* ── Password (create only) ────────────────────────── */}
              {!editing && (
                <div>
                  <label className="block text-xs font-medium mb-1">Password *</label>
                  <input type="password" className="input" placeholder="Min 8 chars, uppercase, number, special" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}

              {/* ── Role ──────────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium mb-1">Role *</label>
                <select className="input" value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}>
                  <option value="">Select role</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name.replace(/_/g, ' ')}</option>)}
                </select>
              </div>

              {/* ── Dept + Team ───────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Department</label>
                  <select className="input" value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">None</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Team</label>
                  <select className="input" value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}>
                    <option value="">None</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {formError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving && <span className="spinner border-white w-4 h-4" />}
                {editing ? 'Save Changes' : 'Create Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
