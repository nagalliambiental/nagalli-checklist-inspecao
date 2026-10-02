import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { getInspectionService } from '../../src/services/inspection.service';
import { generateInspectionPdf, sharePdf } from '../../src/services/pdf.service';
import { generate5w2hAndShare } from '../../src/services/xlsx5w2h.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getInspectorName } from '../../src/services/settings.service';
import type { AreaStats, EmpreendimentoStats, Inspection } from '../../src/types';

type Scope = 'today' | 'pending' | 'all';

const SCOPES: { key: Scope; label: string; icon: 'today-outline' | 'time-outline' | 'albums-outline' }[] = [
  { key: 'today', label: 'Hoje', icon: 'today-outline' },
  { key: 'pending', label: 'Pendências', icon: 'time-outline' },
  { key: 'all', label: 'Ver tudo', icon: 'albums-outline' },
];

const UNLINKED = 'Sem empreendimento vinculado';

interface Tally {
  C: number;
  NC: number;
  NA: number;
  total: number;
}

const emptyTally = (): Tally => ({ C: 0, NC: 0, NA: 0, total: 0 });

const pctOf = (t: Tally) => (t.total ? Math.round((t.C / t.total) * 100) : 0);

const tallyOf = (insp: Inspection): Tally => {
  const t = emptyTally();
  for (const item of insp.items ?? []) {
    if (item.status === 'pending') continue;
    t.total += 1;
    if (item.status === 'C') t.C += 1;
    else if (item.status === 'NC') t.NC += 1;
    else if (item.status === 'NA') t.NA += 1;
  }
  return t;
};

const fmtDate = (value?: string) => {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
};

function enterpriseKey(insp: Inspection): string {
  if (insp.empreendimentoId) return insp.empreendimentoId;
  const name = insp.empreendimentoName?.trim() || insp.companyName?.trim();
  return name ? `name:${name.toLowerCase()}` : 'unlinked';
}

