import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import {
  FORMATS, STATUTS, nouvelId, nouvelleFiche, empreinte, aReevaluer, modifierFiche, peutPasserA,
  changerStatut, deplacerFiche, analyserHashtags, formaterHashtags, texteAPublier, appliquerEvaluation,
  datePublication, effacementsPour, confirmerProgrammation, confirmerPublication, avertissementsFiche,
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
  it('couvre le format, le pilier, le rôle, le cta, le geotag et la porte, mais pas la date ni le statut', () => {
    const f = base();
    expect(empreinte({ ...f, format: 'post' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, pilier: 'autre' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, role_caption: 'cta' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, cta: true })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, geotag: 'Paris' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, porte: true })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, date_heure: '2026-10-01T00:00:00.000Z' })).toBe(empreinte(f));
    expect(empreinte({ ...f, statut: 'brouillon' })).toBe(empreinte(f));
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
  it('garde le statut quand le contenu évalué change, sans repasser en brouillon', () => {
    const validee = changerStatut(prete(), 'valide', T0);
    expect(modifierFiche(validee, { caption: 'autre' }, T0).statut).toBe('valide');
    expect(modifierFiche(validee, { geotag: 'Paris' }, T0).statut).toBe('valide');
    expect(modifierFiche(validee, { porte: true }, T0).statut).toBe('valide');
    const publiee = changerStatut(validee, 'publie', T0);
    expect(modifierFiche(publiee, { caption: 'autre' }, T0).statut).toBe('publie');
  });
});

