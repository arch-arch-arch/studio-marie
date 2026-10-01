import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { traiterCapacites, traiterEvaluation } from '../../serveur/evaluer.js';

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
});
