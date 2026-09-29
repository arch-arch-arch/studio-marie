import { h } from './h.js';

const L = 360; const H = 180; const M = { haut: 12, droite: 12, bas: 28, gauche: 44 };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ouvrir = libelle => `<svg viewBox="0 0 ${L} ${H}" class="graphique-svg" role="img" aria-label="${esc(libelle)}">`;

function echelle(valeurs, cible) {
  const toutes = [...valeurs, ...(cible != null ? [cible] : []), 0];
  const min = Math.min(...toutes);
  const max = Math.max(...toutes);
  const etendue = max - min || 1;
  const hautUtile = H - M.haut - M.bas;
  return v => M.haut + (max - v) / etendue * hautUtile;
}

function axeEtCible(y, cible, format) {
  let s = `<line class="axe" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (cible != null) {
    s += `<line class="cible" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(cible)}" y2="${y(cible)}"/>`;
    s += `<text class="cible-texte" x="${L - M.droite}" y="${y(cible) - 4}" text-anchor="end">Cible ${esc(format(cible))}</text>`;
  }
  return s;
}

export function svgBarres({ valeurs, cible = null, format = String }) {
  if (!valeurs.length) return '';
  const y = echelle(valeurs.map(v => v.valeur), cible);
  const pas = (L - M.gauche - M.droite) / valeurs.length;
  const largeur = Math.max(2, pas * 0.7);
  let s = ouvrir('Graphique en barres');
  valeurs.forEach((v, i) => {
    const x = M.gauche + i * pas + (pas - largeur) / 2;
    const haut = Math.min(y(v.valeur), y(0));
    const hauteur = Math.max(1, Math.abs(y(0) - y(v.valeur)));
    s += `<rect class="barre${v.valeur < 0 ? ' barre-negative' : ''}" x="${x}" y="${haut}" width="${largeur}" height="${hauteur}"><title>${esc(v.titre)} : ${esc(format(v.valeur))}</title></rect>`;
    if (valeurs.length <= 12) s += `<text class="etiquette-axe" x="${x + largeur / 2}" y="${H - 8}" text-anchor="middle">${esc(v.etiquette)}</text>`;
  });
  return `${s}${axeEtCible(y, cible, format)}</svg>`;
}

export function svgCourbe({ points, cible = null, format = String }) {
  if (!points.length) return '';
  const y = echelle(points.map(p => p.valeur), cible);
  const pas = points.length > 1 ? (L - M.gauche - M.droite) / (points.length - 1) : 0;
  const xs = points.map((_, i) => M.gauche + i * pas);
  let s = ouvrir('Courbe');
  s += `<polyline class="courbe" fill="none" points="${points.map((p, i) => `${xs[i]},${y(p.valeur)}`).join(' ')}"/>`;
  points.forEach((p, i) => { s += `<circle class="point" cx="${xs[i]}" cy="${y(p.valeur)}" r="3"><title>${esc(p.titre)} : ${esc(format(p.valeur))}</title></circle>`; });
  return `${s}${axeEtCible(y, cible, format)}</svg>`;
}

export function svgNuage({ points, formatY = String }) {
  if (!points.length) return '';
  const y = echelle(points.map(p => p.y), null);
  const x = v => M.gauche + (Math.max(0, Math.min(100, v)) / 100) * (L - M.gauche - M.droite);
  let s = ouvrir('Nuage de points');
  s += `<line class="axe" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += `<text class="etiquette-axe" x="${M.gauche}" y="${H - 8}">Score 0</text><text class="etiquette-axe" x="${L - M.droite}" y="${H - 8}" text-anchor="end">100</text>`;
  points.forEach(p => { s += `<circle class="point" cx="${x(p.x)}" cy="${y(p.y)}" r="4"><title>${esc(p.titre)} : score ${esc(p.x)}, ${esc(formatY(p.y))}</title></circle>`; });
  return `${s}</svg>`;
}

export function figure(titre, svg, messageVide) {
  const corps = h('div', { class: 'graphique-corps' });
  if (svg) corps.innerHTML = svg;
  else corps.append(h('p', { class: 'aide' }, messageVide));
  return h('figure', { class: 'graphique' }, h('figcaption', {}, titre), corps);
}
