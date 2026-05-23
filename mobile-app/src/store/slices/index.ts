// ─── slices/authSlice.ts ──────────────────────────────────────
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../../services/api.service';

export interface User {
  id: string; employeeId: string; firstName: string; lastName: string;
  email: string; role: string; avatarUrl?: string; permissions: string[];
  totalPoints: number; isOnline: boolean; teamId?: string; departmentId?: string;
}

interface AuthState {
  user:         User | null;
  accessToken:  string | null;
  refreshToken: string | null;
  loading:      boolean;
  error:        string | null;
}

const initialState: AuthState = { user: null, accessToken: null, refreshToken: null, loading: false, error: null };

export const loginThunk = createAsyncThunk('auth/login', async (creds: { email: string; password: string }, { rejectWithValue }) => {
  try {
    const { data } = await apiService.post('/auth/login', creds);
    await AsyncStorage.setItem('accessToken',  data.data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.data.refreshToken);
    return data.data;
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const logoutThunk = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const { auth } = getState() as { auth: AuthState };
  await apiService.post('/auth/logout', { refreshToken: auth.refreshToken });
  await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
});

export const restoreSessionThunk = createAsyncThunk('auth/restore', async () => {
  const [accessToken, refreshToken] = await AsyncStorage.multiGet(['accessToken', 'refreshToken']);
  if (!accessToken[1]) return null;
  try {
    const { data } = await apiService.get('/auth/me');
    return { user: data.data, accessToken: accessToken[1], refreshToken: refreshToken[1] };
  } catch {
    return null;
  }
});

const authSlice = createSlice({
  name: 'auth', initialState,
  reducers: {
    clearError: (s) => { s.error = null; },
    updateUser:  (s, a: PayloadAction<Partial<User>>) => { if (s.user) Object.assign(s.user, a.payload); },
  },
  extraReducers: (b) => {
    b.addCase(loginThunk.pending,  (s) => { s.loading = true;  s.error = null; });
    b.addCase(loginThunk.fulfilled,(s, a) => {
      s.loading = false; s.user = a.payload.user; s.accessToken = a.payload.accessToken; s.refreshToken = a.payload.refreshToken;
    });
    b.addCase(loginThunk.rejected, (s, a) => { s.loading = false; s.error = a.payload as string; });
    b.addCase(logoutThunk.fulfilled, (s) => { s.user = null; s.accessToken = null; s.refreshToken = null; });
    b.addCase(restoreSessionThunk.fulfilled, (s, a) => {
      if (a.payload) { s.user = a.payload.user; s.accessToken = a.payload.accessToken; s.refreshToken = a.payload.refreshToken; }
    });
  },
});

export const { clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;

// ─── slices/taskSlice.ts ──────────────────────────────────────
import { createSlice, createAsyncThunk, PayloadAction as PA } from '@reduxjs/toolkit';
import { apiService as api } from '../../services/api.service';

export interface Task {
  id: string; title: string; description?: string; status: string; priority: string;
  assigneeId: string; createdById: string; teamId?: string; dueDate?: string;
  estimatedHours?: number; actualHours?: number; isEscalated: boolean;
  category?: string; proofRequired: boolean; createdAt: string; updatedAt: string;
  assignee?: { id: string; firstName: string; lastName: string; avatarUrl?: string };
  team?: { id: string; name: string };
  _count?: { comments: number; attachments: number };
}

interface TaskState {
  items:      Task[];
  selected:   Task | null;
  loading:    boolean;
  error:      string | null;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  filters:    { status?: string; priority?: string; search?: string };
}

const initialState: TaskState = {
  items: [], selected: null, loading: false, error: null,
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  filters: {},
};

export const fetchTasksThunk = createAsyncThunk('tasks/fetchAll', async (params: Record<string, any>, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/tasks', { params });
    return data;
  } catch (e: any) { return rejectWithValue(e.response?.data?.message); }
});

export const fetchTaskThunk = createAsyncThunk('tasks/fetchOne', async (id: string, { rejectWithValue }) => {
  try { const { data } = await api.get(`/tasks/${id}`); return data.data; }
  catch (e: any) { return rejectWithValue(e.response?.data?.message); }
});

export const updateStatusThunk = createAsyncThunk('tasks/updateStatus', async ({ id, status, rejectionReason }: { id: string; status: string; rejectionReason?: string }, { rejectWithValue }) => {
  try { const { data } = await api.patch(`/tasks/${id}/status`, { status, rejectionReason }); return data.data; }
  catch (e: any) { return rejectWithValue(e.response?.data?.message); }
});

const taskSlice = createSlice({
  name: 'tasks', initialState,
  reducers: {
    setFilters: (s, a: PA<Partial<TaskState['filters']>>) => { s.filters = { ...s.filters, ...a.payload }; },
    clearFilters: (s) => { s.filters = {}; },
    updateTaskInList: (s, a: PA<Task>) => {
      const idx = s.items.findIndex((t) => t.id === a.payload.id);
      if (idx >= 0) s.items[idx] = a.payload;
      if (s.selected?.id === a.payload.id) s.selected = a.payload;
    },
    addTaskToList: (s, a: PA<Task>) => { s.items.unshift(a.payload); },
  },
  extraReducers: (b) => {
    b.addCase(fetchTasksThunk.pending,   (s) => { s.loading = true; });
    b.addCase(fetchTasksThunk.fulfilled, (s, a) => {
      s.loading = false; s.items = a.payload.data; s.pagination = a.payload.pagination;
    });
    b.addCase(fetchTasksThunk.rejected,  (s, a) => { s.loading = false; s.error = a.payload as string; });
    b.addCase(fetchTaskThunk.fulfilled,  (s, a) => { s.selected = a.payload; });
    b.addCase(updateStatusThunk.fulfilled, (s, a) => {
      const idx = s.items.findIndex((t) => t.id === a.payload.id);
      if (idx >= 0) s.items[idx] = { ...s.items[idx], ...a.payload };
      if (s.selected?.id === a.payload.id) s.selected = { ...s.selected, ...a.payload };
    });
  },
});

export const { setFilters, clearFilters, updateTaskInList, addTaskToList } = taskSlice.actions;
export default taskSlice.reducer;

// ─── slices/notificationSlice.ts ─────────────────────────────
import { createSlice, createAsyncThunk, PayloadAction as NPA } from '@reduxjs/toolkit';
import { apiService as napi } from '../../services/api.service';

export interface Notification {
  id: string; type: string; title: string; body: string; data?: any; isRead: boolean; createdAt: string;
}

interface NotifState { items: Notification[]; unreadCount: number; loading: boolean; }

const notifSlice = createSlice({
  name: 'notifications',
  initialState: { items: [] as Notification[], unreadCount: 0, loading: false },
  reducers: {
    addNotification: (s, a: NPA<Notification>) => { s.items.unshift(a.payload); s.unreadCount++; },
    markRead:        (s, a: NPA<string>)       => {
      const n = s.items.find((n) => n.id === a.payload);
      if (n && !n.isRead) { n.isRead = true; s.unreadCount = Math.max(0, s.unreadCount - 1); }
    },
    markAllRead: (s) => { s.items.forEach((n) => { n.isRead = true; }); s.unreadCount = 0; },
    setUnreadCount: (s, a: NPA<number>) => { s.unreadCount = a.payload; },
  },
  extraReducers: (b) => {
    b.addCase(createAsyncThunk('notif/fetch', async () => {
      const { data } = await napi.get('/notifications'); return data;
    }).fulfilled, (s, a: any) => { s.items = a.payload.data; });
    b.addCase(createAsyncThunk('notif/unread', async () => {
      const { data } = await napi.get('/notifications/unread-count'); return data.data.count;
    }).fulfilled, (s, a: any) => { s.unreadCount = a.payload; });
  },
});

export const { addNotification, markRead, markAllRead, setUnreadCount } = notifSlice.actions;
export default notifSlice.reducer;

// ─── slices/timerSlice.ts ─────────────────────────────────────
import { createSlice, PayloadAction as TPA } from '@reduxjs/toolkit';

interface TimerState {
  activeTaskId: string | null;
  startTime:    number | null;
  elapsed:      number;
  isPaused:     boolean;
}

const timerSlice = createSlice({
  name: 'timer',
  initialState: { activeTaskId: null, startTime: null, elapsed: 0, isPaused: false } as TimerState,
  reducers: {
    startTimer: (s, a: TPA<string>) => { s.activeTaskId = a.payload; s.startTime = Date.now(); s.elapsed = 0; s.isPaused = false; },
    pauseTimer: (s) => {
      if (s.startTime) { s.elapsed += Date.now() - s.startTime; s.startTime = null; s.isPaused = true; }
    },
    resumeTimer: (s) => { s.startTime = Date.now(); s.isPaused = false; },
    stopTimer:   (s) => { s.activeTaskId = null; s.startTime = null; s.elapsed = 0; s.isPaused = false; },
    tick:        (s) => { /* computed in selector */ },
  },
});

export const { startTimer, pauseTimer, resumeTimer, stopTimer, tick } = timerSlice.actions;
export const selectElapsed = (state: { timer: TimerState }) => {
  const { startTime, elapsed } = state.timer;
  return startTime ? elapsed + (Date.now() - startTime) : elapsed;
};
export default timerSlice.reducer;

// ─── slices/chatSlice.ts ──────────────────────────────────────
import { createSlice, PayloadAction as CPA } from '@reduxjs/toolkit';

export interface ChatMessage { id: string; roomId: string; senderId: string; content?: string; mediaUrl?: string; createdAt: string; sender?: any; }
interface ChatState { rooms: any[]; messages: Record<string, ChatMessage[]>; activeRoomId: string | null; typingUsers: Record<string, string[]>; }

const chatSlice = createSlice({
  name: 'chat',
  initialState: { rooms: [], messages: {}, activeRoomId: null, typingUsers: {} } as ChatState,
  reducers: {
    setRooms:      (s, a: CPA<any[]>) => { s.rooms = a.payload; },
    setActiveRoom: (s, a: CPA<string>) => { s.activeRoomId = a.payload; },
    addMessage:    (s, a: CPA<ChatMessage>) => {
      const { roomId } = a.payload;
      if (!s.messages[roomId]) s.messages[roomId] = [];
      s.messages[roomId].push(a.payload);
    },
    setMessages:   (s, a: CPA<{ roomId: string; messages: ChatMessage[] }>) => {
      s.messages[a.payload.roomId] = a.payload.messages;
    },
    setTyping:     (s, a: CPA<{ roomId: string; userId: string; isTyping: boolean }>) => {
      const { roomId, userId, isTyping } = a.payload;
      if (!s.typingUsers[roomId]) s.typingUsers[roomId] = [];
      if (isTyping) {
        if (!s.typingUsers[roomId].includes(userId)) s.typingUsers[roomId].push(userId);
      } else {
        s.typingUsers[roomId] = s.typingUsers[roomId].filter((id) => id !== userId);
      }
    },
  },
});

export const { setRooms, setActiveRoom, addMessage, setMessages, setTyping } = chatSlice.actions;
export default chatSlice.reducer;

// ─── slices/kpiSlice.ts ───────────────────────────────────────
import { createSlice, createAsyncThunk, PayloadAction as KPA } from '@reduxjs/toolkit';
import { apiService as kapi } from '../../services/api.service';

interface KpiState { dashboard: any; userKpi: any; teamKpi: any; loading: boolean; }

export const fetchDashboardThunk  = createAsyncThunk('kpi/dashboard',  async () => { const { data } = await kapi.get('/kpi/dashboard'); return data.data; });
export const fetchUserKpiThunk    = createAsyncThunk('kpi/user',       async (params: any) => { const { data } = await kapi.get('/kpi/user', { params }); return data.data; });

const kpiSlice = createSlice({
  name: 'kpi',
  initialState: { dashboard: null, userKpi: null, teamKpi: null, loading: false } as KpiState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchDashboardThunk.pending,   (s) => { s.loading = true; });
    b.addCase(fetchDashboardThunk.fulfilled, (s, a) => { s.loading = false; s.dashboard = a.payload; });
    b.addCase(fetchDashboardThunk.rejected,  (s) => { s.loading = false; });
    b.addCase(fetchUserKpiThunk.fulfilled,   (s, a) => { s.userKpi = a.payload; });
  },
});

export default kpiSlice.reducer;

// ─── slices/uiSlice.ts ────────────────────────────────────────
import { createSlice, PayloadAction as UPA } from '@reduxjs/toolkit';

interface UIState { theme: 'light' | 'dark'; isOffline: boolean; }

const uiSlice = createSlice({
  name: 'ui',
  initialState: { theme: 'light' as const, isOffline: false } as UIState,
  reducers: {
    setTheme:     (s, a: UPA<'light' | 'dark'>) => { s.theme = a.payload; },
    setOffline:   (s, a: UPA<boolean>) => { s.isOffline = a.payload; },
    toggleTheme:  (s) => { s.theme = s.theme === 'light' ? 'dark' : 'light'; },
  },
});

export const { setTheme, setOffline, toggleTheme } = uiSlice.actions;
export default uiSlice.reducer;
