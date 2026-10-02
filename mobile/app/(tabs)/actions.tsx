import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getActionService } from '../../src/services/action.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import type { ActionItem, ActionStatus } from '../../src/types';

const STATUS_FILTERS: { key: ActionStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'a_iniciar', label: 'A iniciar' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluido', label: 'Concluído' },
  { key: 'cancelado', label: 'Cancelado' },
];

export default function ActionsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'ALL'>('ALL');

  const load = useCallback(async () => {
    // Apenas NC viram ação corretiva; N/A é estado terminal (não aplicável).
    setActions(await getActionService(db).getActions({ type: 'NC' }));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = actions.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    return true;
  });

  const openCount = actions.filter((a) => a.status === 'a_iniciar' || a.status === 'em_andamento').length;
  const today = new Date().toISOString().slice(0, 10);

  const statusMeta = (status: ActionStatus) => {
    switch (status) {
      case 'a_iniciar': return { label: 'A iniciar', color: colors.warning };
      case 'em_andamento': return { label: 'Em andamento', color: colors.info };
      case 'concluido': return { label: 'Concluído', color: colors.success };
      default: return { label: 'Cancelado', color: colors.textLight };
    }
  };

  const isOverdue = (a: ActionItem) =>
    a.dueDate !== '' && a.dueDate < today && (a.status === 'a_iniciar' || a.status === 'em_andamento');

  const priorityColor = (p: string) =>
    p === 'Alta' ? colors.error : p === 'Média' ? colors.warning : colors.textSecondary;

  const renderItem = ({ item }: { item: ActionItem }) => {
    const st = statusMeta(item.status);
    const overdue = isOverdue(item);
    const dateLabel = item.inspectionDate ? (item.inspectionDate ?? '').split('-').reverse().join('/') : '';
    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: '/actions/[id]', params: { id: item.id } })}
      >
        <View style={[styles.statusBar, { backgroundColor: st.color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={[styles.typeBadge, { backgroundColor: item.type === 'NC' ? colors.error : colors.textSecondary }]}>
              <Text style={styles.typeBadgeText}>{item.type === 'NC' ? 'NC' : 'N/A'}</Text>
            </View>
            <Text style={[styles.itemLabel, { color: colors.text }]} numberOfLines={2}>
              {item.itemLabel}
            </Text>
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {[item.companyName, item.areaName].filter(Boolean).join(' • ')}
          </Text>
          <View style={styles.metaRow}>
            {overdue ? (
              <View style={[styles.dueChip, { backgroundColor: colors.error }]}>
                <Ionicons name="alert-circle" size={12} color="#fff" />
                <Text style={styles.dueChipText}>Vencida {item.dueDate.split('-').reverse().join('/')}</Text>
              </View>
            ) : item.dueDate ? (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                Prazo: {item.dueDate.split('-').reverse().join('/')}
              </Text>
            ) : null}
            {item.priority && item.priority !== '' ? (
              <Text style={[styles.metaText, { color: priorityColor(item.priority) }]}>
                {item.priority}
              </Text>
            ) : null}
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{st.label}</Text>
            {dateLabel ? <Text style={[styles.metaText, { color: colors.textLight }]}>Vistoria: {dateLabel}</Text> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          {openCount > 0 ? `${openCount} ação(ões) em aberto` : 'Nenhuma ação em aberto'}
        </Text>
        <Text style={[styles.summaryCount, { color: colors.primary }]}>{actions.length} total</Text>
      </View>

      <View style={styles.chipsWrap}>
        <View style={styles.chipsRow}>
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.primary }]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.chipText, { color: active ? colors.white : colors.primary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkbox-outline" size={48} color={colors.textLight} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {actions.length === 0 ? 'Nenhuma ação encontrada' : 'Nada para os filtros selecionados'}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textLight }]}>
              {actions.length === 0
                ? 'Itens marcados como NC em uma vistoria geram ações automaticamente aqui.'
                : 'Tente mudar os filtros.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  summaryText: { fontSize: 13 },
  summaryCount: { fontSize: 13, fontWeight: '700' },
  chipsWrap: { paddingHorizontal: 16, gap: 4, paddingBottom: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 96 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 10,
    paddingLeft: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statusBar: { width: 5, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  typeBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginTop: 1 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  itemLabel: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  meta: { fontSize: 12, marginTop: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 6 },
  metaText: { fontSize: 12 },
  dueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dueChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyText: { marginTop: 12, fontSize: 15, textAlign: 'center' },
  emptyHint: { marginTop: 4, fontSize: 13, textAlign: 'center' },
});