// Icônes ligne (SVG inline, 20×20, trait courant = currentColor) — remplace
// les glyphes Unicode (◆▤✎∿⋯▲●○⚙÷⟿) utilisés jusqu'ici pour la nav et le
// menu "Plus" : plus net à toute résolution/zoom, cohérent d'une icône à
// l'autre (même épaisseur de trait, mêmes angles), et surtout univoque —
// certains glyphes Unicode (◆ pour "Accueil", ∿ pour "Stats") ne se
// comprenaient qu'après apprentissage, pas au premier regard.
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  home: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M3 9.5 10 3l7 6.5"/><path d="M5 8v8h10V8"/><path d="M8 16v-4.5h4V16"/></svg>`,
  calendar: `<svg viewBox="0 0 20 20" ${STROKE}><rect x="3" y="4" width="14" height="13" rx="1.5"/><path d="M3 8h14"/><path d="M7 2.5v3M13 2.5v3"/><path d="M6.5 11.5h1M9.5 11.5h1M12.5 11.5h1M6.5 14h1M9.5 14h1"/></svg>`,
  pencil: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M12.5 3.5 16.5 7.5 7 17 3 17.5 3.5 13.5Z"/><path d="M10.8 5.2 14.8 9.2"/></svg>`,
  chart: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M3 17V3"/><path d="M3 17h14"/><path d="M6 14V9M10 14V6M14 14v-4"/></svg>`,
  grid: `<svg viewBox="0 0 20 20" ${STROKE}><rect x="3" y="3" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1"/></svg>`,
  dumbbell: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M2.5 10h15"/><path d="M5 7v6M15 7v6"/><rect x="2.5" y="8.2" width="2.5" height="3.6" rx="0.8"/><rect x="15" y="8.2" width="2.5" height="3.6" rx="0.8"/></svg>`,
  flame: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M10 2.5c1.5 2 2.5 3.3 2.5 5.2 0 .9-.4 1.6-.8 2.2.9-.3 1.8-1.2 2-2.4 1 1.4 1.3 2.9 1.3 4 0 3.3-2.2 5.5-5 5.5s-5-2.2-5-5c0-2.6 1.6-4.2 2.7-5.5-.1.9.1 1.7.6 2.3-.2-2.5.9-4.7 2.7-6.3Z"/></svg>`,
  flag: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M5 2.5v15"/><path d="M5 3.5h9.5L12 7l2.5 3.5H5"/></svg>`,
  user: `<svg viewBox="0 0 20 20" ${STROKE}><circle cx="10" cy="6.5" r="3.2"/><path d="M3.5 17c.8-3.4 3.3-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/></svg>`,
  gear: `<svg viewBox="0 0 20 20" ${STROKE}><circle cx="10" cy="10" r="2.6"/><path d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4M14.8 14.8l-1.4-1.4M6.6 6.6 5.2 5.2"/></svg>`,
  calculator: `<svg viewBox="0 0 20 20" ${STROKE}><rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M6.5 6h7"/><circle cx="6.7" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="13.3" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="6.7" cy="13" r="0.6" fill="currentColor" stroke="none"/><circle cx="10" cy="13" r="0.6" fill="currentColor" stroke="none"/><circle cx="13.3" cy="13" r="0.6" fill="currentColor" stroke="none"/></svg>`,
  droplet: `<svg viewBox="0 0 20 20" ${STROKE}><path d="M10 2.8c2.6 3.3 5 6.3 5 9.3a5 5 0 0 1-10 0c0-3 2.4-6 5-9.3Z"/></svg>`,
};

/** @param {keyof typeof ICONS} name */
export function Icon(name) {
  return ICONS[name] ?? "";
}
