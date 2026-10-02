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
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppLogo } from '../src/components/AppHeader';
import { DEFAULT_INSPECTOR_NAME, getInspectorName, setInspectorName } from '../src/services/settings.service';
import { getCloudUser, logout, syncNow, type CloudUser } from '../src/services/cloud.service';

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getInspectorName(db).then((value) => {
      setName(value);
      setLoading(false);
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      getCloudUser(db).then(setCloudUser);
    }, [db]),
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncNow(db);
      Alert.alert('Sincronizado', `${result.pushed} enviados, ${result.pulled} recebidos.`);
    } catch (err) {
      Alert.alert('Falha ao sincronizar', err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }, [db]);

  const signOut = useCallback(() => {
    Alert.alert('Sair da conta', 'Os dados continuam no aparelho. Deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout(db);
          setCloudUser(null);
        },
      },
    ]);
  }, [db]);

  const save = useCallback(async () => {
    const value = name.trim();
    if (!value) {
      Alert.alert('Nome obrigatório', 'Informe o nome do inspetor.');
      return;
    }
    setSaving(true);
    try {
      await setInspectorName(db, value);
      router.back();
    } finally {
      setSaving(false);
    }
  }, [db, name, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <AppLogo size={36} rounded={8} />
          <View style={styles.brandTitles}>
            <Text style={[styles.title, { color: colors.text }]}>Configurações</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Dados do inspetor usados nas vistorias e relatórios.
            </Text>
          </View>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nome do inspetor</Text>
          {loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={DEFAULT_INSPECTOR_NAME}
              placeholderTextColor={colors.textLight}
              autoCapitalize="words"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
          )}
          <Text style={[styles.hint, { color: colors.textLight }]}>
            Esse nome aparece no campo "Responsável pela vistoria" dos relatórios.
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Conta na nuvem</Text>
          {cloudUser ? (
            <>
              <Text style={[styles.cloudUser, { color: colors.text }]} numberOfLines={1}>
                {cloudUser.email}
              </Text>
              <Pressable
                style={[styles.cloudBtn, { backgroundColor: colors.primary, opacity: syncing ? 0.6 : 1 }]}
                onPress={sync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={17} color={colors.white} />
                    <Text style={styles.cloudBtnText}>Sincronizar agora</Text>
                  </>
                )}
              </Pressable>
              <Pressable style={[styles.cloudBtnGhost, { borderColor: colors.border }]} onPress={signOut}>
                <Text style={[styles.cloudBtnGhostText, { color: colors.text }]}>Sair da conta</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: colors.textLight }]}>
                Entre para sincronizar vistorias, empreendimentos e planos de ação com a nuvem.
              </Text>
              <Pressable
                style={[styles.cloudBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/login')}
              >
                <Ionicons name="cloud-outline" size={17} color={colors.white} />
                <Text style={styles.cloudBtnText}>Entrar / Criar conta</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving || loading ? 0.6 : 1 }]}
          onPress={save}
          disabled={saving || loading}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { paddingRight: 2 },
  brandTitles: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12.5, lineHeight: 17 },
  formCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15 },
  loader: { marginVertical: 12 },
  hint: { fontSize: 11.5, marginTop: 4 },
  cloudUser: { fontSize: 14, fontWeight: '600' },
  cloudBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    height: 46,
    marginTop: 8,
  },
  cloudBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  cloudBtnGhost: {
    borderWidth: 1.5,
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cloudBtnGhostText: { fontSize: 14, fontWeight: '600' },
  footer: { borderTopWidth: 1, padding: 16, marginTop: 'auto' },
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
