import React, { createContext, useContext, useState } from 'react';
import { temas, crearPaleta, crearGlow } from '../theme/ui';

const TemaContext = createContext(null);

export function TemaProvider({ children }) {
  const [temaActual, setTemaActual] = useState('violeta');

  const palette = crearPaleta(temas[temaActual]);
  const glow = crearGlow(temas[temaActual].primary);

  return (
    <TemaContext.Provider value={{ temaActual, setTemaActual, palette, glow, temas }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de TemaProvider');
  return ctx;
}