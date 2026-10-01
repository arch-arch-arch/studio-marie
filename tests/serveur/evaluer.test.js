import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import Anthropic from '@anthropic-ai/sdk';
import { traiterEvaluation } from '../../serveur/evaluer.js';
import { traiterCapacites } from '../../serveur/capacites.js';

const OK = 'Bearer jeton-test';
const claude = reponse => ({ messages: { create: vi.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reponse) }] })) } });

describe('traiterCapacites', () => {
  it('exige une session et reflète la présence de la clé', async () => {
    const supabase = creerFauxSupabase();
    expect((await traiterCapacites({ env: {}, autorisation: undefined, supabase })).statut).toBe(401);
    expect(await traiterCapacites({ env: {}, autorisation: OK, supabase })).toEqual({ statut: 200, corps: { evaluation: false, veille: false } });
    expect(await traiterCapacites({ env: { ANTHROPIC_API_KEY: 'x' }, autorisation: OK, supabase })).toEqual({ statut: 200, corps: { evaluation: true, veille: true } });
  });
});

describe('traiterEvaluation', () => {
  const base = { env: { ANTHROPIC_API_KEY: 'x' }, autorisation: OK, corps: { prompt: 'Évalue.' } };
  it('refuse sans session, sans appeler Claude', async () => {
    const c = claude({});
    const r = await traiterEvaluation({ ...base, autorisation: 'Bearer faux', supabase: creerFauxSupabase(), claude: c });
    expect(r).toEqual({ statut: 401, corps: { code: 'session_expired' } });
    expect(c.messages.create).not.toHaveBeenCalled();
  });
  it('répond not_granted sans clé', async () => {
    const c = claude({});
    expect(await traiterEvaluation({ ...base, env: {}, supabase: creerFauxSupabase(), claude: c })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(c.messages.create).not.toHaveBeenCalled();
  });
  it('valide le corps de la requête', async () => {
    const supabase = creerFauxSupabase();
    for (const corps of [null, {}, { prompt: '' }, { prompt: 3 }, { prompt: 'x', image: { media_type: 'application/pdf', data: 'QQ==' } }, { prompt: 'x', image: { media_type: 'image/png' } }]) {
      expect(await traiterEvaluation({ ...base, corps, supabase, claude: claude({}) })).toEqual({ statut: 400, corps: { code: 'invalid_request' } });
    }
    expect(await traiterEvaluation({ ...base, corps: { prompt: 'x'.repeat(70000) }, supabase, claude: claude({}) })).toEqual({ statut: 413, corps: { code: 'prompt_too_large' } });
  });
  it('renvoie la réponse de Claude', async () => {
    const r = await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: claude({ notes: { accroche: 8 } }) });
    expect(r).toEqual({ statut: 200, corps: { reponse: { notes: { accroche: 8 } } } });
  });
  it('traduit les échecs de Claude', async () => {
    const refus = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
    expect(await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: refus })).toEqual({ statut: 502, corps: { code: 'refused' } });
    const illisible = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'non' }] }) } };
    expect(await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: illisible })).toEqual({ statut: 502, corps: { code: 'invalid_json' } });
  });
  const api400 = () => ({ messages: { create: async () => { throw new Anthropic.APIError(400, { type: 'error' }, 'erreur', new Headers()); } } });
  it('distingue un visuel refusé, sans appeler Claude', async () => {
    const supabase = creerFauxSupabase();
    for (const data of ['pas du base64 !', 'QUJD'.repeat(1000001), 'QQ=A']) {
      const c = claude({});
      expect(await traiterEvaluation({ ...base, corps: { prompt: 'x', image: { media_type: 'image/png', data } }, supabase, claude: c })).toEqual({ statut: 400, corps: { code: 'image_rejected' } });
      expect(c.messages.create).not.toHaveBeenCalled();
    }
  });
  it('traduit un 400 de Claude selon la présence d’un visuel', async () => {
    const supabase = creerFauxSupabase();
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    const avec = { prompt: 'x', image: { media_type: 'image/png', data: 'QUJD' } };
    expect(await traiterEvaluation({ ...base, corps: avec, supabase, claude: api400() })).toEqual({ statut: 502, corps: { code: 'image_rejected' } });
    expect(await traiterEvaluation({ ...base, supabase, claude: api400() })).toEqual({ statut: 502, corps: { code: 'invalid_request' } });
    espion.mockRestore();
  });
  it('répond empty_completion pour une réponse tronquée', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tronque = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a":1}' }] }) } };
    expect(await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: tronque })).toEqual({ statut: 502, corps: { code: 'empty_completion' } });
    espion.mockRestore();
  });
  it('vérifie la session avant de lire le corps brut', async () => {
    const c = claude({});
    expect(await traiterEvaluation({ ...base, corps: '{mal', autorisation: 'Bearer faux', supabase: creerFauxSupabase(), claude: c })).toEqual({ statut: 401, corps: { code: 'session_expired' } });
    expect(await traiterEvaluation({ ...base, corps: '{mal', supabase: creerFauxSupabase(), claude: c })).toEqual({ statut: 400, corps: { code: 'invalid_request' } });
    expect(c.messages.create).not.toHaveBeenCalled();
    expect(await traiterEvaluation({ ...base, corps: '{"prompt":"Évalue."}', supabase: creerFauxSupabase(), claude: claude({ notes: {} }) })).toEqual({ statut: 200, corps: { reponse: { notes: {} } } });
  });
  it('ne journalise ni le prompt, ni l’image, ni le jeton', async () => {
    const espions = ['error', 'log', 'warn'].map(n => vi.spyOn(console, n).mockImplementation(() => {}));
    const echec = { messages: { create: async () => { throw Object.assign(new Error('SECRET-PROMPT SECRET-IMAGE SECRET-JETON'), { status: 500 }); } } };
    const r = await traiterEvaluation({ ...base, corps: { prompt: 'SECRET-PROMPT', image: { media_type: 'image/png', data: 'U0VDUkVU' } }, autorisation: OK, supabase: creerFauxSupabase(), claude: echec });
    expect(r).toEqual({ statut: 502, corps: { code: 'unavailable' } });
    const ecrit = JSON.stringify(espions.flatMap(e => e.mock.calls));
    for (const secret of ['SECRET', 'U0VDUkVU', 'jeton-test']) expect(ecrit).not.toContain(secret);
    expect(espions[0]).toHaveBeenCalledTimes(1);
    espions.forEach(e => e.mockRestore());
  });
});
