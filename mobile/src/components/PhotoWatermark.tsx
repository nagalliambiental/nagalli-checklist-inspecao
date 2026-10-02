import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';

let captureRef: ((ref: any, options?: any) => Promise<string>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  captureRef = require('react-native-view-shot').captureRef;
} catch {
  captureRef = null;
}

const LOGO = require('../../assets/nagalli-logo.png');

function formatLatLon(lat?: number, lon?: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) return '';
  return `${lat!.toFixed(5)}, ${lon!.toFixed(5)}`;
}

function formatDateTimeBR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()} ${h}:${min}`;
}

interface Props {
  uri: string;
  width: number;
  height: number;
  caption?: string;
  latitude?: number;
  longitude?: number;
  onSave: (uri: string | null) => void;
  onCancel: () => void;
}

const LOAD_WATCHDOG_MS = 4000;
const CAPTURE_TIMEOUT_MS = 8000;

export function PhotoWatermark({ uri, width, height, caption, latitude, longitude, onSave, onCancel }: Props) {
  const ref = useRef<View>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { width: winW } = useWindowDimensions();

  const displayW = Math.min(winW - 32, 900);
  const ratio = width > 0 && height > 0 ? height / width : 3 / 4;
  const displayH = Math.round(displayW * ratio);
  const s = Math.max(0.6, Math.min(1.2, displayW / 900));

  const doneRef = useRef(onSave);
  doneRef.current = onSave;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) setFailed(true);
    }, LOAD_WATCHDOG_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  useEffect(() => {
    if (!loaded && !failed) return;
    let cancelled = false;
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      if (!cancelled) doneRef.current(result);
    };
    if (failed || !captureRef || !ref.current) {
      const t = setTimeout(() => finish(null), 250);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    let timeout: any;
    const run = async () => {
      try {
        await new Promise((r) => setTimeout(r, 200));
        if (cancelled) return;
        const result = await captureRef!(ref, {
          format: 'jpg',
          quality: 0.7,
          result: 'tmpfile',
        });
        finish(result);
      } catch {
        finish(null);
      }
    };
    timeout = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
    run();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [loaded, failed]);

  const datetime = formatDateTimeBR(new Date());
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude || 0) !== 0;
  const latlon = hasCoords ? formatLatLon(latitude, longitude) : '';

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Foto com marca Nagalli Ambiental</Text>
      <View ref={ref} collapsable={false} style={[styles.capture, { width: displayW, height: displayH }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        <View style={[styles.badge, { top: 10 * s, left: 10 * s }]}>
          <Image source={LOGO} style={{ width: 40 * s, height: 40 * s, borderRadius: 8 * s }} />
          <View style={{ marginLeft: 8 * s }}>
            <Text style={[styles.badgeTitle, { fontSize: 15 * s }]}>Checklist de Inspeção</Text>
            <Text style={[styles.badgeSub, { fontSize: 10 * s }]}>Nagalli Ambiental</Text>
          </View>
        </View>
        <View style={[styles.footer, { paddingVertical: 8 * s }]}>
          {caption ? (
            <Text numberOfLines={3} style={[styles.footerCaption, { fontSize: 12 * s }]}>
              {caption}
            </Text>
          ) : null}
          <Text style={[styles.footerTime, { fontSize: 13 * s }]}>
            📷 {datetime}
            {latlon ? ` • ${latlon}` : ' • sem GPS'}
          </Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        {!failed ? (
          <>
            <ActivityIndicator size="small" color="#2E7D32" />
            <Text style={styles.statusText}>Aplicando marca d'água...</Text>
          </>
        ) : (
          <Text style={styles.statusText}>Sem marca d'água — usando foto original.</Text>
        )}
        <TouchableOpacity onPress={() => doneRef.current(null)} hitSlop={10} style={styles.skipBtn}>
          <Text style={styles.skipText}>Usar original</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => cancelRef.current()} hitSlop={10} style={styles.skipBtn}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 10, backgroundColor: '#f0f3f1', borderRadius: 12, padding: 10 },
  title: { fontWeight: '800', color: '#2E7D32', fontSize: 14, marginBottom: 8 },
  capture: { backgroundColor: '#000', borderRadius: 8, overflow: 'hidden', alignSelf: 'center' },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 8,
  },
  badgeTitle: { color: '#fff', fontWeight: '800' },
  badgeSub: { color: '#dcdcdc' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  footerCaption: { color: '#fff', textAlign: 'center' },
  footerTime: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  statusText: { color: '#5a6b87', fontSize: 13, flex: 1 },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 10, minHeight: 40, justifyContent: 'center' },
  skipText: { color: '#2E7D32', fontWeight: '700', fontSize: 13 },
  cancelText: { color: '#cc3333', fontWeight: '700', fontSize: 13 },
});