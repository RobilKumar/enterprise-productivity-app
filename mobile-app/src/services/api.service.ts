import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const BASE_URL = process.env.API_URL || 'http://10.0.2.2:5000/api/v1'; // 10.0.2.2 = Android emulator localhost

// Offline queue for requests made while offline
const offlineQueue: Array<() => void> = [];

let isRefreshing  = false;
let failedQueue:  Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  failedQueue = [];
}

export const apiService: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
});

// ─── Request Interceptor ──────────────────────────────────────
apiService.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;

    // Offline detection
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return Promise.reject({ isOffline: true, config });
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor — Auto Token Refresh ────────────────
apiService.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then((token) => {
            originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${token}` };
            return apiService(originalRequest);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = data.data;

        await AsyncStorage.setItem('accessToken',  accessToken);
        await AsyncStorage.setItem('refreshToken', newRefresh);

        processQueue(null, accessToken);
        originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${accessToken}` };
        return apiService(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
        // Navigate to login — emit event
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Typed API helpers ────────────────────────────────────────
export const taskAPI = {
  getAll:        (params?: any)                         => apiService.get('/tasks', { params }),
  getOne:        (id: string)                           => apiService.get(`/tasks/${id}`),
  create:        (body: any)                            => apiService.post('/tasks', body),
  update:        (id: string, body: any)                => apiService.put(`/tasks/${id}`, body),
  updateStatus:  (id: string, status: string, extra?: any) => apiService.patch(`/tasks/${id}/status`, { status, ...extra }),
  delete:        (id: string)                           => apiService.delete(`/tasks/${id}`),
  addComment:    (id: string, body: any)                => apiService.post(`/tasks/${id}/comments`, body),
  uploadFile:    (id: string, formData: FormData)       => apiService.post(`/tasks/${id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const authAPI = {
  login:          (email: string, password: string)  => apiService.post('/auth/login', { email, password }),
  logout:         (refreshToken: string)             => apiService.post('/auth/logout', { refreshToken }),
  refresh:        (refreshToken: string)             => apiService.post('/auth/refresh', { refreshToken }),
  forgotPassword: (email: string)                   => apiService.post('/auth/forgot-password', { email }),
  verifyOtp:      (email: string, otp: string)      => apiService.post('/auth/verify-otp', { email, otp }),
  resetPassword:  (newPassword: string, token: string) => apiService.post('/auth/reset-password', { newPassword }, { headers: { Authorization: `Bearer ${token}` } }),
  getMe:          ()                                => apiService.get('/auth/me'),
  updateFcmToken: (userId: string, fcmToken: string) => apiService.patch(`/users/${userId}/fcm-token`, { fcmToken }),
};

export const kpiAPI = {
  getDashboard:    ()                => apiService.get('/kpi/dashboard'),
  getUserKpi:      (params?: any)    => apiService.get('/kpi/user', { params }),
  getTeamKpi:      (teamId: string)  => apiService.get(`/kpi/team/${teamId}`),
  getCompanyKpi:   ()                => apiService.get('/kpi/company'),
  getRanking:      ()                => apiService.get('/kpi/ranking'),
  downloadReport:  (params?: any)    => apiService.get('/kpi/report/download', { params, responseType: 'blob' }),
};

export const notifAPI = {
  getAll:       (params?: any)  => apiService.get('/notifications', { params }),
  markRead:     (id: string)    => apiService.patch(`/notifications/${id}/read`),
  markAllRead:  ()              => apiService.patch('/notifications/read-all'),
  getUnread:    ()              => apiService.get('/notifications/unread-count'),
};

export const chatAPI = {
  getRooms:      ()                               => apiService.get('/chat/rooms'),
  createRoom:    (body: any)                      => apiService.post('/chat/rooms', body),
  getMessages:   (roomId: string, params?: any)   => apiService.get(`/chat/rooms/${roomId}/messages`, { params }),
  sendMessage:   (roomId: string, body: any)      => apiService.post(`/chat/rooms/${roomId}/messages`, body),
};

export const attendanceAPI = {
  checkIn:     (data?: any)         => apiService.post('/attendance/checkin', data),
  checkOut:    (data?: any)         => apiService.post('/attendance/checkout', data),
  getMy:       (params?: any)       => apiService.get('/attendance/my', { params }),
  getAll:      (params?: any)       => apiService.get('/attendance', { params }),
};

export const leaveAPI = {
  getAll:      (params?: any)       => apiService.get('/leaves', { params }),
  getMy:       ()                   => apiService.get('/leaves/my'),
  create:      (body: any)          => apiService.post('/leaves', body),
  review:      (id: string, body: any) => apiService.patch(`/leaves/${id}/review`, body),
};

export const userAPI = {
  getAll:      (params?: any)       => apiService.get('/users', { params }),
  getOne:      (id: string)         => apiService.get(`/users/${id}`),
  update:      (id: string, body: any) => apiService.put(`/users/${id}`, body),
  changePassword: (id: string, body: any) => apiService.patch(`/users/${id}/change-password`, body),
};

export const timerAPI = {
  start:  (taskId: string) => apiService.post('/timer/start', { taskId }),
  pause:  (taskId: string) => apiService.post('/timer/pause', { taskId }),
  stop:   (taskId: string) => apiService.post('/timer/stop',  { taskId }),
  getLogs: (params?: any)  => apiService.get('/timer/logs', { params }),
};
