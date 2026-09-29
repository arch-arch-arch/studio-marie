import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { validerProfil, fuseauValide } from '../../src/logique/profil.js';

const avec = modif => { const p = structuredClone(fictif); modif(p.regles_studio, p); return p; };

describe('fuseauValide', () => {
  it('accepte un fuseau IANA et refuse le reste', () => {
    expect(fuseauValide('Europe/Paris')).toBe(true);
    expect(fuseauValide('Mars/Olympus')).toBe(false);
    expect(fuseauValide('')).toBe(false);
    expect(fuseauValide(undefined)).toBe(false);
    expect(fuseauValide('+01:00')).toBe(false);
    expect(fuseauValide('europe/paris')).toBe(false);
    expect(fuseauValide('UTC')).toBe(true);
  });
});

describe('validerProfil', () => {
  it('accepte le profil fictif', () => {
    expect(validerProfil(fictif)).toEqual({ ok: true, erreurs: [] });
  });

  it('refuse ce qui n’est pas un objet', () => {
    for (const v of [null, [], 'texte', 3]) {
      expect(validerProfil(v)).toEqual({ ok: false, erreurs: ['Le fichier doit contenir un objet JSON.'] });
    }
  });

  it('explique qu’il manque regles_studio', () => {
    const p = structuredClone(fictif); delete p.regles_studio;
    const r = validerProfil(p);
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('regles_studio');
  });

  it('signale un fuseau inconnu', () => {
    const r = validerProfil(avec(rs => { rs.fuseau = 'Mars/Olympus'; }));
    expect(r.erreurs).toContain('regles_studio.fuseau : fuseau horaire inconnu (ex. « Europe/Paris »).');
  });

  it('signale une couleur de pilier invalide', () => {
    const r = validerProfil(avec(rs => { rs.piliers[1].couleur = 'rouge'; }));
    expect(r.erreurs).toContain('regles_studio.piliers[1].couleur doit être au format #rrggbb.');
  });

  it('signale un créneau incohérent', () => {
    const r = validerProfil(avec(rs => { rs.creneaux = [{ jours: [0], debut: '15:00', fin: '12:00' }]; }));
    expect(r.erreurs).toContain('regles_studio.creneaux[0].jours : liste de jours de 1 (lundi) à 7 (dimanche).');
    expect(r.erreurs).toContain('regles_studio.creneaux[0] : debut et fin au format HH:MM, avec debut < fin.');
  });

  it('signale stories_porte avec min > max', () => {
    const r = validerProfil(avec(rs => { rs.stories_porte = { min: 4, max: 2 }; }));
    expect(r.erreurs).toContain('regles_studio.stories_porte : min et max entiers, avec min ≤ max.');
  });

  it('remonte toutes les erreurs d’un coup', () => {
    const r = validerProfil(avec(rs => { rs.cadence.reel = -1; rs.cta_ratio_max = 2; rs.accroche_mots_max = 0; }));
    expect(r.ok).toBe(false);
    expect(r.erreurs).toHaveLength(3);
  });

  it('accepte des cibles valides et leur absence', () => {
    const sans = structuredClone(fictif);
    delete sans.regles_studio.cibles;
    expect(validerProfil(sans).ok).toBe(true);
    expect(validerProfil(fictif).ok).toBe(true);
  });

  it('refuse des cibles mal formées', () => {
    const p = structuredClone(fictif);
    p.regles_studio.cibles = { taux_abonnes_par_vue: 3, partages_par_post: -1, inconnue: 2, clics_porte_semaine: '30' };
    expect(validerProfil(p).erreurs).toEqual([
      'regles_studio.cibles.taux_abonnes_par_vue doit être compris entre 0 et 1 (0,003 pour 0,3 %).',
      'regles_studio.cibles.partages_par_post doit être un nombre positif ou nul.',
      'regles_studio.cibles.inconnue : indicateur inconnu.',
      'regles_studio.cibles.clics_porte_semaine doit être un nombre positif ou nul.',
    ]);
    p.regles_studio.cibles = [];
    expect(validerProfil(p).erreurs).toEqual(['regles_studio.cibles doit être un objet.']);
  });
});
