import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getEmpreendimentoService } from '../../src/services/empreendimento.service';
import type { Empreendimento } from '../../src/types';

export default function EmpreendimentosScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [items, setItems] = useState<Empreendimento[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const service = getEmpreendimentoService(db);
    const list = await service.list({ includeArchived: showArchived });
    const tally: Record<string, number> = {};
    for (const emp of list) {
      tally[emp.id] = await service.countInspections(emp.id);
    }
    setItems(list);
    setCounts(tally);
    setLoading(false);
  }, [db, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  const toggleArchive = (emp: Empreendimento) => {
    const archiving = emp.active;
    Alert.alert(
      archiving ? 'Arquivar empreendimento' : 'Reativar empreendimento',
      archiving
        ? `${emp.name} deixa de aparecer na lista de escolha, mas o histórico das vistorias é mantido.`
        : `${emp.name} volta a ficar disponível para novas vistorias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Arquivar' : 'Reativar',
          style: archiving ? 'destructive' : 'default',
          onPress: async () => {
            await getEmpreendimentoService(db).setArchived(emp.id, archiving);
            await load();
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Empreendimento }) => {
    const n = counts[item.id] ?? 0;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardMain}>
          <View style={[styles.iconWrap, { backgroundColor: item.active ? colors.primaryLight : colors.border }]}>
            <Ionicons name="business" size={20} color={item.active ? colors.white : colors.textSecondary} />
          </View>
          <View style={styles.cardBody}>
            <Text
              style={[styles.name, { color: item.active ? colors.text : colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {n === 0 ? 'Nenhuma vistoria registrada' : `${n} vistoria${n === 1 ? '' : 's'}`}
              {item.contratante ? ` · ${item.contratante}` : ''}
            </Text>
            {item.address ? (
              <Text style={[styles.address, { color: colors.textLight }]} numberOfLines={1}>
                {item.address}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actions}>
          {!item.active && (
            <View style={[styles.badge, { backgroundColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>Arquivado</Text>
            </View>
          )}
          <Pressable onPress={() => toggleArchive(item)} hitSlop={8} style={styles.iconBtn}>
            <Ionicons
              name={item.active ? 'archive-outline' : 'refresh-outline'}
              size={19}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/empreendimentos/[id]', params: { id: item.id } })
            }
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Ionicons name="pencil" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.topRow}>
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={[styles.title, { color: colors.text }]}>Empreendimentos</Text>
            </View>

            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textLight} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar empreendimento"
                placeholderTextColor={colors.textLight}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textLight} />
                </Pressable>
              )}
            </View>

            <Pressable
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push({ pathname: '/empreendimentos/[id]', params: { id: 'new' } })}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>Cadastrar empreendimento</Text>
            </Pressable>

            <Pressable
              style={[styles.archiveChip, { borderColor: colors.border }]}
              onPress={() => setShowArchived((v) => !v)}
            >
              <Ionicons
                name={showArchived ? 'checkbox' : 'square-outline'}
                size={15}
                color={colors.textSecondary}
              />
              <Text style={[styles.archiveText, { color: colors.textSecondary }]}>
                Mostrar arquivados
              </Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.emptySpinner} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={34} color={colors.textLight} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                {query.trim() ? 'Nenhum empreendimento encontrado' : 'Nenhum empreendimento cadastrado'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textLight }]}>
                {query.trim()
                  ? 'Ajuste a busca ou cadastre um novo.'
                  : 'Cadastre os locais que você vistoria para organizar o histórico e os relatórios.'}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  title: { fontSize: 19, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    height: 46,
    marginTop: 12,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  archiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  archiveText: { fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12.5 },
  address: { fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 6 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptySpinner: { marginTop: 48 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
