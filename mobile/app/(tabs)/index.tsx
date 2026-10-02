import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getInspectionService } from '../../src/services/inspection.service';
import { getInspectorName } from '../../src/services/settings.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import type { Inspection } from '../../src/types';

const STATUS_COLORS: Record<string, string> = {
  draft: '#cc8800',
  completed: '#2E7D32',
};

const STATUS_LABELS: Record<string, string> = {
  ALL: 'Todos',
  draft: 'Rascunho',
  completed: 'Concluída',
};

const FILTERS = ['ALL', 'draft', 'completed'] as const;

export default function InspectionsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [inspectorName, setInspectorName] = useState('Inspetor');

  const load = async () => {
    const service = getInspectionService(db);
    setInspections(await service.listInspections());
  };

  useEffect(() => {
    load();
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      getInspectorName(db).then(setInspectorName);
    }, [db]),
  );

  const areaLabel = (item: Inspection) => {
    if ((item.areas ?? []).length > 0) return (item.areas ?? []).map((a) => a.name).join(', ');
    return item.areaName;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inspections.filter((item) => {
      if (filter !== 'ALL' && item.status !== filter) return false;
      if (!q) return true;
      const haystack = [areaLabel(item), item.inspectorName ?? '', item.date ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [inspections, query, filter]);

  const removeInspection = (item: Inspection) => {
    Alert.alert(
      'Excluir vistoria',
      `Excluir definitivamente a vistoria de ${item.companyName ?? areaLabel(item)} (${(item.date ?? '').split('-').reverse().join('/')})?\n\nAs fotos anexadas também serão removidas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await getInspectionService(db).deleteInspection(item.id);
            await load();
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Inspection }) => {
    const answered = (item.items ?? []).filter((i) => i.status !== 'pending').length;
    const total = (item.items ?? []).length;
    const nc = (item.items ?? []).filter((i) => i.status === 'NC').length;
    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.areaName, { color: colors.text }]} numberOfLines={2}>{areaLabel(item)}</Text>
          <Pressable onPress={() => removeInspection(item)} hitSlop={10} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.textLight} />
          </Pressable>
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] ?? colors.textLight }]}>
            <Text style={styles.badgeText}>
              {item.status === 'draft' ? 'RASCUNHO' : 'CONCLUÍDA'}
            </Text>
          </View>
        </View>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {item.date ?? '—'} · {item.inspectorName ?? 'Inspetor'}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={[styles.progress, { color: colors.textSecondary }]}>
            {answered}/{total} itens respondidos
          </Text>
          {nc > 0 && (
            <View style={styles.ncChip}>
              <Text style={styles.ncChipText}>{nc} NC</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Text style={[styles.greeting, { color: colors.text }]} numberOfLines={1}>
          Olá, {inspectorName}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="settings-outline" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/empreendimentos')}
            hitSlop={8}
            style={[styles.empLink, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="business-outline" size={15} color={colors.primary} />
            <Text style={[styles.empLinkText, { color: colors.textSecondary }]}>Empreendimentos</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textLight} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por área, inspetor ou data..."
            placeholderTextColor={colors.textLight}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query !== '' && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textLight} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.chipsRow}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.primary }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, { color: active ? colors.white : colors.primary }]}>
                {STATUS_LABELS[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textLight} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {inspections.length === 0 ? 'Nenhuma inspeção registrada' : 'Nada encontrado para a busca/filtro'}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textLight }]}>
              {inspections.length === 0 ? 'Vá em "Áreas" e inicie uma nova inspeção' : 'Tente outros termos ou limpe o filtro'}
            </Text>
          </View>
        }
      />

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/areas')}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  empLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empLinkText: { fontSize: 12.5, fontWeight: '600' },
  greeting: { fontSize: 18, fontWeight: '700', flex: 1, marginRight: 8 },
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 96 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  deleteBtn: { padding: 2, marginRight: 6 },
  areaName: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  meta: { marginTop: 6, fontSize: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progress: { fontSize: 12 },
  ncChip: { backgroundColor: '#cc3333', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  ncChipText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { marginTop: 12, fontSize: 15 },
  emptyHint: { marginTop: 4, fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});