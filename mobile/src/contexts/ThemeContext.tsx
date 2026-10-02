import React, { createContext, useContext } from 'react';
import { colors } from '../constants/colors';

const ThemeContext = createContext<{ colors: typeof colors }>({ colors });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={{ colors }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}