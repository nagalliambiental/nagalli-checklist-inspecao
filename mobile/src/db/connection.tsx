import { SQLiteProvider } from 'expo-sqlite';
import { initializeDatabase, DB_NAME } from './schema';
import React from 'react';

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={initializeDatabase}>
      {children}
    </SQLiteProvider>
  );
}