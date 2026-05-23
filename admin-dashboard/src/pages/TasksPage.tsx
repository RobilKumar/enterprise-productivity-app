import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../lib/api';
import { Search, Plus, Filter, RefreshCw, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  category?: string;
  dueDate?: string;
  isEscalated: boolean;
  createdAt: string;
  completedAt?: string;
  assignee: { id: string; firstName: string; lastName: string; avatarUrl?: string };
  createdBy: { id: string; firstName: string; lastName: string };
  team?: { name: string };
  _count?: { comments: number; attachments: number };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING:     { label: 'Pending',     cls: 'badge-gray' },
  ACCEPTED:    { label: 'Accepted',    cls: 'badge-info' },
  IN_PROGRESS: { label: 'In Progress', cls: 'badge-warning' },
  ON_HOLD:     { label: 'On Hold',     cls: 'badge-gray' },
  COMPLETED:   { label: 'Completed',   cls: 'badge-success' },
  REJECTED:    { label: 'Rejected',    cls: 'badge-danger' },
  REOPENED:    { label: 'Reopened',    cls: 'badge-warning' },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: 'Critical', cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  HIGH:     { label: 'High',     cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  MEDIUM:   { label: 'Medium',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  LOW:      { label: 'Low',      cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
};

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [statusF, setStatusF] = useState('');
  const [priorityF, setPriorityF] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers]     = useState<any[]>([]);
  const [teams, setTeams]     = useState<any[]>([]);
  const [form, setForm]       = useState({ title: '', description: '', assigneeId: '', teamId: '', priority: 'MEDIUM', dueDate: '', category: '', estimatedHours: '' });
  const [saving, setSaving]   = useState(false);
  const limit = 25;

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit, sortBy: 'createdAt', sortOrder: 'desc' };
      if (search)   params.search   = search;
      if (statusF)  params.status   = statusF;
      if (priorityF) params.priority = priorityF;
      const { data } = await API.get('/tasks', { params });
      setTasks(data.data);
      setTotal(data.pagination.total);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [page, search, statusF, priorityF]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => {
    API.get('/users?limit=200').then(r => setUsers(r.data.data || [])).catch(() => {});
    API.get('/teams').then(r => setTeams(r.data.data || [])).catch(() => {});
  }, []);

  function isOverdue(t: Task) {
    return t.dueDate && !['COMPLETED', 'REJECTED'].includes(t.status) && new Date(t.dueDate) < new Date();
  }

  async function createTask() {
    setSaving(true);
    try {
      await API.post('/tasks', { ...form, estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined });
      setShowCreate(false);
      fetchTasks();
    } catch { /* */ }
    finally { setSaving(false); }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total tasks</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Create Task
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search tasks..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-40" value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-36" value={priorityF} onChange={e => { setPriorityF(e.target.value); setPage(1); }}>
          <option value="">All Priority</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={fetchTasks} className="btn-secondary flex items-center gap-1"><RefreshCw size={14} /></button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Assignee</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Flags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><span className="spinner border-gray-400" /></td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No tasks found</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} className="table-row cursor-pointer" onClick={() => setSelected(t)}>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="font-medium text-gray-900 dark:text-white truncate">{t.title}</div>
                    {t.category && <div className="text-xs text-gray-400">{t.category}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {t.assignee.firstName[0]}{t.assignee.lastName[0]}
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">{t.assignee.firstName} {t.assignee.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${PRIORITY_CONFIG[t.priority]?.cls || 'badge-gray'}`}>{PRIORITY_CONFIG[t.priority]?.label || t.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_CONFIG[t.status]?.cls || 'badge-gray'}`}>{STATUS_CONFIG[t.status]?.label || t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {t.dueDate ? (
                      <span className={isOverdue(t) ? 'text-red-500 font-medium' : 'text-gray-600 dark:text-gray-400'}>
                        {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isOverdue(t) && <AlertTriangle size={14} className="text-red-500" aria-label="Overdue" />}
                      {t.isEscalated && <span className="text-xs text-orange-500 font-medium">ESC</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-800">
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
              <h2 className="text-lg font-semibold">Create Task</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea className="input h-24 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Assignee *</label>
                <select className="input" value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">Select employee</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.employeeId})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Team</label>
                  <select className="input" value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}>
                    <option value="">No team</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Due Date</label>
                  <input type="datetime-local" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Est. Hours</label>
                  <input type="number" step="0.5" className="input" value={form.estimatedHours} onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <input className="input" placeholder="e.g. Development, Design..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t dark:border-gray-800">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={createTask} disabled={saving || !form.title || !form.assigneeId} className="btn-primary flex items-center gap-2">
                {saving && <span className="spinner border-white w-4 h-4" />} Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-lg h-full overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Task Detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{selected.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                <span className={`badge ${STATUS_CONFIG[selected.status]?.cls}`}>{STATUS_CONFIG[selected.status]?.label}</span>
                <span className={`badge ${PRIORITY_CONFIG[selected.priority]?.cls}`}>{PRIORITY_CONFIG[selected.priority]?.label}</span>
                {selected.isEscalated && <span className="badge badge-danger">Escalated</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-400 mb-1">Assignee</div>
                <div className="font-medium">{selected.assignee.firstName} {selected.assignee.lastName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Created By</div>
                <div className="font-medium">{selected.createdBy.firstName} {selected.createdBy.lastName}</div>
              </div>
              {selected.dueDate && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Due Date</div>
                  <div className={`font-medium ${isOverdue(selected) ? 'text-red-500' : ''}`}>{new Date(selected.dueDate).toLocaleString()}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-400 mb-1">Created</div>
                <div className="font-medium">{new Date(selected.createdAt).toLocaleDateString()}</div>
              </div>
              {selected.team && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Team</div>
                  <div className="font-medium">{selected.team.name}</div>
                </div>
              )}
              {selected._count && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Activity</div>
                  <div className="font-medium">{selected._count.comments} comments · {selected._count.attachments} files</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
