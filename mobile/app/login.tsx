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
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppLogo } from '../src/components/AppHeader';
import { getCloudUser, login, register, syncNow } from '../src/services/cloud.service';

export default function LoginScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCloudUser(db).then((user) => {
      if (user?.email) setEmail(user.email);
    });
  }, [db]);

  const submit = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Dados incompletos', 'Informe e-mail e senha.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Nome obrigatório', 'Informe seu nome.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(db, email.trim(), password, name.trim());
      } else {
        await login(db, email.trim(), password);
      }
      const result = await syncNow(db).catch(() => null);
      Alert.alert(
        'Conectado',
        result ? `Sincronizado (${result.pushed} enviados, ${result.pulled} recebidos).` : 'Login realizado.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(mode === 'register' ? 'Falha ao cadastrar' : 'Falha no login', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [db, email, mode, name, password, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <AppLogo size={36} rounded={8} />
          <View style={styles.brandTitles}>
            <Text style={[styles.title, { color: colors.text }]}>Conta na nuvem</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Entre para sincronizar vistorias, fotos e planos.
            </Text>
          </View>
        </View>

        <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['login', 'register'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[styles.tab, { backgroundColor: active ? colors.primary : 'transparent' }]}
              >
                <Text style={[styles.tabText, { color: active ? colors.white : colors.textSecondary }]}>
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {mode === 'register' && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nome</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Seu nome"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            </>
          )}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>E-mail</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Senha</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••"
            placeholderTextColor={colors.textLight}
            secureTextEntry
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
        </View>

        <Pressable
          style={[styles.submit, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
              <Text style={styles.submitText}>{mode === 'login' ? 'Entrar e sincronizar' : 'Criar conta e sincronizar'}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
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
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  tab: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  tabText: { fontSize: 13.5, fontWeight: '700' },
  formCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 15 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    height: 50,
    marginTop: 4,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
