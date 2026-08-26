import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { BASE_URL, userAPI } from '../services/api.service';
import { useTheme } from '../hooks/useTheme';
import type { RootState } from '../store';

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEADER'];

interface UploadResult {
  summary:         { total: number; created: number; failed: number };
  defaultPassword: string;
  results:         Array<{ row: number; email: string; employeeId?: string; status: 'created' | 'failed'; error?: string }>;
}

export function BulkUploadScreen() {
  const { colors }  = useTheme();
  const { user }    = useSelector((s: RootState) => s.auth);

  const [pickedFile,   setPickedFile]   = useState<any>(null);
  const [uploading,    setUploading]    = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [result,       setResult]       = useState<UploadResult | null>(null);
  const [error,        setError]        = useState('');

  // ── Access guard ─────────────────────────────────────────────
  if (!MANAGEMENT_ROLES.includes(user?.role || '')) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Text style={s.lockIcon}>🔒</Text>
        <Text style={[s.noAccess, { color: colors.textMuted }]}>
          This feature is available to{'\n'}ADMIN, MANAGER, and TEAM LEADER roles only.
        </Text>
      </View>
    );
  }

  // ── Download template ─────────────────────────────────────────
  const downloadTemplate = async () => {
    setDownloading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const filename = 'employee-bulk-upload-template.xlsx';
      const destPath = Platform.OS === 'android'
        ? `${RNFS.DownloadDirectoryPath}/${filename}`
        : `${RNFS.DocumentDirectoryPath}/${filename}`;

      const { promise } = RNFS.downloadFile({
        fromUrl: `${BASE_URL}/users/bulk-upload/template`,
        toFile:  destPath,
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await promise;
      if (res.statusCode === 200) {
        Alert.alert(
          'Template Downloaded ✓',
          `Saved to your ${Platform.OS === 'android' ? 'Downloads' : 'Files/Documents'} folder.\n\nFile: ${filename}`,
        );
      } else {
        setError('Server error while downloading — please try again.');
      }
    } catch {
      setError('Download failed. Check your connection and try again.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Pick Excel file ───────────────────────────────────────────
  const pickFile = async () => {
    try {
      const file = await DocumentPicker.pickSingle({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyTo: 'cachesDirectory',
      });
      setPickedFile(file);
      setResult(null);
      setError('');
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        setError('Could not open file picker. Please try again.');
      }
    }
  };

  // ── Upload ────────────────────────────────────────────────────
  const upload = async () => {
    if (!pickedFile) { setError('Please select an Excel file first.'); return; }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', {
        uri:  pickedFile.fileCopyUri ?? pickedFile.uri,
        type: pickedFile.type ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: pickedFile.name ?? 'employees.xlsx',
      } as any);

      const { data } = await userAPI.bulkUpload(form);
      setResult(data.data as UploadResult);
      setPickedFile(null);
    } catch (e: any) {
      setError(
        e.response?.data?.message ||
        'Upload failed. Make sure the file matches the template format (max 500 rows).',
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Hero banner */}
      <View style={[s.hero, { backgroundColor: colors.primary }]}>
        <Text style={s.heroIcon}>📊</Text>
        <Text style={s.heroTitle}>Bulk Employee Upload</Text>
        <Text style={s.heroSub}>Import up to 500 employees from a single Excel file</Text>
      </View>

      {/* How it works */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>How It Works</Text>
        {[
          { n: '1', t: 'Download the Excel template' },
          { n: '2', t: 'Fill in employee details — one row per person' },
          { n: '3', t: 'Upload the completed file here' },
        ].map(({ n, t }) => (
          <View key={n} style={s.stepRow}>
            <View style={[s.stepNum, { backgroundColor: colors.primary }]}>
              <Text style={s.stepNumText}>{n}</Text>
            </View>
            <Text style={[s.stepText, { color: colors.textMuted }]}>{t}</Text>
          </View>
        ))}
        <View style={s.infoBox}>
          <Text style={s.infoText}>
            📌  Every imported employee receives the same default password and must change it on first login.
          </Text>
        </View>
      </View>

      {/* Step 1 — Download template */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>Step 1 — Download Template</Text>
        <Text style={[s.cardHint, { color: colors.textMuted }]}>
          The template has two sheets: a fillable table and instructions for each column.
        </Text>
        <TouchableOpacity
          style={[s.outlineBtn, { borderColor: colors.primary }, downloading && s.btnDisabled]}
          onPress={downloadTemplate}
          disabled={downloading}
          activeOpacity={0.7}
        >
          {downloading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={[s.outlineBtnText, { color: colors.primary }]}>⬇  Download Excel Template</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Step 2 — Pick file */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.cardTitle, { color: colors.text }]}>Step 2 — Select Your File</Text>
        <TouchableOpacity
          style={[
            s.filePicker,
            { borderColor: pickedFile ? colors.primary : colors.border, backgroundColor: colors.background },
          ]}
          onPress={pickFile}
          activeOpacity={0.7}
        >
          {pickedFile ? (
            <View style={s.fileRow}>
              <Text style={s.filePickedIcon}>📎</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.fileName, { color: colors.text }]} numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text style={[s.fileHint, { color: colors.textMuted }]}>
                  {pickedFile.size ? `${(pickedFile.size / 1024).toFixed(1)} KB · ` : ''}tap to change
                </Text>
              </View>
              <Text style={[s.changeText, { color: colors.primary }]}>Change</Text>
            </View>
          ) : (
            <View style={s.fileEmpty}>
              <Text style={s.fileEmptyIcon}>📂</Text>
              <Text style={[s.fileEmptyLabel, { color: colors.textMuted }]}>Tap to choose .xlsx file</Text>
              <Text style={[s.fileEmptyHint, { color: colors.textMuted }]}>Maximum 5 MB · up to 500 rows</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Error message */}
      {!!error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>⚠  {error}</Text>
        </View>
      )}

      {/* Upload button */}
      <TouchableOpacity
        style={[s.primaryBtn, { backgroundColor: colors.primary }, (!pickedFile || uploading) && s.btnDisabled]}
        onPress={upload}
        disabled={!pickedFile || uploading}
        activeOpacity={0.8}
      >
        {uploading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.primaryBtnText}>⬆  Upload & Import Employees</Text>
        }
      </TouchableOpacity>

      {/* Results */}
      {result && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Upload Results</Text>

          {/* Summary tiles */}
          <View style={s.summaryRow}>
            <View style={[s.summaryTile, { backgroundColor: '#ECFDF5' }]}>
              <Text style={[s.summaryNum, { color: '#059669' }]}>{result.summary.created}</Text>
              <Text style={s.summaryLbl}>Created</Text>
            </View>
            <View style={[s.summaryTile, { backgroundColor: result.summary.failed > 0 ? '#FEF2F2' : '#F3F4F6' }]}>
              <Text style={[s.summaryNum, { color: result.summary.failed > 0 ? '#DC2626' : '#9CA3AF' }]}>
                {result.summary.failed}
              </Text>
              <Text style={s.summaryLbl}>Failed</Text>
            </View>
            <View style={[s.summaryTile, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[s.summaryNum, { color: '#3B82F6' }]}>{result.summary.total}</Text>
              <Text style={s.summaryLbl}>Total</Text>
            </View>
          </View>

          {/* Default password */}
          {!!result.defaultPassword && (
            <View style={s.pwBox}>
              <Text style={s.pwLabel}>Default password assigned to all new employees:</Text>
              <Text style={s.pwValue}>{result.defaultPassword}</Text>
              <Text style={s.pwNote}>Employees must change this the moment they first log in.</Text>
            </View>
          )}

          {/* Created rows (first 5) */}
          {result.summary.created > 0 && (
            <View style={s.createdList}>
              <Text style={[s.subHeader, { color: colors.text }]}>
                ✅ Created ({result.summary.created})
              </Text>
              {result.results
                .filter(r => r.status === 'created')
                .slice(0, 5)
                .map((r, i) => (
                  <View key={i} style={s.createdRow}>
                    <Text style={s.createdId}>{r.employeeId}</Text>
                    <Text style={[s.createdEmail, { color: colors.textMuted }]}>{r.email}</Text>
                  </View>
                ))}
              {result.summary.created > 5 && (
                <Text style={[s.moreText, { color: colors.textMuted }]}>
                  + {result.summary.created - 5} more — check the Employees list
                </Text>
              )}
            </View>
          )}

          {/* Failed rows */}
          {result.summary.failed > 0 && (
            <View style={s.failedList}>
              <Text style={[s.subHeader, { color: colors.text }]}>
                ❌ Failed ({result.summary.failed})
              </Text>
              {result.results
                .filter(r => r.status === 'failed')
                .map((r, i) => (
                  <View key={i} style={s.failedRow}>
                    <Text style={s.failedRowMeta}>Row {r.row} · {r.email || 'no email'}</Text>
                    <Text style={s.failedErr}>{r.error}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { padding: 16 },

  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockIcon:        { fontSize: 40, marginBottom: 16, textAlign: 'center' },
  noAccess:        { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  hero:            { borderRadius: 18, padding: 28, alignItems: 'center', marginBottom: 16 },
  heroIcon:        { fontSize: 40, marginBottom: 10 },
  heroTitle:       { color: '#fff', fontSize: 21, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  heroSub:         { color: 'rgba(255,255,255,0.82)', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  card:            { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 14 },
  cardTitle:       { fontSize: 11, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardHint:        { fontSize: 12, marginBottom: 12, lineHeight: 18 },

  stepRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  stepNum:         { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepText:        { fontSize: 13, flex: 1, lineHeight: 20 },
  infoBox:         { backgroundColor: '#FFF3CD', borderRadius: 10, padding: 12, marginTop: 4 },
  infoText:        { color: '#856404', fontSize: 12, lineHeight: 18 },

  outlineBtn:      { borderWidth: 1.5, borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  outlineBtnText:  { fontSize: 14, fontWeight: '600' },

  filePicker:      { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, minHeight: 80, justifyContent: 'center', padding: 16 },
  fileRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filePickedIcon:  { fontSize: 26 },
  fileName:        { fontSize: 14, fontWeight: '500' },
  fileHint:        { fontSize: 11, marginTop: 2 },
  changeText:      { fontSize: 13, fontWeight: '600' },
  fileEmpty:       { alignItems: 'center', gap: 6 },
  fileEmptyIcon:   { fontSize: 30 },
  fileEmptyLabel:  { fontSize: 14, fontWeight: '500' },
  fileEmptyHint:   { fontSize: 11 },

  errorBox:        { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText:       { color: '#DC2626', fontSize: 13, lineHeight: 18 },

  primaryBtn:      { borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52, marginBottom: 16 },
  primaryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled:     { opacity: 0.45 },

  summaryRow:      { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryTile:     { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  summaryNum:      { fontSize: 30, fontWeight: '800' },
  summaryLbl:      { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '500' },

  pwBox:           { backgroundColor: '#FFF3CD', borderRadius: 10, padding: 14, marginBottom: 14 },
  pwLabel:         { color: '#856404', fontSize: 12, marginBottom: 6 },
  pwValue:         { color: '#856404', fontSize: 22, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 },
  pwNote:          { color: '#856404', fontSize: 11, marginTop: 6, lineHeight: 16 },

  subHeader:       { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  createdList:     { marginBottom: 12 },
  createdRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  createdId:       { fontSize: 12, fontWeight: '600', color: '#059669', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  createdEmail:    { fontSize: 12 },
  moreText:        { fontSize: 12, textAlign: 'center', marginTop: 6 },

  failedList:      { },
  failedRow:       { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, marginBottom: 6 },
  failedRowMeta:   { color: '#DC2626', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  failedErr:       { color: '#B91C1C', fontSize: 12, lineHeight: 16 },
});
