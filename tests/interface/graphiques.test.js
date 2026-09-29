// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { svgBarres, svgCourbe, svgNuage, figure } from '../../src/interface/graphiques.js';

const monter = svg => { const d = document.createElement('div'); d.innerHTML = svg; return d; };

describe('graphiques', () => {
  it('dessine une barre par valeur, la ligne de cible et échappe les libellés', () => {
    const d = monter(svgBarres({ valeurs: [{ etiquette: 'W38', valeur: 5, titre: '<script>x</script>' }, { etiquette: 'W39', valeur: -3, titre: 'b' }], cible: 4, format: String }));
    expect(d.querySelectorAll('rect.barre').length).toBe(2);
    expect(d.querySelector('line.cible')).not.toBeNull();
    expect(d.innerHTML).not.toContain('<script>');
    expect(d.querySelector('title').textContent).toBe('<script>x</script> : 5');
  });
  it('sans cible, pas de ligne de cible', () => {
    expect(monter(svgBarres({ valeurs: [{ etiquette: 'a', valeur: 1, titre: 'a' }], cible: null, format: String })).querySelector('line.cible')).toBeNull();
  });
  it('trace une courbe et un nuage', () => {
    const c = monter(svgCourbe({ points: [{ etiquette: '1', valeur: 0.002, titre: 'a' }, { etiquette: '2', valeur: 0.004, titre: 'b' }], cible: 0.003, format: String }));
    expect(c.querySelector('polyline')).not.toBeNull();
    expect(c.querySelectorAll('circle').length).toBe(2);
    const n = monter(svgNuage({ points: [{ x: 70, y: 0.003, titre: 'a' }], formatY: String }));
    expect(n.querySelectorAll('circle').length).toBe(1);
  });
  it('une figure vide affiche son message', () => {
    const f = figure('Titre', '', 'Pas encore de relevé.');
    expect(f.querySelector('figcaption').textContent).toBe('Titre');
    expect(f.textContent).toContain('Pas encore de relevé.');
  });
});
