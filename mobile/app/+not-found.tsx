import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../src/contexts/ThemeContext';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Não encontrado' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Página não encontrada</Text>
        <Link href="/(tabs)" style={[styles.link, { backgroundColor: colors.primary }]}>
          <Text style={styles.linkText}>Voltar para as inspeções</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  link: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  linkText: { color: '#fff', fontWeight: '600' },
});