function enterpriseName(insp: Inspection): string {
  return (
    insp.empreendimentoName?.trim() ||
    insp.companyName?.trim() ||
    UNLINKED
  );
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [scope, setScope] = useState<Scope>('all');
  const [inspectorName, setInspectorName] = useState('Inspetor');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setInspections(await getInspectionService(db).listInspections());
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      getInspectorName(db).then(setInspectorName);
    }, [load, db]),
  );

  const today = new Date().toISOString().slice(0, 10);

  const scoped = useMemo(() => {
    const rows = [...inspections];
    if (scope === 'today') return rows.filter((i) => i.date === today);
    if (scope === 'pending') return rows.filter((i) => i.status === 'draft');
    return rows;
  }, [inspections, scope, today]);

  /**
   * Agrupa por empreendimento (e só depois por área). O agrupamento anterior
   * somava todas as vistorias por `areaName`, misturando áreas homônimas de
   * empreendimentos diferentes.
   */
  const groups = useMemo<EmpreendimentoStats[]>(() => {
    const byKey = new Map<string, { name: string; id?: string; rows: Inspection[] }>();
    for (const insp of scoped) {
      const key = enterpriseKey(insp);
      const bucket = byKey.get(key) ?? { name: enterpriseName(insp), id: insp.empreendimentoId, rows: [] };
      bucket.rows.push(insp);
      byKey.set(key, bucket);
    }

    const out: EmpreendimentoStats[] = [];
    for (const [key, bucket] of byKey) {
      const rows = [...bucket.rows].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      const current = tallyOf(rows[0]);
      const previous = rows[1] ? tallyOf(rows[1]) : undefined;
      const currentPct = pctOf(current);

      const areaMap = new Map<string, AreaStats>();
      for (const insp of rows) {
        for (const item of insp.items ?? []) {
          if (item.status === 'pending') continue;
          const name = item.areaName ?? insp.areaName ?? 'Geral';
          const agg = areaMap.get(name) ?? { name, C: 0, NC: 0, NA: 0, total: 0 };
          agg.total += 1;
          if (item.status === 'C') agg.C += 1;
          else if (item.status === 'NC') agg.NC += 1;
          else if (item.status === 'NA') agg.NA += 1;
          areaMap.set(name, agg);
        }
      }

      out.push({
        id: key,
        name: bucket.name,
        contratante: '',
        inspections: rows.length,
        lastInspectionDate: rows[0].date,
        C: current.C,
        NC: current.NC,
        NA: current.NA,
        total: current.total,
        currentPct,
        previousPct: previous ? pctOf(previous) : undefined,
        deltaPct: previous ? currentPct - pctOf(previous) : undefined,
        byArea: [...areaMap.values()].sort((a, b) => b.NC - a.NC || b.total - a.total),
      });
    }

    return out.sort((a, b) => b.currentPct - a.currentPct || (b.lastInspectionDate ?? '').localeCompare(a.lastInspectionDate ?? ''));
  }, [scoped]);

  const overall = useMemo<Tally>(
    () =>
      groups.reduce<Tally>(
        (acc, g) => ({
          C: acc.C + g.C,
          NC: acc.NC + g.NC,
          NA: acc.NA + g.NA,
          total: acc.total + g.total,
        }),
        emptyTally(),
      ),
    [groups],
  );

  const pendingCount = inspections.filter((i) => i.status === 'draft').length;

  const exportPdf = async () => {
    const completed = inspections.filter((i) => i.status !== 'draft');
    if (completed.length === 0) {
      Alert.alert('Nenhuma vistoria concluída', 'Finalize ao menos uma vistoria para exportar o PDF.');
      return;
    }
    for (const inspection of completed) {
      const result = await generateInspectionPdf(inspection);
      if (result && (await Sharing.isAvailableAsync())) {
        await sharePdf(result.uri);
      }
    }
  };

  const exportXlsx = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exportDate)) {
      Alert.alert('Data inválida', 'Informe a data no formato AAAA-MM-DD.');
      return;
    }
    setGenerating(true);
    const ok = await generate5w2hAndShare(db, exportDate);
    setGenerating(false);
    if (!ok) Alert.alert('Nenhuma vistoria encontrada', `Não há vistorias em ${fmtDate(exportDate)}.`);
  };

  const barColor = (value: number) =>
    value >= 80 ? colors.success : value >= 50 ? colors.warning : colors.error;

  const scopeCount = (key: Scope) => {
    if (key === 'today') return inspections.filter((i) => i.date === today).length;
    if (key === 'pending') return pendingCount;
    return inspections.length;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.scopeRow}>
        {SCOPES.map((s) => {
          const active = scope === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => setScope(s.key)}
              style={[
                styles.scopeChip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.scopeTop}>
                <Ionicons name={s.icon} size={14} color={active ? colors.white : colors.textSecondary} />
                <Text style={[styles.scopeCount, { color: active ? colors.white : colors.textLight }]}>
                  {scopeCount(s.key)}
                </Text>
              </View>
              <Text
                style={[styles.scopeLabel, { color: active ? colors.white : colors.textSecondary }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.totalsCard, { backgroundColor: colors.primary }]}>
        <Text style={styles.totalsTitle}>
          Conformidade · {scope === 'today' ? 'hoje' : scope === 'pending' ? 'pendências' : 'histórico completo'} ·{' '}
          {scoped.length} {scoped.length === 1 ? 'vistoria' : 'vistorias'}
        </Text>
        <View style={styles.totalsRow}>
          <View style={[styles.pill, { backgroundColor: colors.success }]}>
            <Text style={styles.pillNum}>{pctOf(overall)}%</Text>
            <Text style={styles.pillLabel}>Conforme</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.error }]}>
            <Text style={styles.pillNum}>{pctOf({ ...overall, C: overall.NC })}%</Text>
            <Text style={styles.pillLabel}>Não conforme</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.textSecondary }]}>
            <Text style={styles.pillNum}>{pctOf({ ...overall, C: overall.NA })}%</Text>
            <Text style={styles.pillLabel}>N/A</Text>
          </View>
        </View>
        {overall.NC > 0 && (
          <Text style={styles.alertText}>
            {overall.NC} item(ns) não conforme(s) na vistoria mais recente de cada empreendimento
          </Text>
        )}
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Por empreendimento</Text>
        <Text style={[styles.sectionCount, { color: colors.textLight }]}>{groups.length}</Text>
      </View>

      {groups.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="checkmark-done-outline" size={30} color={colors.textLight} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            {scope === 'pending' ? 'Nenhuma vistoria pendente' : 'Nada para exibir neste escopo'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textLight }]}>
            {scope === 'today'
              ? 'Não há vistoria concluída hoje.'
              : scope === 'pending'
                ? `Tudo em dia para ${inspectorName}.`
                : 'Cadastre um empreendimento e inicie uma vistoria.'}
          </Text>
        </View>
      ) : (
        groups.map((g) => {
          const open = expanded === g.id;
          const isUnlinked = g.id === 'unlinked';
          return (
            <View
              key={g.id}
              style={[styles.empCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Pressable onPress={() => setExpanded(open ? null : g.id)} style={styles.empHeader}>
                <View style={styles.empHeaderText}>
                  <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={[styles.empMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {g.inspections === 1 ? '1 vistoria' : `${g.inspections} vistorias`} · {fmtDate(g.lastInspectionDate)}
                  </Text>
                </View>
                <View style={styles.empHeaderRight}>
                  {g.deltaPct !== undefined && (
                    <View
                      style={[
                        styles.deltaBadge,
                        { backgroundColor: g.deltaPct >= 0 ? colors.success : colors.error },
                      ]}
                    >
                      <Ionicons
                        name={g.deltaPct >= 0 ? 'trending-up' : 'trending-down'}
                        size={12}
                        color={colors.white}
                      />
                      <Text style={styles.deltaText}>
                        {g.deltaPct >= 0 ? '+' : ''}
                        {g.deltaPct} p.p.
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.empPct, { color: barColor(g.currentPct) }]}>{g.currentPct}%</Text>
                </View>
              </Pressable>

              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${g.currentPct}%`, backgroundColor: barColor(g.currentPct) },
                  ]}
                />
              </View>

              <View style={styles.countRow}>
                <Text style={[styles.countText, { color: colors.success }]}>C {g.C}</Text>
                <Text style={[styles.countText, { color: colors.error }]}>NC {g.NC}</Text>
                <Text style={[styles.countText, { color: colors.textLight }]}>N/A {g.NA}</Text>
                {g.previousPct !== undefined && (
                  <Text style={[styles.countText, { color: colors.textLight }]}>antes {g.previousPct}%</Text>
                )}
              </View>

              {open && (
                <View style={styles.empBody}>
                  <Text style={[styles.bodyTitle, { color: colors.textSecondary }]}>Conformidade por área</Text>
                  {g.byArea.map((area) => {
                    const areaPct = pctOf(area);
                    return (
                      <View key={area.name} style={styles.areaRow}>
                        <View style={styles.areaHeader}>
                          <Text style={[styles.areaName, { color: colors.text }]} numberOfLines={1}>
                            {area.name}
                          </Text>
                          <Text style={[styles.areaPct, { color: barColor(areaPct) }]}>{areaPct}%</Text>
                        </View>
                        <View style={[styles.areaTrack, { backgroundColor: colors.border }]}>
                          <View
                            style={[
                              styles.areaFill,
                              { width: `${areaPct}%`, backgroundColor: barColor(areaPct) },
                            ]}
                          />
                        </View>
                        <Text style={[styles.areaMeta, { color: colors.textSecondary }]}>
                          {area.C} C · {area.NC} NC · {area.NA} N/A · {area.total} total
                        </Text>
                      </View>
                    );
                  })}

                  {isUnlinked ? (
                    <Pressable
                      style={[styles.linkBtn, { borderColor: colors.warning }]}
                      onPress={() => router.push('/empreendimentos')}
                    >
                      <Ionicons name="link-outline" size={15} color={colors.warning} />
                      <Text style={[styles.linkText, { color: colors.warning }]}>Vincular a um empreendimento</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.linkBtn, { borderColor: colors.primary }]}
                      onPress={() =>
                        router.push({ pathname: '/inspection/new', params: { empreendimento: g.id } })
                      }
                    >
                      <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                      <Text style={[styles.linkText, { color: colors.primary }]}>Nova vistoria aqui</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      {inspections.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 22 }]}>Exportar</Text>
          <View style={[styles.dateRow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Data da vistoria (AAAA-MM-DD)</Text>
            <TextInput
              value={exportDate}
              onChangeText={setExportDate}
              placeholder="2026-09-15"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.dateInput,
                { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
              ]}
            />
          </View>
          <Pressable style={[styles.exportBtn, { backgroundColor: colors.primary }]} onPress={exportPdf}>
            <Ionicons name="document-text" size={18} color={colors.white} />
            <Text style={[styles.exportBtnText, { color: colors.white }]}>Exportar relatório PDF</Text>
          </Pressable>
          <Pressable
            style={[styles.exportBtn, { backgroundColor: colors.primaryDark }]}
            onPress={exportXlsx}
            disabled={generating}
          >
            <Ionicons name="tablet-landscape" size={18} color={colors.white} />
            <Text style={[styles.exportBtnText, { color: colors.white }]}>
              {generating ? 'Gerando...' : 'Gerar Plano de Ação 5W2H'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  scopeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  scopeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  scopeTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scopeLabel: { fontSize: 11.5, fontWeight: '600' },
  scopeCount: { fontSize: 13, fontWeight: '800' },
  totalsCard: { borderRadius: 14, padding: 18, marginBottom: 20 },
  totalsTitle: { color: '#e6f2ea', fontSize: 14, fontWeight: '600', marginBottom: 14 },
  totalsRow: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  pillNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  pillLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  alertText: { color: '#fde3dc', marginTop: 12, fontSize: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionCount: { fontSize: 13, fontWeight: '700' },
  empCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  empHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  empHeaderText: { flex: 1, gap: 2 },
  empName: { fontSize: 15, fontWeight: '700' },
  empMeta: { fontSize: 12.5 },
  empHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empPct: { fontSize: 18, fontWeight: '800' },
  deltaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  deltaText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  barFill: { height: 8, borderRadius: 4 },
  countRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  countText: { fontSize: 12, fontWeight: '600' },
  empBody: { marginTop: 14, gap: 10 },
  bodyTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  areaRow: { gap: 6 },
  areaHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  areaName: { fontSize: 13.5, fontWeight: '600', flex: 1 },
  areaPct: { fontSize: 13.5, fontWeight: '800' },
  areaTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  areaFill: { height: 6, borderRadius: 3 },
  areaMeta: { fontSize: 11.5 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  linkText: { fontSize: 13.5, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 28 },
  emptyTitle: { fontSize: 14.5, fontWeight: '600' },
  emptySub: { fontSize: 12.5, textAlign: 'center' },
  exportBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 16,
  },
  exportBtnText: { fontSize: 15, fontWeight: '600' },
  dateRow: { borderRadius: 12, padding: 14, marginBottom: 12 },
  dateLabel: { fontSize: 12, marginBottom: 8 },
  dateInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
