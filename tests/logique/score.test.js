import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { composerScore, construireExamen, lignesExamen, nomAssistant, fusionnerConformite, POIDS, PLAFOND_ROUGE } from '../../src/logique/score.js';

const VERT = { etat: 'vert', causes: [] };
const f = (format = 'reel') => ({ ...nouvelleFiche({ id: 'f1', format, date_heure: '2026-09-28T10:00:00.000Z', maintenant: 'x' }), caption: 'c', visuel: 'a1' });
const jugement = (notes, conformite = VERT) => ({ notes, phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' }, conformite });
const verif = (alertes = [], conformite = VERT) => ({ conformite, alertes, mesures: {} });
const composer = (fiche, v, j) => composerScore({ fiche, verification: v, jugement: j, versionProfil: 3, maintenant: 'T' });
const dix = { accroche: 10, voix: 10, mecanique: 10 };

describe('composerScore', () => {
  it('ajoute l’examen seulement s’il est fourni', () => {
    const fiche = f('reel');
    const args = { fiche, verification: verif(), jugement: jugement(dix), versionProfil: 3, maintenant: 'T' };
    const sans = composerScore(args);
    const avec = composerScore({ ...args, examen: { visuel: 'aucun' } });
    expect(sans).not.toHaveProperty('examen');
    expect(avec.examen).toEqual({ visuel: 'aucun' });
  });

  it('reel parfait : 100, poids 40/30/30', () => {
    const fiche = f('reel');
    expect(composer(fiche, verif(), jugement(dix))).toEqual({
      total: 100,
      criteres: [
        { cle: 'accroche', nom: 'Accroche et diffusion', points: 40, max: 40, phrase: 'A.' },
        { cle: 'voix', nom: 'Voix et esthétique', points: 30, max: 30, phrase: 'V.' },
        { cle: 'mecanique', nom: 'Mécanique de la caption', points: 30, max: 30, phrase: 'M.' },
      ],
      conformite: VERT, alertes: [], version_profil: 3, evalue_le: 'T', empreinte: empreinte(fiche),
    });
  });

  it('applique les poids de la story et du post (grille du carrousel)', () => {
    expect(composer(f('story'), verif(), jugement({ accroche: 5, voix: 5, mecanique: 5 })).total).toBe(50);
    expect(composer(f('post'), verif(), jugement(dix)).criteres.map(c => c.max)).toEqual([30, 35, 35]);
    expect(POIDS.carrousel).toEqual({ accroche: 30, voix: 35, mecanique: 35 });
  });

  it('retire 20 % du maximum du critère par alerte, jamais sous zéro', () => {
    const accroche = { critere: 'accroche', texte: 'x' };
    expect(composer(f('reel'), verif([accroche]), jugement(dix)).total).toBe(92);
    const deux = [{ critere: 'mecanique', texte: 'a' }, { critere: 'mecanique', texte: 'b' }];
    expect(composer(f('carrousel'), verif(deux), jugement({ accroche: 0, voix: 0, mecanique: 5 })).criteres[2].points).toBe(4);
    expect(composer(f('carrousel'), verif([...deux, ...deux]), jugement({ accroche: 0, voix: 0, mecanique: 1 })).criteres[2].points).toBe(0);
  });

  it('une alerte sans critère ne pénalise pas mais reste listée', () => {
    const s = composer(f('post'), verif([{ critere: null, texte: 'Photo seule.' }]), jugement(dix));
    expect(s.total).toBe(100);
    expect(s.alertes).toEqual(['Photo seule.']);
  });

  it('borne les notes entre 0 et 10', () => {
    expect(composer(f('reel'), verif(), jugement({ accroche: 12, voix: -3, mecanique: 'x' })).criteres.map(c => c.points)).toEqual([40, 0, 0]);
  });

  it('Claude ne peut pas lever un rouge calculé : plafond à 40', () => {
    const s = composer(f('reel'), verif([], { etat: 'rouge', causes: ['mot à éviter « mindset »'] }), jugement(dix));
    expect(s.conformite).toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(s.total).toBe(PLAFOND_ROUGE);
  });

  it('un rouge jugé par Claude bloque aussi ; un orange est gardé sans plafond', () => {
    const rouge = composer(f('reel'), verif(), jugement(dix, { etat: 'rouge', causes: ['groupe visé'] }));
    expect(rouge.conformite).toEqual({ etat: 'rouge', causes: ['groupe visé'] });
    expect(rouge.total).toBe(40);
    const orange = composer(f('reel'), verif(), jugement(dix, { etat: 'orange', causes: ['ambigu'] }));
    expect(orange.conformite).toEqual({ etat: 'orange', causes: ['ambigu'] });
    expect(orange.total).toBe(100);
  });
});

describe('fusionnerConformite', () => {
  it('garde la plus sévère et dédoublonne les causes', () => {
    expect(fusionnerConformite({ etat: 'rouge', causes: ['a'] }, { etat: 'orange', causes: ['a', 'b'] }))
      .toEqual({ etat: 'rouge', causes: ['a', 'b'] });
    expect(fusionnerConformite(VERT, VERT)).toEqual(VERT);
    expect(fusionnerConformite(VERT, { etat: 'inconnu', causes: [] }).etat).toBe('orange');
  });

  it('traite un état calculé inconnu comme rouge : le verrou reste fermé par défaut', () => {
    expect(fusionnerConformite({ etat: 'bizarre', causes: [] }, { etat: 'vert', causes: [] }).etat).toBe('rouge');
  });
});

describe('examen', () => {
  const verification = { conformite: { etat: 'orange', causes: ['c1'] }, alertes: [{ critere: 'accroche', texte: 'a1' }, { critere: null, texte: 'a2' }] };
  const base = { version_profil: 3, sections_profil: ['regles_studio', 'ton_et_voix'], contenus_semaine: 2, verification };

  it('construit le bloc examen', () => {
    expect(construireExamen({ ...base, visuel: 'non_joint', raison_visuel: 'taille' })).toEqual({
      visuel: 'non_joint', raison_visuel: 'taille', version_profil: 3, sections_profil: ['regles_studio', 'ton_et_voix'],
      contenus_semaine: 2, alertes_calculees: 2, blocages_calcules: 1,
    });
    expect(construireExamen({ ...base, visuel: 'joint' }).raison_visuel).toBeNull();
  });

  it('traduit l’examen en phrases', () => {
    expect(lignesExamen(construireExamen({ ...base, visuel: 'joint' }))).toEqual([
      'Visuel examiné.',
      'Profil version 3 : sections regles_studio, ton_et_voix.',
      '2 autres contenus de la semaine comparés.',
      '2 alertes et 1 blocage calculés par le studio.',
    ]);
    const un = construireExamen({ ...base, visuel: 'aucun', contenus_semaine: 1, verification: { conformite: { etat: 'vert', causes: [] }, alertes: [] } });
    expect(lignesExamen(un)).toEqual([
      'Pas de visuel.', 'Profil version 3 : sections regles_studio, ton_et_voix.', '1 autre contenu de la semaine comparé.', '0 alerte et 0 blocage calculés par le studio.',
    ]);
    expect(lignesExamen({ ...un, contenus_semaine: 0 })[2]).toBe('Aucun autre contenu de la semaine comparé.');
    for (const [raison, texte] of [['video', 'Visuel non examiné : vidéo (seules les images sont envoyées).'], ['type', 'Visuel non examiné : format refusé.'], ['taille', 'Visuel non examiné : fichier trop lourd.'], ['indisponible', 'Visuel non examiné : envoi d’images indisponible.']]) {
      expect(lignesExamen(construireExamen({ ...base, visuel: 'non_joint', raison_visuel: raison }))[0]).toBe(texte);
    }
  });

  it('signale une évaluation antérieure sans examen', () => {
    expect(lignesExamen(null)).toEqual(['Détail non disponible pour cette évaluation (antérieure).']);
    expect(lignesExamen(undefined)).toEqual(['Détail non disponible pour cette évaluation (antérieure).']);
  });
});

describe('analyse par dossier', () => {
  const base = { visuel: 'joint', raison_visuel: null, version_profil: 2, sections_profil: ['regles_studio'], contenus_semaine: 4, alertes_calculees: 0, blocages_calcules: 0 };
  it('nomme l’assistant et l’annonce en première ligne', () => {
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'chatgpt' })).toBe('ChatGPT');
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'claude' })).toBe('Claude');
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'inconnu' })).toBe('l’assistant');
    expect(nomAssistant(base)).toBe('Claude');
    expect(nomAssistant(null)).toBe('Claude');
    expect(lignesExamen({ ...base, source: 'dossier', assistant: 'chatgpt' })[0]).toBe('Analyse par dossier (ChatGPT).');
    expect(lignesExamen({ ...base, source: 'dossier', assistant: 'inconnu' })[0]).toBe('Analyse par dossier.');
    expect(lignesExamen(base)[0]).toBe('Visuel examiné.');
  });
  it('compare des contenus du dossier, pas de la semaine', () => {
    const d = { ...base, source: 'dossier', assistant: 'claude' };
    expect(lignesExamen({ ...d, contenus_semaine: 4 })[3]).toBe('4 autres contenus du dossier comparés.');
    expect(lignesExamen({ ...d, contenus_semaine: 1 })[3]).toBe('1 autre contenu du dossier comparé.');
    expect(lignesExamen({ ...d, contenus_semaine: 0 })[3]).toBe('Aucun autre contenu du dossier comparé.');
    expect(lignesExamen({ ...base, contenus_semaine: 4 })[2]).toBe('4 autres contenus de la semaine comparés.');
  });
});
