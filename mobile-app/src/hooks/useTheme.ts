import { useSelector } from 'react-redux';
import type { RootState } from '../store';

export const lightColors = {
  primary: '#6366F1', primaryDark: '#4F46E5',
  background: '#F8F9FA', card: '#FFFFFF',
  text: '#111827', textMuted: '#6B7280',
  border: '#E5E7EB', inputBg: '#F9FAFB',
  success: '#10B981', danger: '#EF4444',
  warning: '#F59E0B', info: '#3B82F6',
};

export const darkColors = {
  primary: '#818CF8', primaryDark: '#6366F1',
  background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', textMuted: '#94A3B8',
  border: '#334155', inputBg: '#0F172A',
  success: '#34D399', danger: '#F87171',
  warning: '#FBBF24', info: '#60A5FA',
};

export function useTheme() {
  const theme  = useSelector((s: RootState) => s.ui.theme);
  const colors = theme === 'dark' ? darkColors : lightColors;
  return { theme, colors, isDark: theme === 'dark' };
}
