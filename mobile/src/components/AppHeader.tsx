import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGO = require('../../assets/nagalli-logo.png');

interface LogoProps {
  size?: number;
  rounded?: number;
}

/** Marca Nagalli Ambiental (emblema colorido verde/azul/amarelo sobre branco). */
export function AppLogo({ size = 32, rounded = 8 }: LogoProps) {
  return (
    <Image
      source={LOGO}
      style={[{ width: size, height: size, borderRadius: rounded }]}
      resizeMode="cover"
    />
  );
}

interface BrandHeaderProps {
  title: string;
  subtitle?: string;
}

/** Cabeçalho verde com a logo Nagalli à esquerda e o título da tela. */
export function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 12 }]}>
      <AppLogo size={34} rounded={8} />
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  titles: { flex: 1 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
});