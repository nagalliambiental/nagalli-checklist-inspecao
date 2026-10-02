import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { getInspectionService } from '../../src/services/inspection.service';
import { generateInspectionDocxAndShare } from '../../src/services/docx.service';
import { generateInspectionPdf, sharePdf } from '../../src/services/pdf.service';
import { zipInspectionPhotosAndShare } from '../../src/services/photo-backup.service';
import { generate5w2hAndShare } from '../../src/services/xlsx5w2h.service';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppLogo } from '../../src/components/AppHeader';
import type { Inspection } from '../../src/types';

export default function InspectionExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | 'zip' | 'xlsx' | null>(null);

  useEffect(() => {
    if (!id) return;
    getInspectionService(db).getInspection(id).then(setInspection);
  }, [db, id]);

  const exportDocx = async () => {
    setExporting('docx');
    try {
      await generateInspectionDocxAndShare(db, id);
    } catch (err) {
      console.warn('Falha ao exportar DOCX:', err);
      Alert.alert(
        'Erro ao exportar DOCX',
        err instanceof Error ? err.message : 'Não foi possível gerar o relatório DOCX.',
      );
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      const insp = await getInspectionService(db).getInspection(id);
      const result = await generateInspectionPdf(insp);
      if (result && (await Sharing.isAvailableAsync())) {
        await sharePdf(result.uri);
      } else {
        Alert.alert('PDF', 'Não foi possível gerar o PDF.');
      }
    } catch (err) {
      console.warn('Falha ao exportar PDF:', err);
      Alert.alert(
        'Erro ao exportar PDF',
        err instanceof Error ? err.message : 'Não foi possível gerar o relatório PDF.',
      );
    } finally {
      setExporting(null);
    }
  };

  const exportZip = async () => {
    setExporting('zip');
    try {
      const insp = await getInspectionService(db).getInspection(id);
      const ok = await zipInspectionPhotosAndShare(insp);
      if (!ok) Alert.alert('Sem fotos', 'Nenhuma foto anexada a esta inspeção.');
    } catch (err) {
      console.warn('Falha ao exportar ZIP:', err);
      Alert.alert(
        'Erro ao exportar as fotos',
        err instanceof Error ? err.message : 'Não foi possível gerar o arquivo ZIP.',
      );
    } finally {
      setExporting(null);
    }
  };

  const exportXlsx = async () => {
    if (!inspection?.date) {
      Alert.alert('Data não definida', 'Esta vistoria não tem data de vistoria definida.');
      return;
    }
    setExporting('xlsx');
    try {
      const ok = await generate5w2hAndShare(db, inspection.date);
      if (!ok) {
        Alert.alert(
          'Nada para exportar',
          'Nenhum item pendente encontrado nas vistorias desta data.',
        );
      }
    } catch (err) {
      console.warn('Falha ao exportar XLSX:', err);
      Alert.alert(
        'Erro ao exportar o plano 5W2H',
        err instanceof Error ? err.message : 'Não foi possível gerar o arquivo XLSX.',
      );
    } finally {
      setExporting(null);
    }
  };

  const done = inspection?.status === 'completed';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <AppLogo size={40} rounded={9} />
          <View style={styles.titleWrap}>
            {done ? (
              <Text style={[styles.title, { color: colors.text }]}>Vistoria concluída</Text>
            ) : (
              <Text style={[styles.title, { color: colors.text }]}>Exportar documentos</Text>
            )}
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Gere os relatórios e arquivos da inspeção
            </Text>
          </View>
        </View>

        {done ? (
          <View style={[styles.banner, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark-circle" size={30} color="#fff" />
            <Text style={styles.bannerText}>Vistoria concluída com sucesso!</Text>
          </View>
        ) : null}

        {inspection?.companyName ? (
          <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
            {inspection.companyName}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Área(s): {(inspection?.areas ?? []).length > 0
            ? (inspection?.areas ?? []).map((a) => a.name).join(' • ')
            : inspection?.areaName}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Data: {(inspection?.date ?? '').split('-').reverse().join('/')} • Inspetor: {inspection?.inspectorName}
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Exportar documentos</Text>

        <Pressable
          style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={exportDocx}
          disabled={exporting !== null}
        >
          <View style={[styles.exportIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="document-text" size={22} color="#fff" />
          </View>
          <View style={styles.exportBody}>
            <Text style={[styles.exportTitle, { color: colors.text }]}>Checklist DOCX</Text>
            <Text style={[styles.exportSub, { color: colors.textSecondary }]}>
              Relatório completo da vistoria em Word
            </Text>
          </View>
          {exporting === 'docx' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          )}
        </Pressable>

        <Pressable
          style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={exportPdf}
          disabled={exporting !== null}
        >
          <View style={[styles.exportIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="print-outline" size={22} color="#fff" />
          </View>
          <View style={styles.exportBody}>
            <Text style={[styles.exportTitle, { color: colors.text }]}>Checklist PDF</Text>
            <Text style={[styles.exportSub, { color: colors.textSecondary }]}>
              Versão em PDF pronta para compartilhar
            </Text>
          </View>
          {exporting === 'pdf' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          )}
        </Pressable>

        <Pressable
          style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={exportZip}
          disabled={exporting !== null}
        >
          <View style={[styles.exportIcon, { backgroundColor: colors.textSecondary }]}>
            <Ionicons name="archive-outline" size={22} color="#fff" />
          </View>
          <View style={styles.exportBody}>
            <Text style={[styles.exportTitle, { color: colors.text }]}>Fotos (ZIP)</Text>
            <Text style={[styles.exportSub, { color: colors.textSecondary }]}>
              Todas as fotos anexadas em um arquivo compactado
            </Text>
          </View>
          {exporting === 'zip' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          )}
        </Pressable>

        <Pressable
          style={[styles.exportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={exportXlsx}
          disabled={exporting !== null}
        >
          <View style={[styles.exportIcon, { backgroundColor: colors.success }]}>
            <Ionicons name="grid-outline" size={22} color="#fff" />
          </View>
          <View style={styles.exportBody}>
            <Text style={[styles.exportTitle, { color: colors.text }]}>Plano de Ação 5W2H</Text>
            <Text style={[styles.exportSub, { color: colors.textSecondary }]}>
              Planos das vistorias desta data em Excel
            </Text>
          </View>
          {exporting === 'xlsx' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          )}
        </Pressable>

        <Pressable style={[styles.homeBtn, { borderColor: colors.primary }]} onPress={() => router.replace('/(tabs)')}>
          <Ionicons name="home-outline" size={16} color={colors.primary} />
          <Text style={[styles.homeBtnText, { color: colors.primary }]}>Voltar ao início</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
  },
  bannerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 0 },
  subtitle: { fontSize: 13, marginTop: 3 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  titleWrap: { flex: 1 },
  companyName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  meta: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 22, marginBottom: 12 },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  exportIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBody: { flex: 1 },
  exportTitle: { fontSize: 15, fontWeight: '600' },
  exportSub: { fontSize: 12, marginTop: 2 },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 20,
  },
  homeBtnText: { fontSize: 14, fontWeight: '700' },
});