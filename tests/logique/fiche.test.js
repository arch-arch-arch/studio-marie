import { describe, it, expect } from 'vitest';
import {
  FORMATS, STATUTS, nouvelId, nouvelleFiche, empreinte, aReevaluer, modifierFiche, peutPasserA,
  changerStatut, deplacerFiche, analyserHashtags, formaterHashtags, texteAPublier,
} from '../../src/logique/fiche.js';

const T0 = '2026-09-27T20:00:00.000Z';
const base = () => nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: T0 });
const prete = () => {
  const f = { ...base(), visuel: 'a1', visuel_type: 'image', caption: 'Une caption.' };
  return { ...f, score: { total: 72, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
};

describe('nouvelleFiche', () => {
  it('crée une idée vierge', () => {
    const f = base();
    expect(f).toMatchObject({ id: 'f1', format: 'reel', statut: 'idee', pilier: 'socio', score: null, modifiee_depuis_creation: false, cree_le: T0, maj_le: T0, origine: { type: 'manuelle' } });
    expect(FORMATS).toEqual(['reel', 'carrousel', 'story', 'post']);
    expect(STATUTS).toEqual(['idee', 'brouillon', 'valide', 'programme', 'publie']);
  });
  it('refuse un format inconnu', () => {
    expect(() => nouvelleFiche({ id: 'x', format: 'tiktok', date_heure: T0, maintenant: T0 })).toThrow('Format inconnu : tiktok');
  });
  it('produit des identifiants distincts', () => {
    expect(nouvelId()).not.toBe(nouvelId());
    expect(nouvelId()).toMatch(/^f-[a-z0-9]+$/);
  });
});

describe('empreinte et réévaluation', () => {
  it('ne dépend que du contenu évalué', () => {
    const f = base();
    expect(empreinte(f)).toMatch(/^[0-9a-f]{8}$/);
    expect(empreinte({ ...f, statut: 'brouillon' })).toBe(empreinte(f));
    expect(empreinte({ ...f, caption: 'autre' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, visuel: 'a2' })).not.toBe(empreinte(f));
  });
  it('marque à réévaluer quand le contenu change après le score', () => {
    const f = prete();
    expect(aReevaluer(f)).toBe(false);
    expect(aReevaluer({ ...f, caption: 'changée' })).toBe(true);
    expect(aReevaluer(base())).toBe(false);
  });
});

describe('modifierFiche', () => {
  it('applique les changements et note la modification', () => {
    const g = modifierFiche(base(), { accroche: 'Salut' }, '2026-09-27T21:00:00.000Z');
    expect(g).toMatchObject({ accroche: 'Salut', modifiee_depuis_creation: true, maj_le: '2026-09-27T21:00:00.000Z' });
  });
});

describe('statuts', () => {
  it('laisse passer librement entre idée et brouillon', () => {
    expect(peutPasserA(base(), 'brouillon')).toEqual({ ok: true });
    expect(peutPasserA(base(), 'idee')).toEqual({ ok: true });
  });
  it('exige visuel, caption, score, conformité et score à jour pour valider', () => {
    expect(peutPasserA(base(), 'valide')).toEqual({ ok: false, raison: 'Ajoute un visuel avant de valider.' });
    expect(peutPasserA({ ...base(), visuel: 'a1' }, 'valide')).toEqual({ ok: false, raison: 'Ajoute une caption avant de valider.' });
    expect(peutPasserA({ ...base(), format: 'story', visuel: 'a1' }, 'valide')).toEqual({ ok: false, raison: 'Évalue la fiche avant de la valider.' });
    const rouge = { ...prete(), score: { ...prete().score, conformite: { etat: 'rouge', causes: ['mot « mindset »'] } } };
    expect(peutPasserA(rouge, 'programme')).toEqual({ ok: false, raison: 'Conformité au rouge : mot « mindset ».' });
    expect(peutPasserA({ ...prete(), caption: 'modifiée' }, 'valide')).toEqual({ ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' });
    expect(peutPasserA(prete(), 'publie')).toEqual({ ok: true });
  });
  it('refuse un statut inconnu', () => {
    expect(peutPasserA(base(), 'archive')).toEqual({ ok: false, raison: 'Statut inconnu : archive' });
  });
  it('changerStatut applique ou lève la raison', () => {
    expect(changerStatut(base(), 'brouillon', T0).statut).toBe('brouillon');
    expect(() => changerStatut(base(), 'valide', T0)).toThrow('Ajoute un visuel avant de valider.');
  });
});

describe('deplacerFiche', () => {
  it('change le jour et garde l’heure locale, même au changement d’heure', () => {
    const f = { ...base(), date_heure: '2026-10-24T10:00:00.000Z' };
    const g = deplacerFiche(f, '2026-10-24T22:00:00.000Z', 'Europe/Paris', T0);
    expect(g.date_heure).toBe('2026-10-25T11:00:00.000Z');
    expect(g.modifiee_depuis_creation).toBe(true);
  });
});

describe('hashtags et texte à publier', () => {
  it('analyse un texte libre', () => {
    expect(analyserHashtags('#nuit, #Socio  socio ##humour;#nuit')).toEqual(['nuit', 'Socio', 'humour']);
    expect(analyserHashtags('')).toEqual([]);
  });
  it('formate et assemble', () => {
    expect(formaterHashtags(['nuit', 'socio'])).toBe('#nuit #socio');
    expect(texteAPublier({ caption: ' Bonsoir. ', hashtags: ['nuit'] })).toBe('Bonsoir.\n\n#nuit');
    expect(texteAPublier({ caption: '', hashtags: [] })).toBe('');
  });
});
