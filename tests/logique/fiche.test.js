import { describe, it, expect } from 'vitest';
import {
  FORMATS, STATUTS, nouvelId, nouvelleFiche, empreinte, aReevaluer, modifierFiche, peutPasserA,
  changerStatut, deplacerFiche, analyserHashtags, formaterHashtags, texteAPublier, appliquerEvaluation,
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
  it('couvre le format, le pilier, le rôle et le cta, mais pas la date, le statut ni le geotag', () => {
    const f = base();
    expect(empreinte({ ...f, format: 'post' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, pilier: 'autre' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, role_caption: 'cta' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, cta: true })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, date_heure: '2026-10-01T00:00:00.000Z' })).toBe(empreinte(f));
    expect(empreinte({ ...f, geotag: 'Paris' })).toBe(empreinte(f));
  });
});

describe('modifierFiche', () => {
  it('applique les changements et note la modification', () => {
    const g = modifierFiche(base(), { accroche: 'Salut' }, '2026-09-27T21:00:00.000Z');
    expect(g).toMatchObject({ accroche: 'Salut', modifiee_depuis_creation: true, maj_le: '2026-09-27T21:00:00.000Z' });
  });
  it('refuse de modifier un champ protégé', () => {
    expect(() => modifierFiche(base(), { statut: 'valide' }, T0)).toThrow('Champ protégé : statut');
    expect(() => modifierFiche(base(), { score: null }, T0)).toThrow('Champ protégé : score');
  });
  it('repasse en brouillon une fiche validée dont le contenu évalué change', () => {
    const validee = changerStatut(prete(), 'valide', T0);
    expect(modifierFiche(validee, { caption: 'autre' }, T0).statut).toBe('brouillon');
    expect(modifierFiche(validee, { geotag: 'Paris' }, T0).statut).toBe('valide');
    const publiee = changerStatut(validee, 'publie', T0);
    expect(modifierFiche(publiee, { caption: 'autre' }, T0).statut).toBe('publie');
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
  it('refuse une conformité non évaluée et accepte une conformité orange', () => {
    const sansConformite = { ...prete(), score: { ...prete().score, conformite: {} } };
    expect(peutPasserA(sansConformite, 'valide')).toEqual({ ok: false, raison: 'Conformité non évaluée : réévalue la fiche.' });
    const orange = { ...prete(), score: { ...prete().score, conformite: { etat: 'orange', causes: [] } } };
    expect(peutPasserA(orange, 'valide')).toEqual({ ok: true });
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
  it('ne fait pas perdre le statut validé quand le contenu évalué ne change pas', () => {
    const validee = changerStatut(prete(), 'valide', T0);
    const g = deplacerFiche(validee, '2026-10-01T00:00:00.000Z', 'Europe/Paris', T0);
    expect(g.statut).toBe('valide');
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

describe('appliquerEvaluation', () => {
  it('pose le score et les suggestions sans toucher au contenu ni au statut', () => {
    const f = { ...base(), statut: 'brouillon', visuel: 'a1', caption: 'Une caption.' };
    const score = { total: 70, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) };
    const g = appliquerEvaluation(f, {
      score,
      variantes: [{ role: 'engagement', texte: 'V1' }, { role: 'deadpan', texte: 'V2' }],
      suggestions: { accroches: ['A1', 'A2'], hashtags: ['nuit'] },
      recommandations: ['R1', 'R2', 'R3'],
    }, '2026-09-28T09:00:00.000Z');
    expect(g).toMatchObject({ score, statut: 'brouillon', caption: 'Une caption.', maj_le: '2026-09-28T09:00:00.000Z', recommandations: ['R1', 'R2', 'R3'] });
    expect(g.suggestions).toEqual({ accroches: ['A1', 'A2'], hashtags: ['nuit'] });
    expect(aReevaluer(g)).toBe(false);
    expect(peutPasserA(g, 'valide')).toEqual({ ok: true });
  });
});
