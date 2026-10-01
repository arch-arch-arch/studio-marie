import { describe, it, expect, vi, afterEach } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import entree from '../../exemples/entree-veille-fictive.json';
import Anthropic from '@anthropic-ai/sdk';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { lancerVeille, traiterVeille } from '../../serveur/veille.js';

const DIMANCHE_20H = '2026-10-04T18:00:00.000Z'; // dimanche 20 h à Paris
const message = (texte, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: texte }] });
const claudeQui = (...reponses) => {
  const finalMessage = vi.fn();
  for (const r of reponses) finalMessage.mockResolvedValueOnce(r);
  return { messages: { stream: vi.fn(() => ({ finalMessage })) }, _final: finalMessage };
};
function base() {
  const supabase = creerFauxSupabase();
  supabase._lignes.set('profil/courant', { collection: 'profil', id: 'courant', data: { ...fictif, version: 1 } });
  return supabase;
}
let n = 0;
const idAleatoire = () => `v${n++}`;

afterEach(() => { vi.restoreAllMocks(); });

describe('lancerVeille', () => {
  it('construit le bulletin et applique les écritures en une fois', async () => {
    const supabase = base();
    const claude = claudeQui(message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(r.resume).toMatch(/^Bulletin 2026-W41 : \d idée\(s\)/);
    expect(supabase._rpc).toHaveLength(1);
    expect(supabase._rpc[0].nom).toBe('appliquer_veille');
    const ecritures = supabase._rpc[0].args.ecritures;
    expect(ecritures.at(-1)).toMatchObject({ op: 'set', collection: 'bulletins', doc_id: '2026-W41' });
    const appel = claude.messages.stream.mock.calls[0][0];
    expect(appel.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search' }]);
    for (const interdit of ['thinking', 'temperature', 'top_p', 'top_k']) expect(appel).not.toHaveProperty(interdit);
  });

  it('ne tourne pas hors horaire sans forcer, et tourne si on force', async () => {
    const supabase = base();
    const hors = await lancerVeille({ supabase, claude: claudeQui(), maintenant: '2026-10-04T19:10:00.000Z', forcer: false, idAleatoire });
    expect(hors).toEqual({ ok: true, lance: false, resume: 'Veille déjà faite ou hors horaire.' });
    const force = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: '2026-10-04T19:10:00.000Z', forcer: true, idAleatoire });
    expect(force.lance).toBe(true);
  });

  it('épingle les suppressions sur maj_le', async () => {
    const supabase = base();
    const claude1 = claudeQui(message(JSON.stringify(entree)));
    await lancerVeille({ supabase, claude: claude1, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    for (const e of supabase._rpc[0].args.ecritures.filter(x => x.op === 'set')) supabase._lignes.set(`${e.collection}/${e.doc_id}`, { collection: e.collection, id: e.doc_id, data: e.data });
    const avant = new Map(supabase._lignes);
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: true, idAleatoire });
    const suppressions = supabase._rpc[1].args.ecritures.filter(x => x.op === 'delete');
    expect(suppressions.length).toBeGreaterThan(0);
    for (const s of suppressions) expect(s.si_maj_le).toBe(avant.get(`fiches/${s.doc_id}`).data.maj_le);
  });

  it('poursuit une réponse en pause, puis réessaie une fois une entrée invalide', async () => {
    const supabase = base();
    const claude = claudeQui(message('', 'pause_turn'), message(JSON.stringify({ ...entree, idees: [] })), message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(claude.messages.stream).toHaveBeenCalledTimes(3);
  });

  it('n’écrit rien si Claude refuse, répond mal deux fois, ou s’il n’y a pas de profil', async () => {
    const refus = base();
    expect(await lancerVeille({ supabase: refus, claude: claudeQui({ stop_reason: 'refusal', content: [] }), maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).toMatchObject({ ok: false, code: 'refused' });
    const invalide = base();
    const mauvais = message(JSON.stringify({ ...entree, idees: [] }));
    const r = await lancerVeille({ supabase: invalide, claude: claudeQui(mauvais, mauvais), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r).toMatchObject({ ok: false, code: 'invalid_json' });
    expect(r.erreurs.length).toBeGreaterThan(0);
    const vide = creerFauxSupabase();
    expect(await lancerVeille({ supabase: vide, claude: claudeQui(), maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).toMatchObject({ ok: false, code: 'profil_absent' });
    for (const s of [refus, invalide, vide]) expect(s._rpc).toEqual([]);
  });

  it('traite une réponse tronquée comme invalide, même si le JSON est complet', async () => {
    const supabase = base();
    const claude = claudeQui(message(JSON.stringify(entree), 'max_tokens'), message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(claude.messages.stream).toHaveBeenCalledTimes(2);
    const relance = claude.messages.stream.mock.calls[1][0].messages;
    expect(relance.at(-1).content).toContain('Ta réponse n’est pas valide.');

    const tronquee = base();
    const coupee = message(JSON.stringify(entree), 'max_tokens');
    const echec = await lancerVeille({ supabase: tronquee, claude: claudeQui(coupee, coupee), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(echec).toMatchObject({ ok: false, code: 'invalid_json' });
    expect(tronquee._rpc).toEqual([]);
  });

  it('s’arrête sans rien écrire quand le budget de temps est dépassé', async () => {
    const supabase = base();
    let t = 1_000_000;
    const claude = claudeQui();
    claude._final.mockImplementationOnce(async () => { t += 271_000; return message(JSON.stringify({ ...entree, idees: [] })); });
    claude._final.mockResolvedValueOnce(message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire, horloge: () => t, budgetMs: 270_000 });
    expect(r).toEqual({ ok: false, code: 'unavailable' });
    expect(claude.messages.stream).toHaveBeenCalledTimes(1);
    expect(supabase._rpc).toEqual([]);
  });

  it('ne s’arrête pas tant que le budget n’est pas dépassé', async () => {
    const supabase = base();
    const claude = claudeQui(message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire, horloge: () => 0, budgetMs: 270_000 });
    expect(r.ok).toBe(true);
  });
});

describe('lancerVeille : garde-fous', () => {
  const conflit = { op: 'verifier', collection: 'bulletins', doc_id: '2026-W41', champ: 'genere_le' };
  const bulletinExistant = (supabase, genere_le) => supabase._lignes.set('bulletins/2026-W41', { collection: 'bulletins', id: '2026-W41', data: { semaine: '2026-W41', genere_le } });

  it('place la vérification du bulletin en tête des écritures (null si absent)', async () => {
    const supabase = base();
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(supabase._rpc[0].args.ecritures[0]).toEqual({ ...conflit, valeur: null });
  });
  it('épingle la vérification sur le genere_le du bulletin lu au départ', async () => {
    const supabase = base();
    bulletinExistant(supabase, '2026-10-01T10:00:00.000Z');
    const r = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: true, idAleatoire });
    expect(r.ok).toBe(true);
    expect(supabase._rpc[0].args.ecritures[0]).toEqual({ ...conflit, valeur: '2026-10-01T10:00:00.000Z' });
  });
  it('répond conflict et n’écrit rien si une autre veille a écrit le bulletin entre-temps', async () => {
    const supabase = base();
    const claude = claudeQui();
    claude._final.mockImplementationOnce(async () => { bulletinExistant(supabase, '2026-10-04T18:00:05.000Z'); return message(JSON.stringify(entree)); });
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r).toEqual({ ok: false, code: 'conflict' });
    expect(supabase._rpc).toEqual([]);
    expect([...supabase._lignes.keys()].filter(k => k.startsWith('fiches/'))).toEqual([]);
    expect(supabase._lignes.get('bulletins/2026-W41').data.genere_le).toBe('2026-10-04T18:00:05.000Z');
  });
  it('le second de deux lots partis du même état échoue en conflict, sans rien écrire', async () => {
    const supabase = base();
    const r1 = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r1.ok).toBe(true);
    const avant = new Map(supabase._lignes);
    const ecritures = [{ ...conflit, valeur: null }, { op: 'set', collection: 'fiches', doc_id: 'x', data: { a: 1 } }];
    const second = await supabase.rpc('appliquer_veille', { ecritures });
    expect(second.error).toMatchObject({ message: 'veille_conflit', code: 'P0001' });
    expect(new Map(supabase._lignes)).toEqual(avant);
  });

  it('ne lance pas Claude si une veille est en cours depuis moins de 6 minutes', async () => {
    const supabase = base();
    supabase._lignes.set('config/veille_en_cours', { collection: 'config', id: 'veille_en_cours', data: { depuis: '2026-10-04T17:55:00.000Z' } });
    const claude = claudeQui();
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r).toEqual({ ok: true, lance: false, resume: 'Une veille est déjà en cours.' });
    expect(claude.messages.stream).not.toHaveBeenCalled();
    expect(supabase._lignes.get('config/veille_en_cours').data.depuis).toBe('2026-10-04T17:55:00.000Z');
  });
  it('ignore un marqueur de plus de 6 minutes', async () => {
    const supabase = base();
    supabase._lignes.set('config/veille_en_cours', { collection: 'config', id: 'veille_en_cours', data: { depuis: '2026-10-04T17:53:00.000Z' } });
    const r = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(r.lance).toBe(true);
  });
  it('pose le marqueur pendant la veille et le retire après un succès comme après un échec', async () => {
    const supabase = base();
    const claude = claudeQui();
    let pendant = null;
    claude._final.mockImplementationOnce(async () => { pendant = supabase._lignes.get('config/veille_en_cours')?.data; return message(JSON.stringify(entree)); });
    expect((await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).ok).toBe(true);
    expect(pendant).toEqual({ depuis: DIMANCHE_20H });
    expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
    const refus = await lancerVeille({ supabase, claude: claudeQui({ stop_reason: 'refusal', content: [] }), maintenant: DIMANCHE_20H, forcer: true, idAleatoire });
    expect(refus.ok).toBe(false);
    expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
  });
  it('ne pose pas de marqueur hors horaire', async () => {
    const supabase = base();
    await lancerVeille({ supabase, claude: claudeQui(), maintenant: '2026-10-04T19:10:00.000Z', forcer: false, idAleatoire });
    expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
  });
  it('mène la veille à son terme même si le marqueur ne s’écrit ni ne se retire', async () => {
    const supabase = base();
    const reel = supabase.from;
    const panne = { then: (_ok, ko) => ko(new Error('boum')) };
    supabase.from = t => {
      const q = reel(t);
      const upsert = q.upsert;
      q.upsert = l => ([].concat(l)[0]?.collection === 'config' ? panne : upsert(l));
      q.delete = () => ({ eq: () => ({ eq: () => panne }) });
      return q;
    };
    const r = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
  });

  it('passe un signal d’abandon à chaque appel', async () => {
    const supabase = base();
    const claude = claudeQui(message('', 'pause_turn'), message(JSON.stringify(entree)));
    await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(claude.messages.stream).toHaveBeenCalledTimes(2);
    for (const appel of claude.messages.stream.mock.calls) expect(appel[1].signal).toBeInstanceOf(AbortSignal);
  });
  it('borne le signal au budget restant', async () => {
    const supabase = base();
    const espion = vi.spyOn(AbortSignal, 'timeout');
    let t = 0;
    const horloge = () => { t += 10_000; return t; };
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire, horloge, budgetMs: 100_000 });
    expect(espion).toHaveBeenCalledTimes(1);
    expect(espion.mock.calls[0][0]).toBeGreaterThan(0);
    expect(espion.mock.calls[0][0]).toBeLessThan(100_000);
  });
  it('un abandon (erreur du SDK ou AbortError) donne unavailable sans rien écrire', async () => {
    for (const erreurAbandon of [new Anthropic.APIUserAbortError(), Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), Object.assign(new Error('timeout'), { name: 'TimeoutError' })]) {
      const supabase = base();
      const claude = claudeQui();
      claude._final.mockRejectedValueOnce(erreurAbandon);
      expect(await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).toEqual({ ok: false, code: 'unavailable' });
      expect(supabase._rpc).toEqual([]);
      expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
    }
  });

  it('après une pause puis une réponse invalide, repart de tout l’historique', async () => {
    const supabase = base();
    const pause = { stop_reason: 'pause_turn', content: [{ type: 'text', text: 'SEGMENT-PAUSE' }] };
    const invalide = message(JSON.stringify({ ...entree, idees: [] }));
    const claude = claudeQui(pause, invalide, message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    const troisieme = claude.messages.stream.mock.calls[2][0].messages;
    expect(troisieme.map(m => m.role)).toEqual(['user', 'assistant', 'assistant', 'user']);
    expect(troisieme[1].content).toEqual(pause.content);
    expect(troisieme[2].content).toEqual(invalide.content);
    expect(troisieme[3].content).toContain('Ta réponse n’est pas valide.');
  });
  it('lit le JSON dans le texte de tous les segments de l’essai', async () => {
    const supabase = base();
    const json = JSON.stringify(entree);
    const moitie = Math.floor(json.length / 2);
    const claude = claudeQui(
      { stop_reason: 'pause_turn', content: [{ type: 'text', text: json.slice(0, moitie) }] },
      message(json.slice(moitie)),
    );
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(claude.messages.stream).toHaveBeenCalledTimes(2);
  });

  it('n’émet pas la suppression d’une fiche dont le maj_le est absent', async () => {
    const supabase = base();
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    const ids = [...supabase._lignes.keys()].filter(k => k.startsWith('fiches/'));
    expect(ids.length).toBeGreaterThan(1);
    const [sans, ...autres] = ids;
    const data = { ...supabase._lignes.get(sans).data };
    delete data.maj_le; delete data.cree_le;
    supabase._lignes.set(sans, { ...supabase._lignes.get(sans), data });
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: true, idAleatoire });
    const suppressions = supabase._rpc[1].args.ecritures.filter(x => x.op === 'delete');
    expect(suppressions.map(s => `fiches/${s.doc_id}`)).not.toContain(sans);
    expect(suppressions.map(s => `fiches/${s.doc_id}`).sort()).toEqual(autres.sort());
    for (const s of suppressions) expect(s.si_maj_le).toBeTruthy();
  });
});

