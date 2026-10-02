import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '../src/db/connection';
import { ThemeProvider } from '../src/contexts/ThemeContext';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseProvider>
        <ThemeProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="inspection/[id]" options={{ title: 'Inspeção' }} />
            <Stack.Screen name="actions/[id]" options={{ title: 'Ação' }} />
          </Stack>
        </ThemeProvider>
      </DatabaseProvider>
    </QueryClientProvider>
  );
}