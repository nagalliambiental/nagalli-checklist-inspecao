import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
} from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getInspectionService } from '../../src/services/inspection.service';
import { normalizePhoto, persistPhoto, savePhotoToGallery } from '../../src/services/photo.service';
import { getCurrentCoords } from '../../src/services/location';
import { generateInspectionDocxAndShare } from '../../src/services/docx.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import { PhotoWatermark } from '../../src/components/PhotoWatermark';
import { AppLogo } from '../../src/components/AppHeader';
import type { Inspection, InspectionItem, InspectionPhoto, InspectionPhotoRef } from '../../src/types';

const STATUS_OPTS = ['C', 'NC', 'NA'] as const;
const STATUS_LABELS: Record<string, string> = { C: 'C', NC: 'NC', NA: 'N/A' };

type Situation = 'all' | 'pending' | 'C' | 'NC' | 'NA';

const SITUATIONS: { key: Situation; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'NC', label: 'Não conforme' },
  { key: 'C', label: 'Conforme' },
  { key: 'NA', label: 'N/A' },
];

interface AreaStat {
  id: string;
  name: string;
  total: number;
  C: number;
  NC: number;
  NA: number;
  pending: number;
}

interface AreaSection extends AreaStat {
  /** Itens que passam pelos filtros atuais, mesmo quando a área está recolhida. */
  matching: InspectionItem[];
  data: InspectionItem[];
}

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const service = getInspectionService(db);
  const { colors } = useTheme();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Situation>('all');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [viewer, setViewer] = useState<{ photos: InspectionPhotoRef[]; index: number; item: InspectionItem } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [motivoPrompt, setMotivoPrompt] = useState<InspectionItem | null>(null);
  const [motivoDraft, setMotivoDraft] = useState('');
  const listRef = useRef<SectionList<InspectionItem, AreaSection>>(null);
  const lastTap = useRef(0);

  const viewerPhoto = viewer ? viewer.photos[viewer.index] : undefined;

  const openViewer = (photos: InspectionPhotoRef[], index: number, item: InspectionItem) => {
    setZoomed(false);
    setViewer({ photos, index, item });
  };

  const photoCaption = (item: InspectionItem): string => {
    const reason = (item.notes ?? '').trim();
    const title = (item.groupName ?? item.areaName ?? '').trim();
    if (title && reason) return `${title} - ${reason}`;
    return title || reason;
  };

  /**
   * Tarja preta gravada na foto: mostra a Área e o Motivo da não conformidade,
   * que é o que identifica a evidência. Antes vinha só o texto do item. Quando
   * o motivo ainda não foi digitado, usa o texto do item como referência.
   */
  const watermarkCaption = (item: InspectionItem): string => {
    const area = (item.areaName ?? '').trim();
    const reason = (item.notes ?? '').trim();
    const lines: string[] = [];
    if (area) lines.push(`Área: ${area}`);
    if (reason) lines.push(`Motivo: ${reason}`);
    else if (item.label.trim()) lines.push(item.label.trim());
    return lines.join('\n');
  };

  const onViewerTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setZoomed((v) => !v);
    } else {
      lastTap.current = now;
    }
  };

  const viewerInfo = (ref: InspectionPhotoRef | undefined): string => {
    if (!ref) return '';
    if (typeof ref === 'string') return 'Foto (sem dados de localização)';
    const date = ref.takenAt ? new Date(ref.takenAt).toLocaleString('pt-BR') : '';
    const coords = ref.lat != null && ref.lng != null
      ? `${ref.lat.toFixed(5)}, ${ref.lng.toFixed(5)}`
      : 'sem GPS';
    return [date, coords].filter(Boolean).join('  •  ') || 'Foto';
  };

  const [pendingPhoto, setPendingPhoto] = useState<{
    itemId: string;
    markNc?: boolean;
    uri: string;
    width: number;
    height: number;
    lat?: number;
    lng?: number;
    caption: string;
  } | null>(null);

  const statusColors: Record<string, string> = {
    C: colors.success,
    NC: colors.error,
    NA: colors.textLight,
  };

  useEffect(() => {
    if (!id) return;
    service.getInspection(id).then((data) => {
      setInspection(data);
      setNotes(data.notes ?? '');
    });
  }, [db, id]);

  const reload = async () => setInspection(await service.getInspection(inspection!.id));

  /**
   * Cada área da vistoria vira uma seção com o seu próprio resumo. Antes o
   * inspetor navegava "SEÇÃO 1 de N" e só via uma área por vez; agora tudo
   * fica numa lista única, com o mapa de situação fixo no topo.
   */
  const areaStats = useMemo<AreaStat[]>(() => {
    if (!inspection) return [];
    const items = inspection.items ?? [];
    const order = inspection.areas ?? [];
    const base = order.length > 0
      ? order.map((a) => ({ id: a.id, name: a.name }))
      : Array.from(new Set(items.map((i) => (i.areaName ?? '').trim()).filter(Boolean))).map((n) => ({
          id: `section-${n}`,
          name: n,
        }));

    return base.map((area) => {
      const areaItems = items.filter((i) => (i.areaName ?? '') === area.name);
      const stat: AreaStat = { id: area.id, name: area.name, total: areaItems.length, C: 0, NC: 0, NA: 0, pending: 0 };
      for (const item of areaItems) {
        if (item.status === 'C') stat.C += 1;
        else if (item.status === 'NC') stat.NC += 1;
        else if (item.status === 'NA') stat.NA += 1;
        else stat.pending += 1;
      }
      return stat;
    });
  }, [inspection]);

  const counts = useMemo(() => {
    const acc = { total: 0, C: 0, NC: 0, NA: 0, pending: 0 };
    for (const a of areaStats) {
      acc.total += a.total;
      acc.C += a.C;
      acc.NC += a.NC;
      acc.NA += a.NA;
      acc.pending += a.pending;
    }
    return acc;
  }, [areaStats]);

  const answered = counts.total - counts.pending;
  const progress = counts.total ? (answered / counts.total) * 100 : 0;
  const hasFilter = statusFilter !== 'all' || !!areaFilter || !!search.trim();

  const sections = useMemo<AreaSection[]>(() => {
    if (!inspection) return [];
    const items = inspection.items ?? [];
    const q = search.trim().toLowerCase();

    return areaStats
      .filter((a) => !areaFilter || a.id === areaFilter)
      .map((a) => {
        let matching = items.filter((i) => (i.areaName ?? '') === a.name);
        if (statusFilter !== 'all') matching = matching.filter((i) => i.status === statusFilter);
        if (q) matching = matching.filter((i) => i.label.toLowerCase().includes(q));
        return { ...a, matching, data: collapsed.has(a.id) ? [] : matching };
      })
      .filter((a) => a.matching.length > 0);
  }, [inspection, areaStats, statusFilter, areaFilter, search, collapsed]);

  const setStatus = async (item: InspectionItem, status: 'C' | 'NC' | 'NA') => {
    if (status === 'NC' && (item.photos ?? []).length === 0) {
      // Pede o motivo antes da câmera, para ele sair na tarja da foto.
      setMotivoDraft((item.notes ?? '').trim());
      setMotivoPrompt(item);
      return;
    }
    await service.updateItem(inspection!.id, item.id, { status });
    await reload();
  };

  const confirmMotivoAndCapture = async () => {
    const item = motivoPrompt;
    if (!item) return;
    const motivo = motivoDraft.trim();
    setMotivoPrompt(null);
    if (motivo !== (item.notes ?? '').trim()) {
      await service.updateItem(inspection!.id, item.id, { notes: motivo });
      await reload();
    }
    await attachPhoto(item, true);
  };

  const attachPhoto = async (item: InspectionItem, markNc?: boolean) => {
    const cam = await requestCameraPermissionsAsync();
    const lib = await requestMediaLibraryPermissionsAsync();
    let result;
    if (cam.granted) {
      result = await launchCameraAsync({ quality: 0.5 });
    } else if (lib.granted) {
      result = await launchImageLibraryAsync({ quality: 0.5 });
    } else {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera para anexar fotos.');
      return;
    }
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const [coords, norm] = await Promise.all([
      getCurrentCoords().catch(() => null),
      normalizePhoto(result.assets[0].uri),
    ]);
    // O texto digitado na observação grava no banco sem recarregar o estado
    // local, então buscamos o item atualizado para a tarja usar o motivo certo.
    const fresh = (await service.getInspection(inspection!.id)).items.find((it) => it.id === item.id) ?? item;
    setPendingPhoto({
      itemId: item.id,
      markNc,
      uri: norm.uri,
      width: norm.width,
      height: norm.height,
      lat: coords?.latitude,
      lng: coords?.longitude,
      caption: watermarkCaption(fresh),
    });
  };

  const onPhotoWatermarkSaved = async (watermarkedUri: string | null) => {
    const pending = pendingPhoto;
    if (!pending) return;
    setPendingPhoto(null);
    let photo: InspectionPhoto;
    try {
      photo = await persistPhoto(watermarkedUri ?? pending.uri, inspection!.id, {
        lat: pending.lat,
        lng: pending.lng,
      });
    } catch (err) {
      Alert.alert('Foto não salva', err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
      return;
    }
    savePhotoToGallery(photo.uri, photo.takenAt).then((result) => {
      if (!result.saved) {
        Alert.alert(
          'Foto anexada, mas não salva na galeria',
          `A foto foi anexada à vistoria, porém não pôde ser gravada na galeria.\n\n${result.error ?? 'erro desconhecido'}`,
        );
      } else if (result.warning) {
        Alert.alert('Foto salva na galeria', result.warning);
      }
    });
    const item = (inspection?.items ?? []).find((it) => it.id === pending.itemId);
    if (!item) return;
    const photos: InspectionPhotoRef[] = [...(item.photos ?? []), photo];
    await service.updateItem(inspection!.id, item.id, { photoPaths: photos });
    await reload();
    if (pending.markNc) {
      const fresh = (await service.getInspection(inspection!.id)).items.find((it) => it.id === pending.itemId);
      if (fresh && fresh.status === 'pending') {
        await service.updateItem(inspection!.id, fresh.id, { status: 'NC' });
        await reload();
      }
    }
  };

  const removePhoto = async (item: InspectionItem, index: number) => {
    const photos = (item.photos ?? []).filter((_, i) => i !== index);
    await service.updateItem(inspection!.id, item.id, { photoPaths: photos });
    await reload();
  };

  const complete = async () => {
    setSaving(true);
    try {
      await service.completeInspection(inspection!.id, notes);
      router.replace({ pathname: '/inspection/export', params: { id: inspection!.id } });
    } finally {
      setSaving(false);
    }
  };

  const exportDocs = async () => {
    if (!inspection) return;
    setExporting(true);
    try {
      await generateInspectionDocxAndShare(db, inspection.id);
    } catch (err) {
      console.warn('Falha ao exportar DOCX:', err);
      Alert.alert(
        'Erro ao exportar DOCX',
        err instanceof Error ? err.message : 'Não foi possível gerar o relatório DOCX.',
      );
    } finally {
      setExporting(false);
    }
  };

  const applyStatusFilter = (key: Situation) => {
    setStatusFilter((current) => (current === key && key !== 'all' ? 'all' : key));
    setCollapsed(new Set());
  };

  const applyAreaFilter = (areaId: string | null) => {
    setAreaFilter(areaId);
    setCollapsed(new Set());
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    setCollapsed(new Set());
  };

  const toggleCollapse = (areaId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  /** Leva o inspetor direto ao que falta: filtra pendentes e volta ao topo. */
  const goToPending = () => {
    setStatusFilter('pending');
    setAreaFilter(null);
    setSearch('');
    setCollapsed(new Set());
    setTimeout(() => {
      try {
        listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true, viewPosition: 0 });
      } catch {
        // A lista ainda não terminou de medir; o filtro já leva ao topo.
      }
    }, 80);
  };

  const sitCount = (key: Situation) =>
    key === 'all' ? counts.total : key === 'pending' ? counts.pending : key === 'NC' ? counts.NC : key === 'C' ? counts.C : counts.NA;

  const sitColor = (key: Situation) => {
    if (key === 'pending') return colors.warning;
    if (key === 'NC') return colors.error;
    if (key === 'C') return colors.success;
    if (key === 'NA') return colors.textLight;
    return colors.primary;
  };

  const renderItem = ({ item, index }: { item: InspectionItem; index: number }) => (
    <View style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.itemHeadRow}>
        <Text style={[styles.itemNum, { color: colors.primary }]}>{index + 1}.</Text>
        {item.groupName ? (
          <Text style={[styles.itemGroup, { backgroundColor: colors.primaryLight }]} numberOfLines={1}>
            {item.groupName}
          </Text>
        ) : null}
        {item.status !== 'pending' && (
          <View style={[styles.itemStatusPill, { backgroundColor: statusColors[item.status] }]}>
            <Text style={styles.itemStatusPillText}>{STATUS_LABELS[item.status]}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.itemText, { color: colors.text }]}>{item.label}</Text>

      <View style={styles.statusRow}>
        {STATUS_OPTS.map((opt) => {
          const active = item.status === opt;
          return (
            <Pressable
              key={opt}
              style={[
                styles.statusBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
                active && { backgroundColor: statusColors[opt], borderColor: statusColors[opt] },
              ]}
              onPress={() => setStatus(item, opt)}
            >
              <Text style={[styles.statusText, { color: colors.text }, active && { color: colors.white }]}>
                {STATUS_LABELS[opt]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pendingPhoto?.itemId === item.id && (
        <PhotoWatermark
          uri={pendingPhoto.uri}
          width={pendingPhoto.width}
          height={pendingPhoto.height}
          caption={pendingPhoto.caption}
          latitude={pendingPhoto.lat}
          longitude={pendingPhoto.lng}
          onSave={onPhotoWatermarkSaved}
          onCancel={() => setPendingPhoto(null)}
        />
      )}

      {(item.photos ?? []).length > 0 ? (
        <>
          <View style={styles.photoGrid}>
            {item.photos!.map((photoRef, i) => {
              const uri = typeof photoRef === 'string' ? photoRef : photoRef.uri;
              return (
                <View key={uri} style={styles.photoWrap}>
                  <Pressable onPress={() => openViewer(item.photos ?? [], i, item)}>
                    <Image source={{ uri }} style={styles.thumb} />
                  </Pressable>
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(item, i)}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              );
            })}
            <Pressable style={[styles.photoAdd, { borderColor: colors.border }]} onPress={() => attachPhoto(item)}>
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
          {photoCaption(item) !== '' && (
            <Text style={[styles.photoCaption, { color: colors.textSecondary }]}>{photoCaption(item)}</Text>
          )}
        </>
      ) : (
        <Pressable
          style={[styles.photosEmpty, { borderColor: colors.border, backgroundColor: colors.background }]}
          onPress={() => attachPhoto(item)}
        >
          <Ionicons name="camera-outline" size={18} color={colors.primary} />
          <Text style={[styles.photosEmptyText, { color: colors.primary }]}>
            Anexar foto{item.status === 'NC' ? ' (obrigatória)' : ' (opcional)'}
          </Text>
        </Pressable>
      )}

      <TextInput
        style={[styles.itemNotes, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        placeholder={
          item.status === 'NC'
            ? 'Descrição da não conformidade (observação)...'
            : 'Observações (opcional)...'
        }
        value={item.notes}
        onChangeText={(t) => service.updateItem(inspection!.id, item.id, { notes: t })}
        placeholderTextColor={colors.textLight}
        multiline
      />
    </View>
  );

  const renderSectionHeader = ({ section }: { section: AreaSection }) => {
    const isCollapsed = collapsed.has(section.id);
    const done = section.pending === 0 && section.NC === 0;
    return (
      <Pressable
        onPress={() => toggleCollapse(section.id)}
        style={[styles.areaHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={18} color={colors.textSecondary} />
        <Text style={[styles.areaHeaderName, { color: colors.text }]} numberOfLines={1}>
          {section.name}
        </Text>
        <View style={styles.areaHeaderRight}>
          {section.NC > 0 && (
            <View style={[styles.areaBadge, { backgroundColor: colors.error }]}>
              <Text style={styles.areaBadgeText}>{section.NC} NC</Text>
            </View>
          )}
          {section.pending > 0 && (
            <View style={[styles.areaBadge, { backgroundColor: colors.warning }]}>
              <Text style={styles.areaBadgeText}>{section.pending}</Text>
            </View>
          )}
          {done && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
          <Text style={[styles.areaHeaderCount, { color: colors.textLight }]}>
            {section.C}/{section.total}
          </Text>
        </View>
      </Pressable>
    );
  };

  const listFooter = (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Comentários gerais da vistoria</Text>
      <TextInput
        style={[styles.itemNotes, styles.generalNotes, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Observações gerais..."
        placeholderTextColor={colors.textLight}
        multiline
      />
      <Pressable
        style={[styles.exportBtn, { borderColor: colors.primary, backgroundColor: colors.surface }]}
        onPress={exportDocs}
        disabled={exporting}
      >
        <Ionicons name="document-text" size={16} color={colors.primary} />
        <Text style={[styles.exportBtnText, { color: colors.primary }]}>
          {exporting ? 'Gerando...' : 'Exportar DOCX'}
        </Text>
      </Pressable>
    </View>
  );

  if (!inspection) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.top, { backgroundColor: colors.background }]}>
        <View style={styles.brandRow}>
          <AppLogo size={34} rounded={8} />
          <View style={styles.headerTitles}>
            <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
              {inspection.empreendimentoName ?? inspection.companyName ?? inspection.areaName}
            </Text>
            <Text style={[styles.headerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {(inspection.date ?? '').split('-').reverse().join('/')}  •  {inspection.inspectorName}
            </Text>
          </View>
          {inspection.status === 'completed' && (
            <View style={[styles.donePill, { backgroundColor: colors.primary }]}>
              <Ionicons name="checkmark" size={13} color="#fff" />
              <Text style={styles.donePillText}>Concluída</Text>
            </View>
          )}
        </View>

        <View style={[styles.progressCard, { backgroundColor: colors.primary }]}>
          <View style={styles.progressTopRow}>
            <Text style={styles.progressTitle}>
              {answered} de {counts.total} itens respondidos
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SITUATIONS.map((s) => {
            const active = statusFilter === s.key;
            const color = sitColor(s.key);
            return (
              <Pressable
                key={s.key}
                onPress={() => applyStatusFilter(s.key)}
                style={[
                  styles.chip,
                  { borderColor: active ? color : colors.border, backgroundColor: active ? color : colors.surface },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{s.label}</Text>
                <Text style={[styles.chipCount, { color: active ? '#fff' : colors.textLight }]}>{sitCount(s.key)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => applyAreaFilter(null)}
            style={[
              styles.chip,
              { borderColor: !areaFilter ? colors.primary : colors.border, backgroundColor: !areaFilter ? colors.primary : colors.surface },
            ]}
          >
            <Text style={[styles.chipText, { color: !areaFilter ? '#fff' : colors.textSecondary }]}>Todas as áreas</Text>
          </Pressable>
          {areaStats.map((a) => {
            const active = areaFilter === a.id;
            const badge = a.NC > 0 ? String(a.NC) : a.pending > 0 ? String(a.pending) : '✓';
            const badgeColor = a.NC > 0 ? colors.error : a.pending > 0 ? colors.warning : colors.success;
            return (
              <Pressable
                key={a.id}
                onPress={() => applyAreaFilter(active ? null : a.id)}
                style={[
                  styles.chip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]} numberOfLines={1}>
                  {a.name}
                </Text>
                <View style={[styles.chipBadge, { backgroundColor: active ? 'rgba(255,255,255,0.35)' : badgeColor }]}>
                  <Text style={styles.chipBadgeText}>{badge}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textLight} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Buscar item..."
            placeholderTextColor={colors.textLight}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search !== '' && (
            <Pressable onPress={() => onSearchChange('')}>
              <Ionicons name="close-circle" size={16} color={colors.textLight} />
            </Pressable>
          )}
        </View>
      </View>

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <Text style={[styles.noItems, { color: colors.textSecondary }]}>
            {hasFilter ? 'Nenhum item para este filtro.' : 'Nenhum item nesta vistoria.'}
          </Text>
        }
      />

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {inspection.status === 'completed' ? (
          <Pressable style={[styles.completeBtn, { backgroundColor: colors.primary }]} onPress={complete} disabled={saving}>
            <Text style={styles.completeBtnText}>{saving ? 'Salvando...' : 'Salvar comentários'}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.prevBtn, { borderColor: colors.border, opacity: counts.pending > 0 ? 1 : 0.5 }]}
              onPress={goToPending}
              disabled={counts.pending === 0}
            >
              <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.text} />
              <Text style={[styles.prevBtnText, { color: colors.text }]}>Pendências</Text>
            </Pressable>
            <Pressable style={[styles.completeBtn, { backgroundColor: colors.primary }]} onPress={complete} disabled={saving}>
              <Text style={styles.completeBtnText}>{saving ? 'Salvando...' : 'Concluir Inspeção'}</Text>
            </Pressable>
          </>
        )}
      </View>

      <Modal
        visible={!!motivoPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setMotivoPrompt(null)}
      >
        <View style={styles.motivoOverlay}>
          <View style={[styles.motivoCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.motivoTitle, { color: colors.text }]}>Motivo da não conformidade</Text>
            {motivoPrompt ? (
              <Text style={[styles.motivoItem, { color: colors.textSecondary }]} numberOfLines={3}>
                {motivoPrompt.label}
              </Text>
            ) : null}
            <TextInput
              value={motivoDraft}
              onChangeText={setMotivoDraft}
              placeholder="Descreva o motivo (ex.: extintor ausente, placa danificada)"
              placeholderTextColor={colors.textLight}
              style={[styles.motivoInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              multiline
              autoFocus
            />
            <Text style={[styles.motivoHint, { color: colors.textLight }]}>
              Esse texto sai na tarja da foto junto com a área.
            </Text>
            <View style={styles.motivoActions}>
              <Pressable
                style={[styles.motivoCancel, { borderColor: colors.border }]}
                onPress={() => setMotivoPrompt(null)}
              >
                <Text style={[styles.motivoCancelText, { color: colors.text }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.motivoConfirm, { backgroundColor: colors.primary }]}
                onPress={confirmMotivoAndCapture}
              >
                <Ionicons name="camera" size={17} color={colors.white} />
                <Text style={styles.motivoConfirmText}>Tirar foto</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={10}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {viewer && viewer.photos.length > 1 && (
            <>
              <Pressable
                style={[styles.viewerArrow, styles.viewerPrev]}
                onPress={() => {
                  setZoomed(false);
                  setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.photos.length) % v.photos.length } : null));
                }}
                hitSlop={12}
              >
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.viewerArrow, styles.viewerNext]}
                onPress={() => {
                  setZoomed(false);
                  setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.photos.length } : null));
                }}
                hitSlop={12}
              >
                <Ionicons name="chevron-forward" size={26} color="#fff" />
              </Pressable>
            </>
          )}
          {viewerPhoto && (
            <Pressable style={styles.viewerImageWrap} onPress={onViewerTap}>
              <Image
                source={{ uri: typeof viewerPhoto === 'string' ? viewerPhoto : viewerPhoto.uri }}
                style={[styles.viewerImage, zoomed && styles.viewerImageZoomed]}
                resizeMode={zoomed ? 'cover' : 'contain'}
              />
            </Pressable>
          )}
          {viewer && (
            <View style={styles.viewerInfo}>
              {photoCaption(viewer.item) !== '' && (
                <Text style={styles.viewerCaptionText} numberOfLines={3}>
                  {photoCaption(viewer.item)}
                </Text>
              )}
              <View style={styles.viewerInfoRow}>
                <Ionicons name="information-circle-outline" size={15} color="#fff" />
                <Text style={styles.viewerInfoText}>{viewerInfo(viewerPhoto)}</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitles: { flex: 1 },
  companyName: { fontSize: 18, fontWeight: '800' },
  headerMeta: { fontSize: 12.5, marginTop: 1 },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  donePillText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  progressCard: { borderRadius: 12, padding: 14 },
  progressTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  progressPct: { color: '#fff', fontSize: 16, fontWeight: '800' },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: '#fff' },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 200,
  },
  chipText: { fontSize: 12.5, fontWeight: '600' },
  chipCount: { fontSize: 12, fontWeight: '800' },
  chipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  areaHeaderName: { flex: 1, fontSize: 15, fontWeight: '800' },
  areaHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  areaBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  areaHeaderCount: { fontSize: 12, fontWeight: '700' },
  itemCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  itemHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  itemNum: { fontSize: 12, fontWeight: '700' },
  itemGroup: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  itemStatusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto' },
  itemStatusPillText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  itemText: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statusText: { fontWeight: '700' },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  photoWrap: { position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 10,
  },
  photosEmptyText: { fontSize: 13, fontWeight: '600' },
  photoCaption: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    fontWeight: '600',
  },
  itemNotes: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 44,
  },
  noItems: { textAlign: 'center', paddingVertical: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  generalNotes: { minHeight: 80 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  exportBtnText: { fontSize: 14, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  prevBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 13,
  },
  prevBtnText: { fontSize: 15, fontWeight: '600' },
  completeBtn: {
    flex: 1.6,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerClose: { position: 'absolute', top: 56, right: 18, zIndex: 12 },
  viewerArrow: { position: 'absolute', top: '50%', zIndex: 12 },
  viewerPrev: { left: 12 },
  viewerNext: { right: 12 },
  viewerImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerImageZoomed: { transform: [{ scale: 2.5 }] },
  viewerInfo: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 24,
  },
  viewerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewerCaptionText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  viewerInfoText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  motivoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  motivoCard: { borderRadius: 14, padding: 18, gap: 10 },
  motivoTitle: { fontSize: 17, fontWeight: '800' },
  motivoItem: { fontSize: 13, lineHeight: 18 },
  motivoInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  motivoHint: { fontSize: 11.5 },
  motivoActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  motivoCancel: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  motivoCancelText: { fontSize: 14, fontWeight: '600' },
  motivoConfirm: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingVertical: 12,
  },
  motivoConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
