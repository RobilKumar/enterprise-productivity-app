// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import authReducer         from './slices/authSlice';
import taskReducer         from './slices/taskSlice';
import notificationReducer from './slices/notificationSlice';
import timerReducer        from './slices/timerSlice';
import chatReducer         from './slices/chatSlice';
import kpiReducer          from './slices/kpiSlice';
import uiReducer           from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth:         authReducer,
    tasks:        taskReducer,
    notifications: notificationReducer,
    timer:        timerReducer,
    chat:         chatReducer,
    kpi:          kpiReducer,
    ui:           uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: { ignoredActions: ['timer/tick'] } }),
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
