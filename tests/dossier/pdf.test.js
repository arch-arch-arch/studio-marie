import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { assemblerPdf } from '../../src/dossier/pdf.js';

// Plus petit JPEG valide (1 × 1 pixel).
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k='), c => c.charCodeAt(0));
const contenu = n => ({
  titre: "Dossier d'analyse : semaine du 5 au 11 octobre 2026",
  intro: 'Dossier D-abc123. Introduction.',
  strategie: [{ titre: 'ton et voix', lignes: Array.from({ length: 120 }, (_, i) => `- ligne ${i} avec des accents éèàç et un texte assez long pour devoir passer à la ligne suivante sans déborder de la page`) }],
  sectionsProfil: ['ton_et_voix'],
  regles: ['Semaine 2026-W41 :', '- Reels : 1/4 (rouge)'],
  fiches: Array.from({ length: n }, (_, i) => ({ ref: `F0${i + 1}`, etiquette: `F0${i + 1} · lun. 05/10 · Reel`, lignes: [`<fiche id="F0${i + 1}">`, 'accroche : Test [U+1F525]', '</fiche>'] })),
  consigne: ['Consigne.', '{', '  "dossier": "D-abc123"', '}'],
});
const brut = async blob => new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
const pages = texte => (texte.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

// JPEG valide de taille voulue : des commentaires (COM) insérés après l'en-tête JFIF.
function jpegDeTaille(octets, graine = 0) {
  const morceaux = [JPEG.slice(0, 20)];
  let reste = octets - JPEG.length;
  while (reste > 4) {
    const n = Math.min(reste - 4, 60000);
    const seg = new Uint8Array(n + 4);
    seg.set([0xff, 0xfe, ((n + 2) >> 8) & 255, (n + 2) & 255]);
    seg.fill(graine, 4);
    morceaux.push(seg);
    reste -= n + 4;
  }
  morceaux.push(JPEG.slice(20));
  return new Blob(morceaux, { type: 'image/jpeg' });
}

describe('assemblerPdf', () => {
  it('produit un PDF avec la stratégie, une page par fiche et la consigne', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob([JPEG], { type: 'image/jpeg' }), largeur: 1, hauteur: 1 }], ['F02', { ok: false }]]);
    const blob = await assemblerPdf(contenu(2), cartes, { jsPDF });
    expect(blob.type).toBe('application/pdf');
    const octets = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...octets.slice(0, 5))).toBe('%PDF-');
    const texte = new TextDecoder('latin1').decode(octets);
    expect(pages(texte)).toBeGreaterThanOrEqual(5);
    expect(texte).toContain('/Subtype /Image');
  });
  it('ne lève pas sur un texte vide ou une carte illisible', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob(['pas une image'], { type: 'image/jpeg' }), largeur: 10, hauteur: 10 }]]);
    const vide = { ...contenu(1), strategie: [], regles: [] };
    await expect(assemblerPdf(vide, cartes, { jsPDF })).resolves.toBeInstanceOf(Blob);
  });
  it('écrit les caractères Latin-1 accentués tels quels avec la police standard', async () => {
    const c = { ...contenu(1), titre: 'éèàç « guillemets » Ça', strategie: [], regles: [] };
    const texte = await brut(await assemblerPdf(c, new Map(), { jsPDF, compress: false }));
    expect(texte).toContain('(éèàç « guillemets » Ça)');
    expect(texte).toContain('/Encoding /WinAnsiEncoding');
  });
  it('note « (visuel illisible) » dans la fiche quand l’image est abîmée, et garde son texte', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob(['pas une image'], { type: 'image/jpeg' }), largeur: 10, hauteur: 10 }]]);
    const texte = await brut(await assemblerPdf(contenu(1), cartes, { jsPDF, compress: false }));
    expect(texte).toContain(String.raw`\(visuel illisible\)`);
    expect(texte).toContain('accroche : Test [U+1F525]');
    expect(texte).not.toContain('/Subtype /Image');
  });
  it('note aussi « (visuel illisible) » pour un JPEG tronqué sans dimensions', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob([JPEG.slice(0, 24)], { type: 'image/jpeg' }), largeur: 10, hauteur: 10 }]]);
    const texte = await brut(await assemblerPdf(contenu(1), cartes, { jsPDF, compress: false }));
    expect(texte).toContain(String.raw`\(visuel illisible\)`);
    expect(texte).not.toContain('/Subtype /Image');
  });
  it('ne note pas « visuel illisible » quand l’image est bonne', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob([JPEG], { type: 'image/jpeg' }), largeur: 1, hauteur: 1 }]]);
    const texte = await brut(await assemblerPdf(contenu(1), cartes, { jsPDF, compress: false }));
    expect(texte).toContain('/Subtype /Image');
    expect(texte).toContain('accroche : Test [U+1F525]');
    expect(texte).not.toContain(String.raw`\(visuel illisible\)`);
  });
  it('coupe une ligne sans espace plus large que la page', async () => {
    const adresse = `https://exemple.test/${'a'.repeat(400)}`;
    const c = { ...contenu(1), strategie: [{ titre: 'x', lignes: [adresse, `#${'mot'.repeat(150)}`] }] };
    const textes = [];
    // jsPDF pose ses méthodes sur l'instance : on enveloppe `text` pour relever chaque ligne écrite.
    function Espion(options) {
      const pdf = new jsPDF(options);
      const texte = pdf.text.bind(pdf);
      pdf.text = (t, ...r) => { textes.push(String(t)); return texte(t, ...r); };
      return pdf;
    }
    const blob = await assemblerPdf(c, new Map(), { jsPDF: Espion });
    expect(blob).toBeInstanceOf(Blob);
    const mesure = new jsPDF({ unit: 'mm', format: 'a4' });
    mesure.setFont('helvetica', 'normal');
    mesure.setFontSize(9.5);
    const longues = textes.filter(t => t.includes('aaaa') || t.includes('motmot'));
    expect(longues.length).toBeGreaterThan(2);
    for (const t of longues) expect(mesure.getTextWidth(t)).toBeLessThanOrEqual(178.01);
    expect(textes.join('')).toContain(adresse);
  });
  it('découpe les sauts de ligne de la stratégie', async () => {
    const c = { ...contenu(1), strategie: [{ titre: 'x', lignes: ['alpha\nbeta\n\ngamma'] }] };
    const texte = await brut(await assemblerPdf(c, new Map(), { jsPDF, compress: false }));
    for (const mot of ['(alpha)', '(beta)', '(gamma)']) expect(texte).toContain(mot);
  });
  it('fabrique 30 fiches et une stratégie de 30 000 caractères en quelques secondes', async () => {
    const long = 'stratégie '.repeat(3000).trim();
    const c = { ...contenu(30), strategie: [{ titre: 'ton et voix', lignes: [long] }] };
    const debut = Date.now();
    const blob = await assemblerPdf(c, new Map(), { jsPDF });
    expect(Date.now() - debut).toBeLessThan(5000);
    expect(pages(await brut(blob))).toBeGreaterThan(30);
  }, 20000);
  it('ne recompresse pas les cartes JPEG : la taille reste voisine de la somme des cartes', async () => {
    // Deux cartes différentes : jsPDF ne garde qu'une copie de deux images identiques.
    const a = jpegDeTaille(300 * 1024, 1);
    const b = jpegDeTaille(300 * 1024, 2);
    expect(a.size).toBeGreaterThan(290 * 1024);
    const cartes = new Map([['F01', { ok: true, carte: a, largeur: 1, hauteur: 1 }], ['F02', { ok: true, carte: b, largeur: 1, hauteur: 1 }]]);
    const blob = await assemblerPdf(contenu(2), cartes, { jsPDF });
    const somme = a.size + b.size;
    expect(blob.size).toBeGreaterThanOrEqual(somme * 0.98);
    expect(blob.size).toBeLessThan(somme + 80 * 1024);
    const texte = await brut(blob);
    expect(texte).toContain('/DCTDecode');
    expect(texte).not.toMatch(/\/FlateDecode\s*\/DCTDecode|\/DCTDecode\s*\/FlateDecode/);
  });
});
