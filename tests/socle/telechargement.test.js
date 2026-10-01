// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { creerTelechargement } from '../../src/socle/telechargement.js';

describe('creerTelechargement', () => {
  it('déclenche le téléchargement d’un fichier et diffère la révocation', async () => {
    vi.useFakeTimers();
    const creer = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoquer = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clics = [];
    const origine = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clics.push([this.download, this.href]); };
    try {
      const r = await creerTelechargement(document).save({ filename: 'studio-contenu-2026-10-01.json', data: '{"a":1}' });
      expect(r).toEqual({ status: 'saved' });
      expect(clics).toEqual([['studio-contenu-2026-10-01.json', 'blob:test']]);
      expect(creer).toHaveBeenCalledTimes(1);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revoquer).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10000);
      expect(revoquer).toHaveBeenCalledWith('blob:test');
    } finally {
      HTMLAnchorElement.prototype.click = origine;
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
  it('refuse un contenu vide', async () => {
    await expect(creerTelechargement(document).save({ filename: 'x.json', data: '' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});
