import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getInspectionService } from '../../../src/services/inspection.service';
import { useTheme } from '../../../src/contexts/ThemeContext';

interface AreaRow { id: string; name?: string; position?: number }
interface ItemRow { id: string; text?: string }
interface GroupRow { id: string; name?: string; items?: ItemRow[] }

export default function TemplateAreaEditorScreen() {
  const { id, templateId } = useLocalSearchParams<{ id: string; templateId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const service = getInspectionService(db);
  const { colors } = useTheme();

  const [areaName, setAreaName] = useState('');
  const [area, setArea] = useState<AreaRow & { groups?: GroupRow[] } | null>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [newItemGroupId, setNewItemGroupId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupText, setNewGroupText] = useState('');

  const load = useCallback(async () => {
    if (String(id) === 'new') return;
    const data = await service.getArea(templateId, id);
    setArea(data);
    setAreaName((prev) => (prev === '' && data?.name ? data.name : prev));
  }, [service, templateId, id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAreaName = async () => {
    const name = areaName.trim();
    if (!name) return;
    await service.updateAreaName(id, name);
    setAreaName(name);
  };

  const addGroup = async () => {
    const name = newGroupText.trim();
    if (!name) return;
    await service.addGroup(id, name);
    setNewGroupText('');
    setNewGroupOpen(false);
    await load();
  };

  const addItem = async (groupId: string) => {
    const text = newItemText.trim();
    if (!text) return;
    await service.addItem(groupId, text);
    setNewItemText('');
    setNewItemGroupId(null);
    await load();
  };

  const saveItem = async (itemId: string) => {
    const text = itemDraft.trim();
    if (!text) return;
    await service.renameItem(itemId, text);
    setEditItemId(null);
    await load();
  };

  const saveGroup = async (groupId: string) => {
    const name = groupDraft.trim();
    if (!name) return;
    await service.renameGroup(groupId, name);
    setEditGroupId(null);
    await load();
  };

  const moveItem = async (groupId: string, itemId: string, dir: 'up' | 'down') => {
    await service.moveItem(groupId, itemId, dir);
    await load();
  };

  const moveGroup = async (groupId: string, dir: 'up' | 'down') => {
    await service.moveGroup(id, groupId, dir);
    await load();
  };

  const confirmDeleteArea = () => {
    Alert.alert('Excluir área', `Excluir "${areaName}" e todos os seus itens?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await service.deleteArea(id);
          router.back();
        },
      },
    ]);
  };

  const confirmDeleteGroup = (group: GroupRow) => {
    Alert.alert('Excluir grupo', `Excluir o grupo "${group.name}" e seus itens?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await service.deleteGroup(group.id);
          await load();
        },
      },
    ]);
  };

  const confirmDeleteItem = (item: ItemRow) => {
    Alert.alert('Excluir item', 'Excluir este item do checklist?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await service.deleteItem(item.id);
          await load();
        },
      },
    ]);
  };

  const isNew = String(id) === 'new';

  const createArea = async () => {
    const name = areaName.trim() || 'Nova área';
    const newId = await service.addArea(templateId, name);
    setAreaName(name);
    router.replace({ pathname: '/templates/area/[id]', params: { id: newId, templateId } });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Nome da área</Text>
      <View style={[styles.nameRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={areaName}
          onChangeText={setAreaName}
          onBlur={isNew ? undefined : saveAreaName}
          placeholder="Nome da área"
          placeholderTextColor={colors.textLight}
          style={[styles.nameInput, { color: colors.text }]}
        />
        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
      </View>

      {isNew ? (
        <Pressable
          style={[styles.addGroupBtn, { backgroundColor: colors.primary }]}
          onPress={createArea}
        >
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={[styles.addGroupText, { color: colors.white }]}>Criar área</Text>
        </Pressable>
      ) : (<>
        {(area?.groups ?? []).map((group) => (
        <View key={group.id} style={[styles.groupCard, { backgroundColor: colors.surface }]}>
          <View style={styles.groupHeader}>
            <View style={styles.moveCol}>
              <Pressable onPress={() => moveGroup(group.id, 'up')} hitSlop={6} style={styles.moveBtn}>
                <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => moveGroup(group.id, 'down')} hitSlop={6} style={styles.moveBtn}>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            {editGroupId === group.id ? (
              <View style={styles.itemEdit}>
                <TextInput
                  value={groupDraft}
                  onChangeText={setGroupDraft}
                  autoFocus
                  style={[styles.itemEditInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <Pressable onPress={() => saveGroup(group.id)} hitSlop={8}>
                  <Ionicons name="checkmark" size={20} color={colors.success} />
                </Pressable>
                <Pressable onPress={() => setEditGroupId(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textLight} />
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[styles.groupName, { color: colors.primary }]}>{group.name}</Text>
                <Pressable
                  onPress={() => {
                    setEditGroupId(group.id);
                    setGroupDraft(group.name ?? '');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.textSecondary} />
                </Pressable>
              </>
            )}
            <Pressable onPress={() => confirmDeleteGroup(group)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>

          {(group.items ?? []).map((item) => (
            <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.border }]}>
              {editItemId === item.id ? (
                <View style={styles.itemEdit}>
                  <TextInput
                    value={itemDraft}
                    onChangeText={setItemDraft}
                    autoFocus
                    style={[styles.itemEditInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                  <Pressable onPress={() => saveItem(item.id)} hitSlop={8}>
                    <Ionicons name="checkmark" size={20} color={colors.success} />
                  </Pressable>
                  <Pressable onPress={() => setEditItemId(null)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={colors.textLight} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={[styles.itemText, { color: colors.text }]}>{item.text}</Text>
                  <View style={styles.itemActions}>
                    <Pressable onPress={() => moveItem(group.id, item.id, 'up')} hitSlop={6}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => moveItem(group.id, item.id, 'down')} hitSlop={6}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditItemId(item.id);
                        setItemDraft(item.text ?? '');
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="pencil-outline" size={17} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteItem(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={17} color={colors.error} />
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ))}

          {newItemGroupId === group.id ? (
            <View style={[styles.addRow, { borderTopColor: colors.border }]}>
              <TextInput
                value={newItemText}
                onChangeText={setNewItemText}
                autoFocus
                placeholder="Novo item de verificação"
                placeholderTextColor={colors.textLight}
                style={[styles.addInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              <Pressable onPress={() => newItemText.trim() && addItem(group.id)} hitSlop={8}>
                <Ionicons name="checkmark" size={20} color={colors.success} />
              </Pressable>
              <Pressable onPress={() => setNewItemGroupId(null)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textLight} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.addItemBtn, { borderColor: colors.border }]}
              onPress={() => {
                setNewItemText('');
                setNewItemGroupId(group.id);
              }}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={[styles.addItemText, { color: colors.primary }]}>Adicionar item</Text>
            </Pressable>
          )}
        </View>
      ))}

      {newGroupOpen ? (
        <View style={[styles.newGroupBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            value={newGroupText}
            onChangeText={setNewGroupText}
            autoFocus
            placeholder="Nome do novo grupo"
            placeholderTextColor={colors.textLight}
            style={[styles.addInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <Pressable onPress={() => newGroupText.trim() && addGroup()} hitSlop={8}>
            <Ionicons name="checkmark" size={20} color={colors.success} />
          </Pressable>
          <Pressable onPress={() => setNewGroupOpen(false)} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textLight} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.addGroupBtn, { backgroundColor: colors.primaryLight }]}
          onPress={() => {
            setNewGroupText('');
            setNewGroupOpen(true);
          }}
        >
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={[styles.addGroupText, { color: colors.white }]}>Novo grupo</Text>
        </Pressable>
      )}

      <Pressable style={[styles.deleteBtn, { borderColor: colors.error }]} onPress={confirmDeleteArea}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
        <Text style={[styles.deleteBtnText, { color: colors.error }]}>Excluir área</Text>
      </Pressable>
      </>)}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  nameInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  groupCard: { borderRadius: 12, padding: 14, marginBottom: 12 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  groupName: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  moveCol: { alignItems: 'center', marginRight: 8 },
  moveBtn: { paddingVertical: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  itemText: { flex: 1, fontSize: 13, lineHeight: 18, marginRight: 8 },
  itemActions: { flexDirection: 'row', gap: 14 },
  itemEdit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemEditInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13 },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  addItemText: { fontSize: 13, fontWeight: '600' },
  newGroupBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 18,
  },
  addGroupText: { fontSize: 14, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600' },
});