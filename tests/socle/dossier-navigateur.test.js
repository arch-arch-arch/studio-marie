import { describe, it, expect, vi } from 'vitest';
import { creerDossierNavigateur } from '../../src/socle/dossier-navigateur.js';

const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
class FauxFichier extends Blob { constructor(parts, nom, options) { super(parts, options); this.name = nom; } }

describe('creerDossierNavigateur', () => {
  it('charge la fabrique une seule fois', async () => {
    const charger = vi.fn(async () => ({ preparerCartes: () => {}, assemblerPdf: () => {} }));
    const d = creerDossierNavigateur({ charger, navigator: {}, File: FauxFichier });
    const a = await d.fabrique();
    expect(await d.fabrique()).toBe(a);
    expect(charger).toHaveBeenCalledTimes(1);
  });
  it('rend la même fabrique à des appels simultanés', async () => {
    const charger = vi.fn(async () => ({}));
    const d = creerDossierNavigateur({ charger, navigator: {}, File: FauxFichier });
    const [a, b] = await Promise.all([d.fabrique(), d.fabrique()]);
    expect(a).toBe(b);
    expect(charger).toHaveBeenCalledTimes(1);
  });
  it('ne mémorise pas un échec de chargement : l’appel suivant réessaie', async () => {
    const fabrique = { preparerCartes: () => {}, assemblerPdf: () => {} };
    const charger = vi.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(fabrique);
    const d = creerDossierNavigateur({ charger, navigator: {}, File: FauxFichier });
    await expect(d.fabrique()).rejects.toThrow('réseau');
    expect(await d.fabrique()).toBe(fabrique);
    expect(await d.fabrique()).toBe(fabrique);
    expect(charger).toHaveBeenCalledTimes(2);
  });
  it('partage un fichier quand l’appareil le permet', async () => {
    const navigator = { canShare: vi.fn(({ files }) => files.length === 1), share: vi.fn(async () => {}) };
    const d = creerDossierNavigateur({ charger: vi.fn(), navigator, File: FauxFichier });
    expect(d.peutPartager(pdf)).toBe(true);
    await d.partager(pdf, 'analyse-2026-W41.pdf');
    const { files } = navigator.share.mock.calls[0][0];
    expect(files[0].name).toBe('analyse-2026-W41.pdf');
    expect(files[0].type).toBe('application/pdf');
    expect(Object.keys(navigator.share.mock.calls[0][0])).toEqual(['files']);
  });
  it('dit non sans partage de fichiers', () => {
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: {}, File: FauxFichier }).peutPartager(pdf)).toBe(false);
    const refuse = { canShare: () => false, share: vi.fn() };
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: refuse, File: FauxFichier }).peutPartager(pdf)).toBe(false);
    const leve = { canShare: () => { throw new Error('x'); }, share: vi.fn() };
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: leve, File: FauxFichier }).peutPartager(pdf)).toBe(false);
  });
  it('copie un texte, ou rejette sans presse-papiers', async () => {
    const navigator = { clipboard: { writeText: vi.fn(async () => {}) } };
    await creerDossierNavigateur({ charger: vi.fn(), navigator, File: FauxFichier }).copier('Bonjour');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bonjour');
    await expect(creerDossierNavigateur({ charger: vi.fn(), navigator: {}, File: FauxFichier }).copier('x')).rejects.toThrow();
  });
});
