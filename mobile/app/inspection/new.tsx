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
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getInspectionService } from '../../src/services/inspection.service';
import { getEmpreendimentoService } from '../../src/services/empreendimento.service';
import { getInspectorName } from '../../src/services/settings.service';
import { LOCAL_USER } from '../../src/constants/user';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppLogo } from '../../src/components/AppHeader';
import type { Empreendimento, Template, TemplateArea } from '../../src/types';

export default function NewInspectionScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { preselect, empreendimento } = useLocalSearchParams<{ preselect?: string; empreendimento?: string }>();

  const [template, setTemplate] = useState<Template | null>(null);
  const [areas, setAreas] = useState<TemplateArea[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Empreendimento | null>(null);
  const [showEmpList, setShowEmpList] = useState(false);
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [inspectorName, setInspectorName] = useState(LOCAL_USER.name);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getInspectorName(db).then(setInspectorName);
  }, [db]);

  useEffect(() => {
    const service = getInspectionService(db);
    service.getTemplates().then((tmpls) => {
      if (tmpls.length === 0) return;
      const tmpl = tmpls[0];
      setTemplate(tmpl);
      (async () => {
        const areaList = await service.getAreasWithItems(tmpl.id);
        setAreas(areaList);
        const initial = new Set<string>();
        if (preselect) {
          const target = areaList.find((a) => a.id === preselect);
          for (const g of target?.groups ?? []) {
            for (const it of g.items) initial.add(it.id);
          }
        }
        setSelectedItems(initial);
      })();
    });
    getEmpreendimentoService(db)
      .list()
      .then((list) => {
        setEmpreendimentos(list);
        if (empreendimento) {
          const target = list.find((e) => e.id === empreendimento);
          if (target) setSelectedEmp(target);
        } else if (list.length === 1) {
          setSelectedEmp(list[0]);
        }
      });
  }, [db, preselect, empreendimento]);

  const selectedCount = (area: TemplateArea) => {
    let count = 0;
    for (const g of area.groups) {
      for (const it of g.items) if (selectedItems.has(it.id)) count += 1;
    }
    return count;
  };

  const areaAllSelected = (area: TemplateArea) => {
    const total = area.groups.reduce((n, g) => n + g.items.length, 0);
    return total > 0 && selectedCount(area) === total;
  };

  const areaSomeSelected = (area: TemplateArea) => !areaAllSelected(area) && selectedCount(area) > 0;

  const areaItemIds = (area: TemplateArea): string[] =>
    area.groups.flatMap((g) => g.items.map((it) => it.id));

  const toggleArea = (area: TemplateArea) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const ids = areaItemIds(area);
      if (areaAllSelected(area)) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedItems((prev) => (prev.size === totalItemsAll ? new Set() : new Set(areaItemIdsAll)));
  };

  const areaItemIdsAll = areas.flatMap(areaItemIds);
  const totalItemsAll = areaItemIdsAll.length;

  const onDateChange = (_event: DateTimePickerEvent, value?: Date) => {
    setShowDatePicker(false);
    if (_event.type === 'set' && value) setDate(value.toISOString().slice(0, 10));
  };

  const create = useCallback(async () => {
    if (!template) return;
    const picked = areas
      .map((a) => ({ id: a.id, name: a.name, itemIds: areaItemIds(a).filter((id) => selectedItems.has(id)) }))
      .filter((a) => a.itemIds.length > 0);
    if (picked.length === 0) {
      Alert.alert('Nenhum item selecionado', 'Marque pelo menos uma área ou item para criar a vistoria.');
      return;
    }
    if (!selectedEmp) {
      Alert.alert(
        'Escolha o empreendimento',
        'Selecione o empreendimento cadastrado que será vistoriado.',
      );
      return;
    }
    setCreating(true);
    try {
      const inspection = await getInspectionService(db).createInspection({
        companyId: template.companyId,
        templateId: template.id,
        companyName: selectedEmp.name,
        empreendimentoId: selectedEmp.id,
        empreendimentoName: selectedEmp.name,
        address: address.trim() || selectedEmp.address || undefined,
        areas: picked,
        inspectorName,
        date,
      });
      router.replace({ pathname: '/inspection/[id]', params: { id: inspection.id } });
    } catch (err) {
      Alert.alert('Falha ao criar vistoria', err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [areas, selectedItems, template, db, router, selectedEmp, address, date, inspectorName]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <AppLogo size={40} rounded={9} />
          <View style={styles.brandTitles}>
            <Text style={[styles.title, { color: colors.text }]}>Nova vistoria do empreendimento</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Preencha os dados, escolha as áreas e os itens que serão vistoriados.
            </Text>
          </View>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Empreendimento</Text>
          <Pressable
            style={[styles.empPicker, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowEmpList((v) => !v)}
          >
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text
              style={[styles.empPickerText, { color: selectedEmp ? colors.text : colors.textLight }]}
              numberOfLines={1}
            >
              {selectedEmp ? selectedEmp.name : 'Selecione o empreendimento'}
            </Text>
            <Ionicons name={showEmpList ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </Pressable>

          {showEmpList && (
            <View style={[styles.empList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {empreendimentos.map((emp) => {
                const active = selectedEmp?.id === emp.id;
                return (
                  <Pressable
                    key={emp.id}
                    style={[styles.empOption, active && { backgroundColor: colors.primaryLight }]}
                    onPress={() => {
                      setSelectedEmp(emp);
                      setShowEmpList(false);
                      if (!address.trim() && emp.address) setAddress(emp.address);
                    }}
                  >
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={active ? colors.primary : colors.textLight}
                    />
                    <View style={styles.empOptionBody}>
                      <Text style={[styles.empOptionName, { color: colors.text }]} numberOfLines={1}>
                        {emp.name}
                      </Text>
                      {emp.address ? (
                        <Text style={[styles.empOptionMeta, { color: colors.textLight }]} numberOfLines={1}>
                          {emp.address}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.empNew, { borderTopColor: colors.border }]}
                onPress={() =>
                  router.push({ pathname: '/empreendimentos/[id]', params: { id: 'new' } })
                }
              >
                <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
                <Text style={[styles.empNewText, { color: colors.primary }]}>Cadastrar novo empreendimento</Text>
              </Pressable>
            </View>
          )}

          {empreendimentos.length === 0 && !showEmpList ? (
            <Pressable
              style={[styles.empEmpty, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
              onPress={() => router.push({ pathname: '/empreendimentos/[id]', params: { id: 'new' } })}
            >
              <Ionicons name="add-circle" size={18} color={colors.primary} />
              <Text style={[styles.empEmptyText, { color: colors.primary }]}>
                Cadastre o primeiro empreendimento
              </Text>
            </Pressable>
          ) : null}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Endereço da vistoria</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Rua, número, bairro, cidade/UF"
            placeholderTextColor={colors.textLight}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Data da vistoria</Text>
          <Pressable
            style={[styles.datePicker, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.datePickerText, { color: colors.text }]}>
              {date.split('-').reverse().join('/')}
            </Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              display="default"
              mode="date"
              value={new Date(date + 'T12:00:00')}
              onChange={onDateChange}
            />
          )}
        </View>

        <Pressable style={[styles.toggleAll, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={toggleAll}>
          <Ionicons
            name={totalItemsAll > 0 && selectedItems.size === totalItemsAll ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={selectedItems.size === totalItemsAll ? colors.primary : colors.textLight}
          />
          <Text style={[styles.toggleAllText, { color: colors.text }]}>
            {selectedItems.size === totalItemsAll ? 'Desmarcar todos' : 'Selecionar todos'
            } · {selectedItems.size} itens
          </Text>
        </Pressable>

        {areas.map((area) => {
          const expanded = expandedArea === area.id;
          const count = selectedCount(area);
          const checked = areaAllSelected(area);
          const some = areaSomeSelected(area);
          return (
            <View key={area.id}>
              <Pressable
                style={[styles.areaCard, { backgroundColor: colors.surface, borderColor: checked ? colors.primary : colors.border }]}
                onPress={() => toggleArea(area)}
              >
                <Ionicons
                  name={checked ? 'checkbox' : some ? 'remove-circle-outline' : 'square-outline'}
                  size={22}
                  color={checked ? colors.primary : some ? colors.warning : colors.textLight}
                />
                <View style={styles.areaBody}>
                  <Text style={[styles.areaName, { color: colors.text }]}>{area.name}</Text>
                  <Text style={[styles.areaCount, { color: colors.textSecondary }]}>
                    {count} de {area.groups.reduce((n, g) => n + g.items.length, 0)} itens
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => setExpandedArea(expanded ? null : area.id)}
                >
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </Pressable>
              </Pressable>

              {expanded && (
                <View style={[styles.areaExpanded, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {area.groups.map((group) => (
                    <View key={group.id}>
                      <Text style={[styles.groupName, { color: colors.primary }]}>{group.name}</Text>
                      {group.items.map((item) => {
                        const on = selectedItems.has(item.id);
                        return (
                          <Pressable key={item.id} style={styles.itemRow} onPress={() => toggleItem(item.id)}>
                            <Ionicons
                              name={on ? 'checkbox' : 'square-outline'}
                              size={18}
                              color={on ? colors.primary : colors.textLight}
                            />
                            <Text style={[styles.itemText, { color: colors.text }]}>{item.text}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          style={[
            styles.createBtn,
            { backgroundColor: colors.primary },
            (!template || selectedItems.size === 0 || !selectedEmp) && { opacity: 0.5 },
          ]}
          disabled={!template || selectedItems.size === 0 || !selectedEmp}
          onPress={create}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Criar vistoria ({selectedItems.size} itens)</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 0 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  brandTitles: { flex: 1 },
  formCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  empPicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empPickerText: { flex: 1, fontSize: 15 },
  empList: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  empOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  empOptionBody: { flex: 1, gap: 1 },
  empOptionName: { fontSize: 14.5, fontWeight: '500' },
  empOptionMeta: { fontSize: 12 },
  empNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  empNewText: { fontSize: 14, fontWeight: '600' },
  empEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
  },
  empEmptyText: { fontSize: 14, fontWeight: '600' },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerText: { fontSize: 14, fontWeight: '600' },
  toggleAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  toggleAllText: { fontSize: 14, fontWeight: '600' },
  areaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  areaBody: { flex: 1 },
  areaName: { fontSize: 15, fontWeight: '600' },
  areaCount: { fontSize: 12, marginTop: 2 },
  areaExpanded: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  groupName: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: 8, marginBottom: 6 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
  },
  itemText: { flex: 1, fontSize: 13, lineHeight: 17 },
  createBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});