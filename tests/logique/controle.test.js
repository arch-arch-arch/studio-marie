import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { controlerSemaine, fichesDeLaSemaine } from '../../src/logique/controle.js';

const R = fictif.regles_studio;
const FZ = R.fuseau;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, extra = {}, heure = '12:00') => ({
  ...nouvelleFiche({ id: `t${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, FZ), maintenant: LUNDI }),
  ...extra,
});
const JOURS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const etats = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.etat]));
const valeurs = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.valeur]));

function semaineIdeale() {
  return [
    fiche('reel', JOURS[0], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('reel', JOURS[1], { role_caption: 'engagement', pilier: 'nuit' }),
    fiche('reel', JOURS[3], { role_caption: 'cta', cta: true, pilier: 'pont_offre' }),
    fiche('reel', JOURS[4], { role_caption: 'deadpan', pilier: 'humour_sec', ragebait: true }),
    fiche('carrousel', JOURS[2], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('carrousel', JOURS[5], { role_caption: 'engagement', pilier: 'nuit' }),
    ...JOURS.map((j, i) => fiche('story', j, { porte: i < 2 }, '19:00')),
  ];
}

describe('controlerSemaine', () => {
  it('semaine vide', () => {
    const p = controlerSemaine([], R, LUNDI);
    expect(p.map(x => x.cle)).toEqual(['reels', 'carrousels', 'stories', 'cta', 'roles', 'ragebait', 'porte', 'piliers']);
    expect(etats(p)).toEqual({ reels: 'rouge', carrousels: 'rouge', stories: 'rouge', cta: 'vert', roles: 'rouge', ragebait: 'vert', porte: 'rouge', piliers: 'orange' });
    expect(valeurs(p)).toMatchObject({ reels: '0/4', carrousels: '0/2', stories: '0/7', cta: '0/0' });
  });

  it('semaine idéale : tout au vert', () => {
    const p = controlerSemaine(semaineIdeale(), R, LUNDI);
    expect(Object.values(etats(p))).toEqual(Array(8).fill('vert'));
    expect(valeurs(p)).toMatchObject({ reels: '4/4', cta: '1/6', roles: '4/1/1', porte: '2', piliers: '4/4' });
  });

  it('ignore les fiches hors de la semaine', () => {
    const p = controlerSemaine([...semaineIdeale(), fiche('reel', '2026-10-05')], R, LUNDI);
    expect(valeurs(p).reels).toBe('4/4');
  });

  it('juge la part d’appels à l’action', () => {
    const feed = k => Array.from({ length: k }, (_, i) => fiche('reel', JOURS[i]));
    const cta = (fiches, k) => fiches.map((f, i) => ({ ...f, cta: i < k }));
    expect(etats(controlerSemaine(cta(feed(5), 2), R, LUNDI)).cta).toBe('orange');
    expect(etats(controlerSemaine(cta(feed(4), 3), R, LUNDI)).cta).toBe('rouge');
    expect(etats(controlerSemaine(cta(feed(4), 0), R, LUNDI)).cta).toBe('orange');
    expect(etats(controlerSemaine(cta(feed(4), 1), R, LUNDI)).cta).toBe('vert');
  });

  it('juge les stories, le ragebait et la porte', () => {
    const cinqJours = JOURS.slice(0, 5).map(j => fiche('story', j));
    expect(etats(controlerSemaine(cinqJours, R, LUNDI)).stories).toBe('orange');
    const deuxRage = [fiche('reel', JOURS[0], { ragebait: true }), fiche('reel', JOURS[1], { ragebait: true })];
    expect(etats(controlerSemaine(deuxRage, R, LUNDI)).ragebait).toBe('rouge');
    const portes = k => JOURS.slice(0, 7).map((j, i) => fiche('story', j, { porte: i < k }));
    expect(etats(controlerSemaine(portes(1), R, LUNDI)).porte).toBe('orange');
    expect(etats(controlerSemaine(portes(4), R, LUNDI)).porte).toBe('orange');
    expect(etats(controlerSemaine(portes(5), R, LUNDI)).porte).toBe('rouge');
  });

  it('juge l’équilibre des piliers', () => {
    const domine = ['socio', 'socio', 'socio', 'nuit'].map((p, i) => fiche('reel', JOURS[i], { pilier: p }));
    expect(etats(controlerSemaine(domine, R, LUNDI)).piliers).toBe('rouge');
  });
});

describe('fichesDeLaSemaine', () => {
  it('garde une story du dimanche 23 h 30 dans la semaine du changement d’heure', () => {
    const debut = '2026-10-18T22:00:00.000Z';
    const dimanche = fiche('story', '2026-10-25', {}, '23:30');
    const lundiSuivant = fiche('story', '2026-10-26', {}, '00:10');
    expect(fichesDeLaSemaine([dimanche, lundiSuivant], debut, FZ).map(f => f.id)).toEqual([dimanche.id]);
  });
});
