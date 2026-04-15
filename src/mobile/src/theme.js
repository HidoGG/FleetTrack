/**
 * FleetTrack Design Tokens — Mobile (Light Mode)
 * Espejo exacto del sistema CSS del frontend web.
 */

export const colors = {
  // Fondos — mismos que la web
  bg:        '#f8fafc',   // slate-50
  surface:   '#ffffff',   // blanco puro
  surface2:  '#f1f5f9',   // slate-100

  // Bordes
  border:    '#e2e8f0',   // slate-200
  border2:   '#cbd5e1',   // slate-300

  // Acento indigo (= --accent de la web)
  accent:    '#4f46e5',
  accentH:   '#4338ca',
  accentL:   '#ede9fe',
  accentText:'#4f46e5',

  // Semánticos — versiones light (pastel suave, igual que badges web)
  success:   '#10b981',
  successL:  '#d1fae5',   // fondo badge verde
  successT:  '#059669',   // texto badge verde
  danger:    '#ef4444',
  dangerL:   '#fee2e2',
  dangerT:   '#dc2626',
  warn:      '#f59e0b',
  warnL:     '#fef3c7',
  warnT:     '#d97706',

  // Texto
  text:       '#0f172a',  // slate-900
  text2:      '#334155',  // slate-700
  muted:      '#64748b',  // slate-500
  muted2:     '#94a3b8',  // slate-400
  placeholder:'#94a3b8',
}

// Radios más "sharp", igual que la web (--radius: 10px, --radius-lg: 14px)
export const radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  full: 9999,
}

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
}

export const font = {
  xs:   11,
  sm:   12,
  base: 14,
  md:   15,
  lg:   16,
  xl:   18,
  xxl:  22,
  xxxl: 28,
}

export const shadow = {
  // Sombra sutil para cards (igual que --shadow de la web)
  card:    {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  // Sombra media para botones elevados
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  accent:  {
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  success: {
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  danger:  {
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
}
