// ════════════════════════════════════════════════════════════
// screens/LoginScreen.tsx
// ════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
  ScrollView, Image,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk, clearError } from '../store/slices';
import type { AppDispatch, RootState } from '../store';
import { useTheme } from '../hooks/useTheme';

export function LoginScreen() {
  const dispatch    = useDispatch<AppDispatch>();
  const { loading, error } = useSelector((s: RootState) => s.auth);
  const { colors }  = useTheme();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    dispatch(loginThunk({ email: email.trim(), password }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>PG</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>PG Technoplast</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to your account</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => dispatch(clearError())}><Text style={styles.errorDismiss}>✕</Text></TouchableOpacity>
            </View>
          )}

          <Text style={[styles.label, { color: colors.textMuted }]}>Employee ID</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            value={email} onChangeText={setEmail}
            placeholder="e.g. EMP00001" placeholderTextColor={colors.textMuted}
            autoCapitalize="characters" autoComplete="off"
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              value={password} onChangeText={setPassword}
              placeholder="••••••••" placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(!showPass)}>
              <Text style={{ color: colors.textMuted }}>{showPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }, loading && styles.loginBtnDisabled]}
            onPress={handleLogin} disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        {/* Team motto */}
        <View style={styles.mottoBox}>
          <Text style={styles.mottoTeam}>IT Team</Text>
          <View style={styles.mottoDivider} />
          <Text style={styles.mottoText}>One Team  ·  One Dream  ·  One Goal</Text>
        </View>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          © {new Date().getFullYear()} PG Technoplast Ltd. All rights reserved.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header:          { alignItems: 'center', marginBottom: 32 },
  logoBox:         { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:        { color: '#fff', fontSize: 28, fontWeight: '700' },
  title:           { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle:        { fontSize: 14 },
  card:            { borderRadius: 16, borderWidth: 0.5, padding: 24, marginBottom: 24 },
  errorBox:        { backgroundColor: '#FEECEC', borderRadius: 8, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorText:       { color: '#D32F2F', flex: 1, fontSize: 13 },
  errorDismiss:    { color: '#D32F2F', fontSize: 16, marginLeft: 8 },
  label:           { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:           { borderRadius: 10, borderWidth: 0.5, padding: 14, fontSize: 15, height: 50 },
  passwordRow:     { position: 'relative' },
  passwordInput:   { paddingRight: 48 },
  eyeBtn:          { position: 'absolute', right: 14, top: 14 },
  forgotBtn:       { alignSelf: 'flex-end', marginTop: 8, marginBottom: 4 },
  forgotText:      { fontSize: 13, fontWeight: '500' },
  loginBtn:        { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20, height: 52, justifyContent: 'center' },
  loginBtnDisabled:{ opacity: 0.7 },
  loginBtnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  mottoBox:        { alignItems: 'center', marginBottom: 20, paddingHorizontal: 24, paddingVertical: 14,
                     borderRadius: 14, backgroundColor: '#FFF0F2', borderWidth: 1.5, borderColor: '#FECDD3' },
  mottoTeam:       { fontSize: 11, fontWeight: '800', color: '#C8102E', letterSpacing: 1.4,
                     textTransform: 'uppercase', marginBottom: 6 },
  mottoDivider:    { width: 32, height: 2, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  mottoText:       { fontSize: 13, fontWeight: '600', color: '#374151', letterSpacing: 0.3 },
  footer:          { textAlign: 'center', fontSize: 12, marginBottom: 8 },
});

// ════════════════════════════════════════════════════════════
// screens/DashboardScreen.tsx
// ════════════════════════════════════════════════════════════
import React, { useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet as DS } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDashboardThunk } from '../store/slices';
import { useTheme } from '../hooks/useTheme';

const MetricCard = ({ label, value, color, icon }: any) => {
  const { colors } = useTheme();
  return (
    <View style={[dStyles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={dStyles.metricIcon}>{icon}</Text>
      <Text style={[dStyles.metricValue, { color }]}>{value}</Text>
      <Text style={[dStyles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
};

export function DashboardScreen({ navigation }: any) {
  const dispatch    = useDispatch<AppDispatch>();
  const { dashboard, loading } = useSelector((s: RootState) => s.kpi);
  const { user }    = useSelector((s: RootState) => s.auth);
  const { colors }  = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await dispatch(fetchDashboardThunk());
  }, [dispatch]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const summary = dashboard?.summary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={dStyles.header}>
        <View>
          <Text style={[dStyles.greeting, { color: colors.textMuted }]}>Good {getTimeOfDay()},</Text>
          <Text style={[dStyles.name, { color: colors.text }]}>{user?.firstName} {user?.lastName}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <View style={[dStyles.notifBtn, { backgroundColor: colors.card }]}>
            <Text style={dStyles.notifIcon}>🔔</Text>
            {(dashboard?.summary?.unreadNotifications || 0) > 0 && (
              <View style={dStyles.badge}><Text style={dStyles.badgeText}>{dashboard.summary.unreadNotifications}</Text></View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* KPI Score */}
      <View style={[dStyles.scoreCard, { backgroundColor: colors.primary }]}>
        <Text style={dStyles.scoreLabel}>Productivity Score</Text>
        <Text style={dStyles.scoreValue}>{summary?.productivityScore ?? 0}%</Text>
        <View style={[dStyles.scoreBar, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
          <View style={[dStyles.scoreFill, { width: `${summary?.productivityScore ?? 0}%` }]} />
        </View>
      </View>

      {/* Metrics Grid */}
      <View style={dStyles.metricsGrid}>
        <MetricCard label="Total Tasks"   value={summary?.totalTasks     ?? 0} color={colors.text}    icon="📋" />
        <MetricCard label="In Progress"   value={summary?.inProgressTasks ?? 0} color="#F59E0B"       icon="⚡" />
        <MetricCard label="Completed"     value={summary?.completedTasks  ?? 0} color="#10B981"       icon="✅" />
        <MetricCard label="Overdue"       value={summary?.overdueTask     ?? 0} color="#EF4444"       icon="⏰" />
        {summary?.escalatedTasks > 0 && <MetricCard label="Escalated" value={summary.escalatedTasks} color="#DC2626" icon="🚨" />}
        {summary?.totalUsers > 0      && <MetricCard label="Active Users" value={summary.activeUsers} color="#6366F1" icon="👥" />}
      </View>

      {/* Recent Tasks */}
      <View style={dStyles.section}>
        <View style={dStyles.sectionHeader}>
          <Text style={[dStyles.sectionTitle, { color: colors.text }]}>Recent Tasks</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
            <Text style={{ color: colors.primary, fontSize: 13 }}>View All →</Text>
          </TouchableOpacity>
        </View>
        {(dashboard?.recentTasks || []).map((task: any) => (
          <TouchableOpacity
            key={task.id}
            style={[dStyles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
          >
            <View style={[dStyles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[dStyles.taskTitle, { color: colors.text }]} numberOfLines={1}>{task.title}</Text>
              <Text style={[dStyles.taskMeta,  { color: colors.textMuted }]}>
                {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : ''} · {task.status}
              </Text>
            </View>
            <View style={[dStyles.statusBadge, { backgroundColor: getStatusBg(task.status) }]}>
              <Text style={[dStyles.statusText, { color: getStatusColor(task.status) }]}>{task.status}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning'; if (h < 17) return 'Afternoon'; return 'Evening';
}
function getPriorityColor(p: string) {
  return { CRITICAL: '#DC2626', HIGH: '#F59E0B', MEDIUM: '#3B82F6', LOW: '#10B981' }[p] || '#6B7280';
}
function getStatusColor(s: string) {
  return { COMPLETED: '#059669', REJECTED: '#DC2626', IN_PROGRESS: '#D97706', OVERDUE: '#DC2626' }[s] || '#6B7280';
}
function getStatusBg(s: string) {
  return { COMPLETED: '#ECFDF5', REJECTED: '#FEF2F2', IN_PROGRESS: '#FFFBEB' }[s] || '#F3F4F6';
}

const dStyles = DS.create({
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  greeting:       { fontSize: 13 },
  name:           { fontSize: 22, fontWeight: '700' },
  notifBtn:       { padding: 10, borderRadius: 12, position: 'relative' },
  notifIcon:      { fontSize: 20 },
  badge:          { position: 'absolute', top: 4, right: 4, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText:      { color: '#fff', fontSize: 10, fontWeight: '700' },
  scoreCard:      { margin: 20, borderRadius: 16, padding: 20 },
  scoreLabel:     { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 },
  scoreValue:     { color: '#fff', fontSize: 40, fontWeight: '800' },
  scoreBar:       { height: 6, borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  scoreFill:      { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  metricsGrid:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  metricCard:     { width: '47%', borderRadius: 12, borderWidth: 0.5, padding: 16 },
  metricIcon:     { fontSize: 22, marginBottom: 8 },
  metricValue:    { fontSize: 28, fontWeight: '800' },
  metricLabel:    { fontSize: 12, marginTop: 2 },
  section:        { padding: 20, paddingTop: 8 },
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:   { fontSize: 17, fontWeight: '600' },
  taskRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 8 },
  priorityDot:    { width: 8, height: 8, borderRadius: 4 },
  taskTitle:      { fontSize: 14, fontWeight: '500' },
  taskMeta:       { fontSize: 12, marginTop: 2 },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText:     { fontSize: 10, fontWeight: '600' },
});

// ════════════════════════════════════════════════════════════
// screens/TasksScreen.tsx  (List with filters)
// ════════════════════════════════════════════════════════════
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet as TS, TextInput as TI, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTasksThunk, setFilters } from '../store/slices';

const STATUS_FILTERS = ['All', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'REJECTED'];

export function TasksScreen({ navigation }: any) {
  const dispatch   = useDispatch<AppDispatch>();
  const { items, loading, pagination, filters } = useSelector((s: RootState) => s.tasks);
  const { colors } = useTheme();
  const [activeStatus, setActiveStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const load = useCallback(() => {
    dispatch(fetchTasksThunk({
      page, limit: 20,
      status: activeStatus === 'All' ? undefined : activeStatus,
      search: search || undefined,
    }));
  }, [dispatch, page, activeStatus, search]);

  useEffect(() => { setPage(1); }, [activeStatus, search]);
  useEffect(() => { load(); }, [load]);

  const renderTask = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[tStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
    >
      <View style={tStyles.cardHeader}>
        <View style={[tStyles.priorityTag, { backgroundColor: getPriorityBg(item.priority) }]}>
          <Text style={[tStyles.priorityText, { color: getPriorityColor(item.priority) }]}>{item.priority}</Text>
        </View>
        {item.isEscalated && <View style={tStyles.escalatedTag}><Text style={tStyles.escalatedText}>🚨 ESCALATED</Text></View>}
        <View style={[tStyles.statusTag, { backgroundColor: getStatusBg(item.status) }]}>
          <Text style={[tStyles.statusTagText, { color: getStatusColor(item.status) }]}>{item.status.replace('_',' ')}</Text>
        </View>
      </View>
      <Text style={[tStyles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
      <View style={tStyles.meta}>
        {item.assignee && <Text style={[tStyles.metaText, { color: colors.textMuted }]}>👤 {item.assignee.firstName} {item.assignee.lastName}</Text>}
        {item.dueDate   && <Text style={[tStyles.metaText, { color: isPast(item.dueDate) && item.status !== 'COMPLETED' ? '#EF4444' : colors.textMuted }]}>📅 {new Date(item.dueDate).toLocaleDateString()}</Text>}
      </View>
      <View style={tStyles.footer}>
        <Text style={[tStyles.metaText, { color: colors.textMuted }]}>💬 {item._count?.comments || 0} · 📎 {item._count?.attachments || 0}</Text>
        {item.estimatedHours && <Text style={[tStyles.metaText, { color: colors.textMuted }]}>⏱ {item.estimatedHours}h est.</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={tStyles.searchBar}>
        <TI
          style={[tStyles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          value={search} onChangeText={setSearch}
          placeholder="Search tasks..." placeholderTextColor={colors.textMuted}
        />
      </View>

      <FlatList
        horizontal showsHorizontalScrollIndicator={false}
        data={STATUS_FILTERS}
        keyExtractor={(i) => i}
        style={{ maxHeight: 44, paddingLeft: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[tStyles.filterChip, activeStatus === item && { backgroundColor: colors.primary }]}
            onPress={() => setActiveStatus(item)}
          >
            <Text style={[tStyles.filterChipText, activeStatus === item && { color: '#fff' }]}>{item.replace('_',' ')}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={items} keyExtractor={(i) => i.id}
        renderItem={renderTask}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshing={loading} onRefresh={load}
        onEndReached={() => { if (page < pagination.totalPages) setPage(p => p + 1); }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={!loading ? <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 60 }}>No tasks found</Text> : null}
        ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
      />
    </View>
  );
}

function isPast(d: string) { return new Date(d) < new Date(); }
function getPriorityBg(p: string) { return { CRITICAL:'#FEF2F2', HIGH:'#FFFBEB', MEDIUM:'#EFF6FF', LOW:'#F0FDF4' }[p] || '#F3F4F6'; }

const tStyles = TS.create({
  searchBar:      { padding: 16, paddingBottom: 8 },
  searchInput:    { borderRadius: 12, borderWidth: 0.5, padding: 12, fontSize: 14 },
  filterChip:     { marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  filterChipText: { fontSize: 12, fontWeight: '500', color: '#6B7280' },
  card:           { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 10 },
  cardHeader:     { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  priorityTag:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText:   { fontSize: 10, fontWeight: '700' },
  escalatedTag:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#FEF2F2' },
  escalatedText:  { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  statusTag:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 'auto' },
  statusTagText:  { fontSize: 10, fontWeight: '600' },
  title:          { fontSize: 15, fontWeight: '600', marginBottom: 8, lineHeight: 22 },
  meta:           { flexDirection: 'row', gap: 12, marginBottom: 6 },
  footer:         { flexDirection: 'row', justifyContent: 'space-between' },
  metaText:       { fontSize: 12 },
});
