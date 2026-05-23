// ════════════════════════════════════════════════════════════
// screens/TaskDetailScreen.tsx
// ════════════════════════════════════════════════════════════
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTaskThunk, updateStatusThunk } from '../store/slices';
import { socketService } from '../services/socket.service';
import { taskAPI } from '../services/api.service';
import { useTheme } from '../hooks/useTheme';

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  PENDING:     [{ label: 'Accept',    next: 'ACCEPTED',    color: '#10B981' }, { label: 'Reject', next: 'REJECTED', color: '#EF4444' }],
  ACCEPTED:    [{ label: 'Start',     next: 'IN_PROGRESS', color: '#3B82F6' }, { label: 'Reject', next: 'REJECTED', color: '#EF4444' }],
  IN_PROGRESS: [{ label: 'Complete',  next: 'COMPLETED',   color: '#10B981' }, { label: 'Hold',   next: 'ON_HOLD',  color: '#F59E0B' }],
  ON_HOLD:     [{ label: 'Resume',    next: 'IN_PROGRESS', color: '#3B82F6' }],
  COMPLETED:   [{ label: 'Reopen',    next: 'REOPENED',    color: '#6B7280' }],
  REJECTED:    [{ label: 'Reopen',    next: 'REOPENED',    color: '#6B7280' }],
  REOPENED:    [{ label: 'Accept',    next: 'ACCEPTED',    color: '#10B981' }],
};

