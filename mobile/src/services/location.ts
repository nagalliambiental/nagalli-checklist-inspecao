import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

let lastCoords: Coords | null = null;
let permissionAsked = false;

export async function getCurrentCoords(maxWaitMs = 8000): Promise<Coords | null> {
  try {
    if (!permissionAsked) {
      permissionAsked = true;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return lastCoords;
    } else {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return lastCoords;
    }

    try {
      const known = await Location.getLastKnownPositionAsync();
      if (known?.coords) {
        lastCoords = { latitude: known.coords.latitude, longitude: known.coords.longitude };
      }
    } catch {
      // ignora — segue para a posição atual
    }

    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), maxWaitMs)),
    ]);
    if (current?.coords) {
      lastCoords = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    }
    return lastCoords;
  } catch {
    return lastCoords;
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    permissionAsked = true;
    return status === 'granted';
  } catch {
    return false;
  }
}