import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getActionService } from '../../src/services/action.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppLogo } from '../../src/components/AppHeader';
import type { ActionItem, ActionStatus } from '../../src/types';

const STATUS_OPTIONS: { key: ActionStatus; label: string }[] = [
  { key: 'a_iniciar', label: 'A iniciar' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluido', label: 'Concluído' },
  { key: 'cancelado', label: 'Cancelado' },
];

const PRIORITY_OPTIONS = ['Baixa', 'Média', 'Alta'];

export default function ActionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();

  const [item, setItem] = useState<ActionItem | null>(null);
  const [status, setStatus] = useState<ActionStatus>('a_iniciar');
  const [what, setWhat] = useState('');
  const [how, setHow] = useState('');
  const [responsible, setResponsible] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [priority, setPriority] = useState('Média');
  const [investmentMin, setInvestmentMin] = useState('');
  const [investmentMax, setInvestmentMax] = useState('');
  const [reassessDate, setReassessDate] = useState('');
  const [showReassessPicker, setShowReassessPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const a = await getActionService(db).getAction(id);
    if (!a) return;
    setItem(a);
    setStatus(a.status);
    setWhat(a.actionWhat);
    setHow(a.actionHow);
    setResponsible(a.responsible);
    setDueDate(a.dueDate);
    setPriority(a.priority || 'Média');
    setInvestmentMin(a.investmentMin != null && a.investmentMin > 0 ? String(a.investmentMin) : '');
    setInvestmentMax(a.investmentMax != null && a.investmentMax > 0 ? String(a.investmentMax) : '');
    setReassessDate(a.reassessDate ?? '');
  }, [db, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const dateLabel = (d?: string) => (d ? d.split('-').reverse().join('/') : '');

  const onDueChange = (_event: DateTimePickerEvent, value?: Date) => {
    setShowDuePicker(false);
    if (_event.type === 'set' && value) setDueDate(value.toISOString().slice(0, 10));
  };

  const onReassessChange = (_event: DateTimePickerEvent, value?: Date) => {
    setShowReassessPicker(false);
    if (_event.type === 'set' && value) setReassessDate(value.toISOString().slice(0, 10));
  };

  const parseInvestment = (t: string) => {
    const n = parseFloat(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const save = async () => {
    setSaving(true);
    try {
      await getActionService(db).updateAction(item.id, {
        actionWhat: what.trim(),
        actionHow: how.trim(),
        responsible: responsible.trim(),
        dueDate,
        priority,
        investmentMin: parseInvestment(investmentMin),
        investmentMax: parseInvestment(investmentMax),
        reassessDate,
        status,
      });
      router.back();
    } catch (e) {
      Alert.alert('Erro ao salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <AppLogo size={38} rounded={9} />
          <View style={{ flex: 1 }}>
            <View style={styles.topMeta}>
              <View style={[styles.typeBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.typeBadgeText}>NÃO CONFORMIDADE</Text>
              </View>
            </View>
            <Text style={[styles.itemLabel, { color: colors.text }]} numberOfLines={3}>
              {item.itemLabel}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {[item.areaName, item.companyName].filter(Boolean).join(' • ')}
              {item.inspectionDate ? `  •  Vistoria: ${dateLabel(item.inspectionDate)}` : ''}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Status</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => {
            const active = status === opt.key;
            const statusColor =
              opt.key === 'a_iniciar' ? colors.warning : opt.key === 'em_andamento' ? colors.info : opt.key === 'concluido' ? colors.success : colors.textLight;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.statusBtn,
                  { borderColor: statusColor, backgroundColor: active ? statusColor : colors.surface },
                ]}
                onPress={() => setStatus(opt.key)}
              >
                <Text style={[styles.statusBtnText, { color: active ? '#fff' : statusColor }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Plano de ação</Text>
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>O quê (ação corretiva)</Text>
          <TextInput
            value={what}
            onChangeText={setWhat}
            placeholder="Descrição da ação corretiva..."
            placeholderTextColor={colors.textLight}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            multiline
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Como (método de execução)</Text>
          <TextInput
            value={how}
            onChangeText={setHow}
            placeholder="Como será executada a correção..."
            placeholderTextColor={colors.textLight}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            multiline
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Quem (responsável)</Text>
          <TextInput
            value={responsible}
            onChangeText={setResponsible}
            placeholder="Nome ou função do responsável..."
            placeholderTextColor={colors.textLight}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Prazo e prioridade</Text>
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Prazo (quando)</Text>
          <Pressable
            style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowDuePicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.dateBtnText, { color: dueDate ? colors.text : colors.textSecondary }]}>
              {dueDate ? dateLabel(dueDate) : 'Definir prazo'}
            </Text>
          </Pressable>
          {showDuePicker && (
            <DateTimePicker
              value={dueDate ? new Date(dueDate + 'T12:00:00') : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={onDueChange}
            />
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Prioridade</Text>
          <View style={styles.chipsRow}>
            {PRIORITY_OPTIONS.map((p) => {
              const active = priority === p;
              const pColor = p === 'Alta' ? colors.error : p === 'Média' ? colors.warning : colors.success;
              return (
                <Pressable
                  key={p}
                  style={[styles.chip, { borderColor: pColor, backgroundColor: active ? pColor : colors.background }]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : pColor }]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Investimento estimado (R$)</Text>
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.investRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Mínimo</Text>
              <TextInput
                value={investmentMin}
                onChangeText={setInvestmentMin}
                placeholder="0"
                placeholderTextColor={colors.textLight}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Máximo</Text>
              <TextInput
                value={investmentMax}
                onChangeText={setInvestmentMax}
                placeholder="0"
                placeholderTextColor={colors.textLight}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Reavaliação</Text>
        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Reavaliar até (opcional)</Text>
          <Pressable
            style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowReassessPicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.dateBtnText, { color: reassessDate ? colors.text : colors.textSecondary }]}>
              {reassessDate ? dateLabel(reassessDate) : 'Sem reavaliação'}
            </Text>
          </Pressable>
          {reassessDate ? (
            <Pressable onPress={() => setReassessDate('')} style={styles.clearReassess} hitSlop={8}>
              <Ionicons name="close-circle-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.clearReassessText, { color: colors.textSecondary }]}>Remover reavaliação</Text>
            </Pressable>
          ) : null}
          {showReassessPicker && (
            <DateTimePicker
              value={reassessDate ? new Date(reassessDate + 'T12:00:00') : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={onReassessChange}
            />
          )}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Se preenchida, esta NC aparece na lista de Reavaliações e na aba do plano 5W2H.
          </Text>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar alterações</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  topMeta: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  typeBadge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  itemLabel: { fontSize: 18, fontWeight: '700', lineHeight: 23 },
  meta: { fontSize: 12, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statusBtn: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  statusBtnText: { fontSize: 12, fontWeight: '700' },
  formCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  dateBtnText: { fontSize: 13 },
  clearReassess: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  clearReassessText: { fontSize: 12.5 },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1.5, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontWeight: '700', fontSize: 13 },
  investRow: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: 11, marginTop: 8 },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});