describe('traiterVeille', () => {
  const env = { ANTHROPIC_API_KEY: 'x', CRON_SECRET: 'secret-cron' };
  const deps = extra => ({ env, supabaseSession: creerFauxSupabase(), supabaseService: base(), claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, idAleatoire, ...extra });
  it('la tâche planifiée exige le secret', async () => {
    expect((await traiterVeille({ methode: 'GET', autorisation: 'Bearer faux', ...deps() })).statut).toBe(401);
    expect((await traiterVeille({ methode: 'GET', autorisation: undefined, ...deps({ env: { ANTHROPIC_API_KEY: 'x' } }) })).statut).toBe(401);
    const ok = await traiterVeille({ methode: 'GET', autorisation: 'Bearer secret-cron', ...deps() });
    expect(ok.statut).toBe(200);
    expect(ok.corps.lance).toBe(true);
  });
  it('compare le secret en entier : préfixe, suffixe et longueurs différentes sont refusés', async () => {
    for (const faux of ['Bearer secret-cro', 'Bearer secret-cron2', 'Bearer ', 'Bearer secret-cronx', 'secret-cron', 'Bearer SECRET-CRON']) {
      expect((await traiterVeille({ methode: 'GET', autorisation: faux, ...deps() })).statut).toBe(401);
    }
    expect((await traiterVeille({ methode: 'GET', autorisation: 'Bearer ', ...deps({ env: { ...env, CRON_SECRET: '' } }) })).statut).toBe(401);
  });
  it('la relance exige une session et force l’exécution', async () => {
    expect((await traiterVeille({ methode: 'POST', autorisation: 'Bearer faux', ...deps() })).statut).toBe(401);
    const r = await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...deps({ maintenant: '2026-10-07T10:00:00.000Z' }) });
    expect(r.statut).toBe(200);
    expect(r.corps.lance).toBe(true);
  });
  it('répond not_granted sans clé, et 405 pour une autre méthode', async () => {
    const sans = deps({ env: { CRON_SECRET: 'secret-cron' } });
    expect(await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...sans })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(sans.supabaseService._rpc).toEqual([]);
    expect((await traiterVeille({ methode: 'PUT', autorisation: 'Bearer jeton-test', ...deps() })).statut).toBe(405);
  });
  it('répond not_granted sans clé de service, sans rien appeler', async () => {
    const claude = claudeQui(message(JSON.stringify(entree)));
    const d = deps({ supabaseService: null, claude });
    expect(await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...d })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(await traiterVeille({ methode: 'GET', autorisation: 'Bearer secret-cron', ...d })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(claude.messages.stream).not.toHaveBeenCalled();
  });
  it('journalise une seule ligne avec le code, sans prompt, réponse ni secret', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secrets = message('SECRET-REPONSE pas du json');
    const r = await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...deps({ claude: claudeQui(secrets, secrets) }) });
    expect(r.statut).toBe(422);
    expect(r.corps.code).toBe('invalid_json');
    expect(espion).toHaveBeenCalledTimes(1);
    expect(espion.mock.calls[0]).toEqual(['[veille]', 422, 'invalid_json']);
    const tout = JSON.stringify(espion.mock.calls);
    for (const interdit of ['SECRET', 'secret-cron', 'jeton-test', 'Tu prépares']) expect(tout).not.toContain(interdit);
  });
  it('répond 409 pour un profil absent ou un conflit, en journalisant le code', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    const absent = await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...deps({ supabaseService: creerFauxSupabase() }) });
    expect(absent).toMatchObject({ statut: 409, corps: { ok: false, code: 'profil_absent' } });
    const service = base();
    const claude = claudeQui();
    claude._final.mockImplementationOnce(async () => { service._lignes.set('bulletins/2026-W41', { collection: 'bulletins', id: '2026-W41', data: { genere_le: 'autre' } }); return message(JSON.stringify(entree)); });
    const conflit = await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...deps({ supabaseService: service, claude }) });
    expect(conflit).toMatchObject({ statut: 409, corps: { code: 'conflict' } });
    expect(espion.mock.calls).toEqual([['[veille]', 409, 'profil_absent'], ['[veille]', 409, 'conflict']]);
  });
  it('ne journalise rien en cas de succès', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    await traiterVeille({ methode: 'GET', autorisation: 'Bearer secret-cron', ...deps() });
    expect(espion).not.toHaveBeenCalled();
  });
});