export function TaskDetailScreen({ route, navigation }: any) {
  const { taskId }   = route.params;
  const dispatch     = useDispatch<AppDispatch>();
  const { selected: task, loading } = useSelector((s: RootState) => s.tasks);
  const { user }     = useSelector((s: RootState) => s.auth);
  const { colors }   = useTheme();
  const [comment,    setComment]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    dispatch(fetchTaskThunk(taskId));
    socketService.subscribeTask(taskId);
    return () => socketService.unsubscribeTask(taskId);
  }, [taskId]);

  const handleStatusChange = async (next: string) => {
    if (next === 'REJECTED') { setShowReject(true); return; }
    await dispatch(updateStatusThunk({ id: taskId, status: next }));
    Alert.alert('Success', `Task ${next.toLowerCase()}`);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { Alert.alert('Error', 'Please provide a rejection reason'); return; }
    await dispatch(updateStatusThunk({ id: taskId, status: 'REJECTED', rejectionReason: rejectReason }));
    setShowReject(false);
    setRejectReason('');
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    await taskAPI.addComment(taskId, { content: comment.trim() });
    setComment('');
    setSubmitting(false);
    dispatch(fetchTaskThunk(taskId));
  };

  if (!task || loading) return <ActivityIndicator style={{ flex: 1 }} />;

  const actions = STATUS_ACTIONS[task.status] || [];
  const isAssignee = task.assigneeId === user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Header */}
        <View style={[tdStyles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={tdStyles.tags}>
            <View style={[tdStyles.tag, { backgroundColor: getPriorityBg(task.priority) }]}>
              <Text style={[tdStyles.tagText, { color: getPriorityColor(task.priority) }]}>{task.priority}</Text>
            </View>
            <View style={[tdStyles.tag, { backgroundColor: getStatusBg(task.status) }]}>
              <Text style={[tdStyles.tagText, { color: getStatusColor(task.status) }]}>{task.status.replace('_',' ')}</Text>
            </View>
            {task.isEscalated && <View style={[tdStyles.tag, { backgroundColor: '#FEF2F2' }]}><Text style={[tdStyles.tagText, { color: '#DC2626' }]}>🚨 ESCALATED</Text></View>}
          </View>
          <Text style={[tdStyles.title, { color: colors.text }]}>{task.title}</Text>
          {task.description && <Text style={[tdStyles.desc, { color: colors.textMuted }]}>{task.description}</Text>}
        </View>

        {/* Info Grid */}
        <View style={[tdStyles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {task.assignee && <InfoRow icon="👤" label="Assignee" value={`${task.assignee.firstName} ${task.assignee.lastName}`} colors={colors} />}
          {task.team     && <InfoRow icon="👥" label="Team"     value={task.team.name} colors={colors} />}
          {task.dueDate  && <InfoRow icon="📅" label="Due Date" value={new Date(task.dueDate).toLocaleString()} colors={colors} />}
          {task.estimatedHours && <InfoRow icon="⏱" label="Estimated" value={`${task.estimatedHours}h`} colors={colors} />}
          {task.actualHours    && <InfoRow icon="⏱" label="Actual"    value={`${task.actualHours.toFixed(1)}h`} colors={colors} />}
          {task.category && <InfoRow icon="🏷" label="Category" value={task.category} colors={colors} />}
          {task.slaHours && <InfoRow icon="🎯" label="SLA"      value={`${task.slaHours}h`} colors={colors} />}
        </View>

        {/* Status Actions */}
        {(isAssignee || ['SUPER_ADMIN','ADMIN','MANAGER','TEAM_LEADER'].includes(user?.role || '')) && actions.length > 0 && (
          <View style={tdStyles.actionsRow}>
            {actions.map((a) => (
              <TouchableOpacity key={a.next} style={[tdStyles.actionBtn, { backgroundColor: a.color }]} onPress={() => handleStatusChange(a.next)}>
                <Text style={tdStyles.actionBtnText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Comments */}
        <Text style={[tdStyles.sectionTitle, { color: colors.text }]}>Comments ({task.comments?.length || 0})</Text>
        {(task.comments || []).map((c: any) => (
          <View key={c.id} style={[tdStyles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[tdStyles.commentAuthor, { color: colors.primary }]}>{c.user?.firstName} {c.user?.lastName}</Text>
            <Text style={[tdStyles.commentContent, { color: colors.text }]}>{c.content}</Text>
            <Text style={[tdStyles.commentTime, { color: colors.textMuted }]}>{new Date(c.createdAt).toLocaleString()}</Text>
          </View>
        ))}

        <View style={tdStyles.commentInput}>
          <TextInput
            style={[tdStyles.commentTextInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={comment} onChangeText={setComment}
            placeholder="Add a comment..." placeholderTextColor={colors.textMuted}
            multiline
          />
          <TouchableOpacity style={[tdStyles.sendBtn, { backgroundColor: colors.primary }]} onPress={submitComment} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={tdStyles.sendBtnText}>Send</Text>}
          </TouchableOpacity>
        </View>

        {/* History */}
        {(task.history || []).length > 0 && (
          <>
            <Text style={[tdStyles.sectionTitle, { color: colors.text }]}>History</Text>
            {task.history.slice(0, 5).map((h: any) => (
              <View key={h.id} style={tdStyles.historyRow}>
                <View style={tdStyles.historyDot} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  <Text style={{ fontWeight: '600' }}>{h.field}</Text>: {h.oldValue} → {h.newValue} · {new Date(h.createdAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={showReject} transparent animationType="slide">
        <View style={tdStyles.modalOverlay}>
          <View style={[tdStyles.modal, { backgroundColor: colors.card }]}>
            <Text style={[tdStyles.modalTitle, { color: colors.text }]}>Rejection Reason</Text>
            <TextInput
              style={[tdStyles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={rejectReason} onChangeText={setRejectReason}
              placeholder="Please explain why you are rejecting this task..."
              placeholderTextColor={colors.textMuted}
              multiline numberOfLines={4}
            />
            <View style={tdStyles.modalBtns}>
              <TouchableOpacity style={[tdStyles.modalBtn, { borderColor: colors.border }]} onPress={() => setShowReject(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[tdStyles.modalBtn, { backgroundColor: '#EF4444' }]} onPress={handleReject}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Reject Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const InfoRow = ({ icon, label, value, colors }: any) => (
  <View style={tdStyles.infoRow}>
    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{icon} {label}</Text>
    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500', textAlign: 'right', flex: 1 }}>{value}</Text>
  </View>
);

function getPriorityBg(p: string) { return { CRITICAL:'#FEF2F2', HIGH:'#FFFBEB', MEDIUM:'#EFF6FF', LOW:'#F0FDF4' }[p] || '#F3F4F6'; }
function getPriorityColor(p: string) { return { CRITICAL:'#DC2626', HIGH:'#D97706', MEDIUM:'#2563EB', LOW:'#059669' }[p] || '#6B7280'; }
function getStatusBg(s: string) { return { COMPLETED:'#ECFDF5', REJECTED:'#FEF2F2', IN_PROGRESS:'#FFFBEB', PENDING:'#F0F9FF', ACCEPTED:'#EFF6FF', ON_HOLD:'#F3F4F6' }[s] || '#F3F4F6'; }
function getStatusColor(s: string) { return { COMPLETED:'#059669', REJECTED:'#DC2626', IN_PROGRESS:'#D97706', PENDING:'#0284C7', ACCEPTED:'#2563EB', ON_HOLD:'#6B7280' }[s] || '#6B7280'; }

const tdStyles = StyleSheet.create({
  headerCard:     { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 12 },
  tags:           { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  tag:            { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText:        { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  title:          { fontSize: 18, fontWeight: '700', lineHeight: 26, marginBottom: 8 },
  desc:           { fontSize: 14, lineHeight: 22 },
  infoCard:       { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 12 },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  actionsRow:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn:      { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle:   { fontSize: 16, fontWeight: '600', marginBottom: 10, marginTop: 4 },
  commentCard:    { borderRadius: 12, borderWidth: 0.5, padding: 12, marginBottom: 8 },
  commentAuthor:  { fontWeight: '600', fontSize: 13, marginBottom: 4 },
  commentContent: { fontSize: 14, lineHeight: 20 },
  commentTime:    { fontSize: 11, marginTop: 4 },
  commentInput:   { flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'flex-end' },
  commentTextInput: { flex: 1, borderRadius: 12, borderWidth: 0.5, padding: 12, maxHeight: 100, fontSize: 14 },
  sendBtn:        { padding: 12, borderRadius: 12, justifyContent: 'center' },
  sendBtnText:    { color: '#fff', fontWeight: '600' },
  historyRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  historyDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9CA3AF', marginTop: 4 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:          { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle:     { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput:     { borderRadius: 12, borderWidth: 0.5, padding: 12, minHeight: 100, textAlignVertical: 'top', fontSize: 14 },
  modalBtns:      { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn:       { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 0.5 },
});

// ════════════════════════════════════════════════════════════
// screens/TimerScreen.tsx
// ════════════════════════════════════════════════════════════
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet as TS2, FlatList } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { startTimer, pauseTimer, resumeTimer, stopTimer, selectElapsed } from '../store/slices';
import { socketService } from '../services/socket.service';

export function TimerScreen() {
  const dispatch    = useDispatch<AppDispatch>();
  const timer       = useSelector((s: RootState) => s.timer);
  const tasks       = useSelector((s: RootState) => s.tasks.items.filter((t) => ['ACCEPTED','IN_PROGRESS'].includes(t.status)));
  const elapsed     = useSelector(selectElapsed);
  const { colors }  = useTheme();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const [displayMs, setDisplayMs] = useState(0);

  useEffect(() => {
    if (timer.activeTaskId && !timer.isPaused) {
      intervalRef.current = setInterval(() => setDisplayMs(Date.now()), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [timer.activeTaskId, timer.isPaused]);

  const msToDisplay = timer.startTime ? elapsed + (Date.now() - timer.startTime) : elapsed;
  const h = Math.floor(msToDisplay / 3600000);
  const m = Math.floor((msToDisplay % 3600000) / 60000);
  const s = Math.floor((msToDisplay % 60000)   / 1000);
  const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const handleStart = (taskId: string) => {
    dispatch(startTimer(taskId));
    socketService.startTimer(taskId);
  };
  const handlePause  = () => dispatch(pauseTimer());
  const handleResume = () => dispatch(resumeTimer());
  const handleStop   = () => {
    if (timer.activeTaskId) socketService.stopTimer(timer.activeTaskId);
    dispatch(stopTimer());
  };

  const activeTask = tasks.find((t) => t.id === timer.activeTaskId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={tmStyles.timerCard}>
        <Text style={[tmStyles.timerTitle, { color: colors.text }]}>
          {activeTask ? activeTask.title : 'No active task'}
        </Text>
        <Text style={[tmStyles.timerDisplay, { color: colors.primary }]}>{timeStr}</Text>

        {timer.activeTaskId ? (
          <View style={tmStyles.controlRow}>
            {timer.isPaused
              ? <TouchableOpacity style={[tmStyles.ctrlBtn, { backgroundColor: '#10B981' }]} onPress={handleResume}><Text style={tmStyles.ctrlBtnText}>▶ Resume</Text></TouchableOpacity>
              : <TouchableOpacity style={[tmStyles.ctrlBtn, { backgroundColor: '#F59E0B' }]} onPress={handlePause}><Text style={tmStyles.ctrlBtnText}>⏸ Pause</Text></TouchableOpacity>
            }
            <TouchableOpacity style={[tmStyles.ctrlBtn, { backgroundColor: '#EF4444' }]} onPress={handleStop}><Text style={tmStyles.ctrlBtnText}>⏹ Stop</Text></TouchableOpacity>
          </View>
        ) : null}
      </View>

      <Text style={[tmStyles.listTitle, { color: colors.text }]}>Your Active Tasks</Text>
      <FlatList
        data={tasks}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[tmStyles.taskRow, { backgroundColor: colors.card, borderColor: colors.border, borderColor: timer.activeTaskId === item.id ? colors.primary : colors.border }]}
            onPress={() => !timer.activeTaskId && handleStart(item.id)}
            disabled={!!timer.activeTaskId && timer.activeTaskId !== item.id}
          >
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.text, fontWeight: '600', fontSize: 14 }]} numberOfLines={1}>{item.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.status}</Text>
            </View>
            {!timer.activeTaskId
              ? <Text style={{ color: colors.primary, fontWeight: '700' }}>▶ Start</Text>
              : timer.activeTaskId === item.id
              ? <Text style={{ color: '#10B981', fontWeight: '700' }}>⏱ Active</Text>
              : null
            }
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const tmStyles = TS2.create({
  timerCard:    { margin: 20, padding: 32, borderRadius: 24, alignItems: 'center', backgroundColor: 'rgba(99,102,241,0.08)' },
  timerTitle:   { fontSize: 15, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  timerDisplay: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 2 },
  controlRow:   { flexDirection: 'row', gap: 12, marginTop: 24 },
  ctrlBtn:      { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  ctrlBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  listTitle:    { fontSize: 16, fontWeight: '600', paddingHorizontal: 20, marginBottom: 4 },
  taskRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
});