describe('statuts', () => {
  it('laisse passer librement entre idée et brouillon', () => {
    expect(peutPasserA(base(), 'brouillon')).toEqual({ ok: true });
    expect(peutPasserA(base(), 'idee')).toEqual({ ok: true });
  });
  it('accepte Validé, Programmé et Publié sans visuel, caption, score, conformité verte ni analyse à jour', () => {
    expect(peutPasserA(base(), 'valide')).toEqual({ ok: true });
    expect(peutPasserA({ ...base(), visuel: 'a1' }, 'valide')).toEqual({ ok: true });
    expect(peutPasserA({ ...base(), format: 'story', visuel: 'a1' }, 'valide')).toEqual({ ok: true });
    const rouge = { ...prete(), score: { ...prete().score, conformite: { etat: 'rouge', causes: ['mot « mindset »'] } } };
    expect(peutPasserA(rouge, 'programme')).toEqual({ ok: true });
    expect(peutPasserA({ ...prete(), caption: 'modifiée' }, 'valide')).toEqual({ ok: true });
    expect(peutPasserA(prete(), 'publie')).toEqual({ ok: true });
  });
  it('refuse un statut inconnu', () => {
    expect(peutPasserA(base(), 'archive')).toEqual({ ok: false, raison: 'Statut inconnu : archive' });
  });
  it('accepte une conformité non évaluée ou orange', () => {
    const sansConformite = { ...prete(), score: { ...prete().score, conformite: {} } };
    expect(peutPasserA(sansConformite, 'valide')).toEqual({ ok: true });
    const orange = { ...prete(), score: { ...prete().score, conformite: { etat: 'orange', causes: [] } } };
    expect(peutPasserA(orange, 'valide')).toEqual({ ok: true });
  });
  it('changerStatut passe à Validé sans condition, et lève seulement pour un statut inconnu', () => {
    expect(changerStatut(base(), 'brouillon', T0).statut).toBe('brouillon');
    expect(changerStatut(base(), 'valide', T0).statut).toBe('valide');
    expect(() => changerStatut(base(), 'archive', T0)).toThrow('Statut inconnu : archive');
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

  it('garde le statut validé quand la conformité redevient rouge', () => {
    const validee = changerStatut(prete(), 'valide', T0);
    const score = { total: 40, criteres: [], conformite: { etat: 'rouge', causes: ['x'] }, empreinte: empreinte(validee) };
    const g = appliquerEvaluation(validee, {
      score, variantes: [], suggestions: { accroches: [], hashtags: [] }, recommandations: ['R1', 'R2', 'R3'],
    }, '2026-09-28T09:00:00.000Z');
    expect(g.statut).toBe('valide');
  });

  it('garde le statut publié même si la conformité redevient rouge', () => {
    const publiee = changerStatut(changerStatut(prete(), 'valide', T0), 'publie', T0);
    const score = { total: 40, criteres: [], conformite: { etat: 'rouge', causes: ['x'] }, empreinte: empreinte(publiee) };
    const g = appliquerEvaluation(publiee, {
      score, variantes: [], suggestions: { accroches: [], hashtags: [] }, recommandations: ['R1', 'R2', 'R3'],
    }, '2026-09-28T09:00:00.000Z');
    expect(g.statut).toBe('publie');
  });
});

describe('confirmations', () => {
  const M = '2026-09-28T08:00:00.000Z';
  const validee = () => changerStatut(prete(), 'valide', T0);

  it('nouvelleFiche prévoit les deux champs', () => {
    expect(base()).toMatchObject({ programme_pour: null, publie_le: null });
  });

  it('confirme la programmation et aligne la date', () => {
    const r = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M);
    expect(r.ok).toBe(true);
    expect(r.fiche).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-01T10:00:00.000Z', publie_le: null, maj_le: M });
  });

  it('normalise la date confirmée en ISO UTC', () => {
    const r = confirmerProgrammation(validee(), { date: '2026-10-01T12:00:00+02:00', coche: true }, M);
    expect(r.fiche.programme_pour).toBe('2026-10-01T10:00:00.000Z');
  });

  it('refuse sans case cochée, sans date valide, ou dans le passé', () => {
    expect(confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: false }, M)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
    expect(confirmerProgrammation(validee(), { date: '', coche: true }, M)).toEqual({ ok: false, raison: 'Indique une date et une heure valides.' });
    expect(confirmerProgrammation(validee(), { date: '2026-09-28T07:59:00.000Z', coche: true }, M))
      .toEqual({ ok: false, raison: 'Choisis une date à venir : Meta Business Suite ne programme pas dans le passé.' });
  });

  it('programme une fiche sans visuel ni analyse : la validation est libre', () => {
    expect(confirmerProgrammation(base(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M))
      .toMatchObject({ ok: true, fiche: { statut: 'programme' } });
  });

  it('refuse de programmer une fiche déjà publiée', () => {
    const publiee = confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: true }, M).fiche;
    expect(confirmerProgrammation(publiee, { date: '2026-10-01T10:00:00.000Z', coche: true }, M)).toEqual({ ok: false, raison: 'Cette fiche est déjà publiée.' });
  });

  it('confirme la publication, y compris directement depuis Validé', () => {
    const r = confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: true }, M);
    expect(r.fiche).toMatchObject({ statut: 'publie', publie_le: '2026-09-28T07:00:00.000Z', date_heure: '2026-09-28T07:00:00.000Z', programme_pour: null });
  });

  it('garde la programmation confirmée au moment de la publication', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-09-28T09:00:00.000Z', coche: true }, M).fiche;
    const pub = confirmerPublication(prog, { date: '2026-09-28T09:00:00.000Z', coche: true }, '2026-09-28T09:30:00.000Z').fiche;
    expect(pub).toMatchObject({ statut: 'publie', programme_pour: '2026-09-28T09:00:00.000Z', publie_le: '2026-09-28T09:00:00.000Z' });
  });

  it('tolère 5 minutes d’avance pour la publication, pas plus', () => {
    expect(confirmerPublication(validee(), { date: '2026-09-28T08:05:00.000Z', coche: true }, M).ok).toBe(true);
    expect(confirmerPublication(validee(), { date: '2026-09-28T08:06:00.000Z', coche: true }, M))
      .toEqual({ ok: false, raison: 'La date de publication ne peut pas être dans le futur.' });
    expect(confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: false }, M)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
  });

  it('efface les confirmations en revenant en arrière', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    expect(changerStatut(prog, 'valide', M)).toMatchObject({ statut: 'valide', programme_pour: null, publie_le: null });
    const pub = confirmerPublication(prog, { date: '2026-09-28T07:00:00.000Z', coche: true }, M).fiche;
    expect(changerStatut(pub, 'programme', M)).toMatchObject({ statut: 'programme', publie_le: null, programme_pour: '2026-10-01T10:00:00.000Z' });
    expect(effacementsPour('brouillon')).toEqual({ programme_pour: null, publie_le: null });
    expect(effacementsPour('publie')).toEqual({});
  });

  it('garde la programmation quand une modification change le contenu', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    expect(modifierFiche(prog, { caption: 'autre' }, M)).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z' });
  });

  it('déplacer une fiche programmée garde son statut et sa programmation', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    const g = deplacerFiche(prog, '2026-10-02T10:00:00.000Z', 'Europe/Paris', M);
    expect(g).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-02T10:00:00.000Z' });
  });

  it('protège les deux champs de confirmation', () => {
    expect(() => modifierFiche(base(), { programme_pour: 'x' }, M)).toThrow('Champ protégé : programme_pour');
    expect(() => modifierFiche(base(), { publie_le: 'x' }, M)).toThrow('Champ protégé : publie_le');
  });

  it('datePublication préfère la date réelle', () => {
    expect(datePublication({ date_heure: 'a', publie_le: 'b' })).toBe('b');
    expect(datePublication({ date_heure: 'a', publie_le: null })).toBe('a');
    expect(datePublication({ date_heure: 'a' })).toBe('a');
  });
});

describe('catégorie de fiche', () => {
  it('nouvelleFiche : categorie et categorie_proposee à null', () => {
    const f = base();
    expect(f.categorie).toBeNull();
    expect(f.categorie_proposee).toBeNull();
  });

  it('empreinte inchangée quand seule la catégorie change', () => {
    const f = { ...base(), visuel: 'a1', caption: 'Une caption.' };
    expect(empreinte({ ...f, categorie: 'desir' })).toBe(empreinte(f));
  });
});

