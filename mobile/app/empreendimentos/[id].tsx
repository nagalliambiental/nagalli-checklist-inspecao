import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppLogo } from '../../src/components/AppHeader';
import { getEmpreendimentoService } from '../../src/services/empreendimento.service';
import type { Empreendimento } from '../../src/types';

export default function EmpreendimentoEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();

  const [current, setCurrent] = useState<Empreendimento | null>(null);
  const [name, setName] = useState('');
  const [contratante, setContratante] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const emp = await getEmpreendimentoService(db).get(id);
      if (!emp) {
        Alert.alert('Empreendimento não encontrado', 'O registro pode ter sido removido.', [
          { text: 'Voltar', onPress: () => router.back() },
        ]);
        return;
      }
      setCurrent(emp);
      setName(emp.name);
      setContratante(emp.contratante);
      setAddress(emp.address);
      setNotes(emp.notes);
      setLoading(false);
    })();
  }, [db, id, isNew, router]);

  const save = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Nome obrigatório', 'Informe o nome do empreendimento.');
      return;
    }
    setSaving(true);
    try {
      const service = getEmpreendimentoService(db);
      if (isNew) {
        const created = await service.create({
          name,
          contratante,
          address,
          notes,
        });
        router.replace({ pathname: '/empreendimentos/[id]', params: { id: created.id } });
        return;
      }
      await service.update(id, { name, contratante, address, notes });
      router.back();
    } catch (err) {
      Alert.alert('Falha ao salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [contratante, address, db, isNew, name, notes, router, id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <AppLogo size={36} rounded={8} />
            <View style={styles.brandTitles}>
              <Text style={[styles.title, { color: colors.text }]}>
                {isNew ? 'Novo empreendimento' : 'Editar empreendimento'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                O cadastro é reutilizado nas próximas vistorias.
              </Text>
            </View>
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nome do empreendimento</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex.: Condomínio Edifício Aurora"
              placeholderTextColor={colors.textLight}
              autoCapitalize="words"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Contratante</Text>
            <TextInput
              value={contratante}
              onChangeText={setContratante}
              placeholder="Empresa ou responsável pela contratação"
              placeholderTextColor={colors.textLight}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Endereço</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Rua, número, bairro, cidade/UF"
              placeholderTextColor={colors.textLight}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Observações</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Chave de acesso, contato, particularidades"
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                styles.textarea,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />
          </View>

          {current && current.contratante !== contratante && current.name !== name ? (
            <Text style={[styles.hint, { color: colors.textLight }]}>
              Ao salvar, o nome é atualizado também nas vistorias já registradas.
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.saveText}>Salvar</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 48 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { paddingRight: 2 },
  brandTitles: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12.5, lineHeight: 17 },
  formCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15 },
  textarea: { height: 88, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 17 },
  footer: { borderTopWidth: 1, padding: 16 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    height: 48,
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
