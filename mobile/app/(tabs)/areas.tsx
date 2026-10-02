import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getInspectionService } from '../../src/services/inspection.service';
import { seedLocalChecklist } from '../../src/db/seed';
import { useTheme } from '../../src/contexts/ThemeContext';
import { TemplateArea, Template } from '../../src/types';

export default function AreasScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [areas, setAreas] = useState<TemplateArea[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [localEdited, setLocalEdited] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadLocal = useCallback(async () => {
    const service = getInspectionService(db);
    const tmpls = await service.getTemplates();
    if (tmpls.length === 0) {
      setTemplate(null);
      setAreas([]);
      setLocalEdited(false);
      return;
    }
    const t = tmpls[0];
    setTemplate(t);
    setAreas(await service.getAreas(t.id));
    setLocalEdited(await service.isTemplateEdited(t.id));
  }, [db]);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  useFocusEffect(
    useCallback(() => {
      loadLocal();
    }, [loadLocal]),
  );

  const reloadSchedule = useCallback(() => {
    const service = getInspectionService(db);
    service
      .getNextSiteInspectionDate()
      .then(setNextDate)
      .catch(() => {});
  }, [db]);

  useEffect(() => {
    reloadSchedule();
  }, [reloadSchedule]);

  useFocusEffect(
    useCallback(() => {
      reloadSchedule();
    }, [reloadSchedule]),
  );

  const onScheduleChange = async (_event: DateTimePickerEvent, date?: Date) => {
    setShowPicker(false);
    if (_event.type !== 'set' || !date) return;
    const iso = date.toISOString().slice(0, 10);
    const service = getInspectionService(db);
    await service.setNextSiteInspectionDate(iso);
    setNextDate(iso);
  };

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const goNewInspection = (preselectId?: string) => {
    router.push({
      pathname: '/inspection/new',
      params: preselectId ? { preselect: preselectId } : {},
    });
  };

  const openEditor = (area: TemplateArea) => {
    if (!template) return;
    router.push({ pathname: '/templates/area/[id]', params: { id: area.id, templateId: template.id } });
  };

  const addArea = () => {
    if (!template) return;
    router.push({ pathname: '/templates/area/[id]', params: { id: 'new', templateId: template.id } });
  };

  const moveArea = async (areaId: string, dir: 'up' | 'down') => {
    if (!template) return;
    const service = getInspectionService(db);
    await service.moveArea(template.id, areaId, dir);
    setAreas(await service.getAreas(template.id));
  };

  const restoreOfficial = async () => {
    if (!template) return;
    const service = getInspectionService(db);
    await service.resetTemplateDirty(template.id);
    setLocalEdited(false);
  };

  const createDefaultChecklist = async () => {
    setSeeding(true);
    try {
      await seedLocalChecklist(db);
      await loadLocal();
    } finally {
      setSeeding(false);
    }
  };

  const renderItem = ({ item }: { item: TemplateArea }) => {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Pressable style={styles.cardMain} onPress={() => goNewInspection(item.id)}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="business" size={22} color={colors.white} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.areaName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.areaCount, { color: colors.textSecondary }]}>
              {item.itemCount ?? 0} itens de verificação
            </Text>
          </View>
        </Pressable>
        <View style={styles.moveCol}>
          <Pressable onPress={() => moveArea(item.id, 'up')} hitSlop={6}>
            <Ionicons name="chevron-up" size={17} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => moveArea(item.id, 'down')} hitSlop={6}>
            <Ionicons name="chevron-down" size={17} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
        <Pressable style={styles.editBtn} onPress={() => openEditor(item)} hitSlop={8}>
          <Ionicons name="pencil" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!nextDate && nextDate < today;
  const parseScheduled = (iso?: string) => {
    if (!iso) return new Date(Date.now() + 182 * 86400000);
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={areas}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          template ? (
            <View>
              {localEdited && (
                <View style={[styles.dirtyRow, { backgroundColor: colors.warning, borderColor: colors.warning }]}>
                  <Ionicons name="warning-outline" size={14} color="#fff" />
                  <Text style={styles.dirtyText}>Modelo editado localmente</Text>
                  <Pressable onPress={restoreOfficial} hitSlop={8}>
                    <Ionicons name="refresh" size={15} color="#fff" />
                  </Pressable>
                </View>
              )}
              <Pressable style={[styles.newInspectionBtn, { backgroundColor: colors.primary }]} onPress={() => goNewInspection()}>
                <Ionicons name="create-outline" size={16} color={colors.white} />
                <Text style={styles.newInspectionText}>Nova vistoria do empreendimento</Text>
              </Pressable>
              <Pressable
                style={[styles.scheduleChip, { alignSelf: 'flex-start' }, { borderColor: overdue ? colors.error : colors.primary, marginBottom: 16 }]}
                onPress={() => setShowPicker(true)}
              >
                <Ionicons name="calendar-outline" size={13} color={overdue ? colors.error : colors.primary} />
                <Text style={[styles.scheduleText, { color: overdue ? colors.error : colors.primary }]}>
                  {nextDate
                    ? `Próxima vistoria: ${formatDate(nextDate)}${overdue ? ' (atrasada)' : ''}`
                    : 'Definir próxima vistoria'}
                </Text>
              </Pressable>
              {showPicker && (
                <DateTimePicker
                  display="default"
                  mode="date"
                  value={parseScheduled(nextDate ?? undefined)}
                  onChange={onScheduleChange}
                />
              )}
              <Pressable style={[styles.newAreaBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={addArea}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[styles.newAreaText, { color: colors.primary }]}>Nova área</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color={colors.textLight} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nenhum checklist neste aparelho</Text>
            <Text style={[styles.emptyHint, { color: colors.textLight }]}>
              Crie um novo a partir do checklist padrão ou edite as áreas depois
            </Text>
            <Pressable style={[styles.retryBtn, { borderColor: colors.primary }]} onPress={createDefaultChecklist} disabled={seeding}>
              {seeding ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.retryText, { color: colors.primary }]}>Criar checklist padrão</Text>
                </>
              )}
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  editBtn: { marginLeft: 4, padding: 4 },
  scheduleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  scheduleText: { fontSize: 12, fontWeight: '600' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  moveCol: { alignItems: 'center', marginRight: 10 },
  dirtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  dirtyText: { color: '#fff', flex: 1, fontSize: 12, fontWeight: '700' },
  areaName: { fontSize: 15, fontWeight: '600' },
  areaCount: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyText: { marginTop: 12, fontSize: 15, textAlign: 'center' },
  emptyHint: { marginTop: 4, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  retryText: { fontSize: 14, fontWeight: '700' },
  newAreaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  newAreaText: { fontSize: 14, fontWeight: '600' },
  newInspectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 10,
  },
  newInspectionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});