describe('validation libre', () => {
  const R = fictif.regles_studio;
  const T1 = '2026-09-27T20:00:00.000Z';
  const M = '2026-09-28T08:00:00.000Z';
  const analysee = f => ({ ...f, score: { total: 50, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } });
  const rouge = () => {
    const f = { ...base(), visuel: 'a1', caption: 'Une caption.' };
    return { ...f, score: { total: 40, criteres: [], conformite: { etat: 'rouge', causes: ['mot « mindset »'] }, empreinte: empreinte(f) } };
  };
  const validee = () => changerStatut(prete(), 'valide', T1);

  it('modifierFiche ne change pas le statut validé, ni la programmation', () => {
    expect(modifierFiche(validee(), { accroche: 'Nouvelle accroche' }, M).statut).toBe('valide');
    const programmee = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    expect(modifierFiche(programmee, { accroche: 'Nouvelle accroche' }, M)).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z' });
  });

  it('appliquerEvaluation avec un score rouge ne change pas le statut programmé', () => {
    const programmee = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    const score = { total: 40, criteres: [], conformite: { etat: 'rouge', causes: ['x'] }, empreinte: empreinte(programmee) };
    const g = appliquerEvaluation(programmee, { score, variantes: [], suggestions: { accroches: [], hashtags: [] }, recommandations: [] }, M);
    expect(g).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z' });
  });

  it('avertissementsFiche : fiche vide, sans caption pour une story', () => {
    expect(avertissementsFiche(base(), R)).toEqual(['Pas de visuel', 'Pas de caption', 'Pas encore analysée']);
    expect(avertissementsFiche({ ...base(), format: 'story' }, R)).toEqual(['Pas de visuel', 'Pas encore analysée']);
  });

  it('avertissementsFiche : fiche complète et analysée, aucun avertissement', () => {
    expect(avertissementsFiche(prete(), R)).toEqual([]);
  });

  it('avertissementsFiche : un mot à éviter donne sa cause exacte', () => {
    expect(avertissementsFiche(analysee({ ...base(), visuel: 'a1', caption: 'Le mindset du jour.' }), { ...R, mots_a_eviter: ['mindset'] }))
      .toEqual(['mot à éviter « mindset »']);
  });

  it('avertissementsFiche : conformité rouge sans cause affichée, ni jugée ni calculée, le dit', () => {
    const f = analysee(prete());
    f.score.conformite = { etat: 'rouge', causes: [] };
    expect(avertissementsFiche(f, R)).toEqual(['Conformité jugée rouge par l’analyse']);
  });

  it('avertissementsFiche : conformité rouge avec une cause calculée affichée, sans message de plus', () => {
    const f = analysee({ ...base(), visuel: 'a1', caption: 'Le mindset du jour.' });
    f.score.conformite = { etat: 'rouge', causes: [] };
    expect(avertissementsFiche(f, { ...R, mots_a_eviter: ['mindset'] })).toEqual(['mot à éviter « mindset »']);
  });

  it('avertissementsFiche : une analyse dépassée le signale', () => {
    expect(avertissementsFiche({ ...prete(), caption: 'modifiée' }, R)).toEqual(['Analyse dépassée : la fiche a changé depuis']);
  });
});

describe('avertissementsFiche : sans règles, analyse rouge, ordre', () => {
  const R = fictif.regles_studio;
  const avec = (f, causes) => ({ ...f, score: { total: 50, criteres: [], conformite: { etat: causes.length ? 'rouge' : 'vert', causes }, empreinte: empreinte(f) } });

  it('sans règles, ne lève pas et rend les autres avertissements', () => {
    expect(() => avertissementsFiche(base())).not.toThrow();
    expect(avertissementsFiche(base())).toEqual(['Pas de visuel', 'Pas de caption', 'Pas encore analysée']);
  });

  it('une cause jugée rouge par l’analyse seule donne un avertissement', () => {
    const f = avec({ ...base(), visuel: 'a1', caption: 'Texte.' }, ['groupe visé']);
    expect(avertissementsFiche(f, R)).toEqual(['Conformité jugée rouge par l’analyse : groupe visé']);
  });

  it('une cause du score déjà calculée ne se répète pas', () => {
    const f = avec({ ...base(), visuel: 'a1', caption: 'Le mindset du jour.' }, ['mot à éviter « mindset »']);
    expect(avertissementsFiche(f, R)).toEqual(['mot à éviter « mindset »']);
  });

  it('ordre : visuel, caption, cause calculée, puis pas encore analysée', () => {
    expect(avertissementsFiche({ ...base(), accroche: 'Le mindset.' }, R))
      .toEqual(['Pas de visuel', 'Pas de caption', 'mot à éviter « mindset »', 'Pas encore analysée']);
  });

  it('ordre : cause calculée, puis analyse dépassée', () => {
    const f = { ...avec({ ...base(), visuel: 'a1', caption: 'Le mindset.' }, []), caption: 'Le mindset du soir.' };
    expect(avertissementsFiche(f, R)).toEqual(['mot à éviter « mindset »', 'Analyse dépassée : la fiche a changé depuis']);
  });
});
