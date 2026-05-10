import React, { createContext, useContext, useState, useEffect } from 'react';
import { temas, crearPaleta, crearGlow } from '../theme/ui';
import { supabase } from '../services/supabase';

const TemaContext = createContext(null);

export function TemaProvider({ children, session }) {
  const [temaActual, setTemaActual] = useState('violeta');

  // Cargar el tema desde Supabase al iniciar sesión
  useEffect(() => {
    if (session?.user?.id) {
      cargarTema();
    }
  }, [session]);

  const cargarTema = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('tema_preferido')
        .eq('id', session.user.id)
        .single();

      if (data?.tema_preferido && temas[data.tema_preferido]) {
        setTemaActual(data.tema_preferido);
      }
    } catch (err) {
      console.log('Error cargando tema:', err);
    }
  };

  const cambiarTema = async (nuevoTema) => {
    if (!temas[nuevoTema]) return;
    setTemaActual(nuevoTema);

    // Guardar en Supabase si hay sesión
    if (session?.user?.id) {
      try {
        await supabase
          .from('users')
          .update({ tema_preferido: nuevoTema })
          .eq('id', session.user.id);
      } catch (err) {
        console.log('Error guardando tema:', err);
      }
    }
  };

  const palette = crearPaleta(temas[temaActual]);
  const glow = crearGlow(temas[temaActual].primary);

  return (
    <TemaContext.Provider value={{ temaActual, setTemaActual: cambiarTema, palette, glow, temas }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de TemaProvider');
  return ctx;
}