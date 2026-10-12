const MARGE = 16;
const LARGEUR = 210;
const HAUTEUR = 297;
const UTILE = LARGEUR - 2 * MARGE;

// Une ligne sans espace (adresse, long mot-dièse) plus large que la page est coupée au caractère.
function coupe(pdf, ligne, largeur) {
  if (pdf.getTextWidth(ligne) <= largeur) return [ligne];
  const morceaux = [];
  let reste = ligne;
  while (reste) {
    if (pdf.getTextWidth(reste) <= largeur) { morceaux.push(reste); break; }
    let bas = 1;
    let haut = reste.length;
    while (bas < haut) {
      const milieu = Math.ceil((bas + haut) / 2);
      if (pdf.getTextWidth(reste.slice(0, milieu)) <= largeur) bas = milieu; else haut = milieu - 1;
    }
    morceaux.push(reste.slice(0, bas));
    reste = reste.slice(bas);
  }
  return morceaux;
}

// jsPDF n'échoue pas sur un JPEG abîmé quand le format est imposé : il embarque les octets tels quels.
// On vérifie donc l'en-tête (SOI, puis un marqueur SOFn avec des dimensions non nulles) avant d'ajouter l'image.
function jpegValide(o) {
  if (o.length < 4 || o[0] !== 0xff || o[1] !== 0xd8) return false;
  let i = 2;
  while (i + 9 < o.length) {
    if (o[i] !== 0xff) { i += 1; continue; }
    const marqueur = o[i + 1];
    if (marqueur === 0xff) { i += 1; continue; }
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) { i += 2; continue; }
    if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) return ((o[i + 5] << 8) | o[i + 6]) > 0 && ((o[i + 7] << 8) | o[i + 8]) > 0;
    i += 2 + ((o[i + 2] << 8) | o[i + 3]);
  }
  return false;
}

export async function assemblerPdf(contenu, cartes, { jsPDF, compress = true }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress });
  let y = MARGE;
  const saut = () => { pdf.addPage(); y = MARGE; };
  const place = h => { if (y + h > HAUTEUR - MARGE) saut(); };
  const ecrire = (texte, { taille = 9.5, gras = false, police = 'helvetica', interligne = 1.32 } = {}) => {
    pdf.setFont(police, gras ? 'bold' : 'normal');
    pdf.setFontSize(taille);
    const pas = taille * 0.3528 * interligne;
    for (const paragraphe of String(texte ?? '').split(/\r\n|\r|\n/)) {
      const lignes = pdf.splitTextToSize(paragraphe || ' ', UTILE).flatMap(l => coupe(pdf, l, UTILE));
      for (const ligne of lignes) {
        place(pas);
        pdf.text(ligne, MARGE, y + pas * 0.8);
        y += pas;
      }
    }
  };
  const espace = h => { y += h; };

  ecrire(contenu.titre, { taille: 15, gras: true });
  espace(2);
  ecrire(contenu.intro);
  espace(4);
  if (contenu.strategie.length) ecrire('Stratégie', { taille: 13, gras: true });
  for (const section of contenu.strategie) {
    espace(2);
    ecrire(section.titre, { taille: 11, gras: true });
    for (const ligne of section.lignes) ecrire(ligne);
  }
  if (contenu.regles.length) {
    espace(4);
    ecrire('Règles de la période', { taille: 13, gras: true });
    for (const ligne of contenu.regles) ecrire(ligne);
  }
  for (const fiche of contenu.fiches) {
    saut();
    ecrire(`Fiche ${fiche.ref}`, { taille: 13, gras: true });
    espace(2);
    const carte = cartes.get(fiche.ref);
    if (carte?.ok) {
      try {
        const octets = new Uint8Array(await carte.carte.arrayBuffer());
        if (!jpegValide(octets)) throw new Error('JPEG illisible');
        const ratio = carte.hauteur / carte.largeur;
        let l = UTILE;
        let h = l * ratio;
        if (h > 150) { h = 150; l = h / ratio; }
        // 'NONE' : la carte est déjà un JPEG, jsPDF la copie telle quelle.
        pdf.addImage(octets, 'JPEG', MARGE, y, l, h, undefined, 'NONE');
        y += h + 4;
      } catch {
        ecrire('(visuel illisible)');
      }
    }
    for (const ligne of fiche.lignes) ecrire(ligne);
  }
  saut();
  ecrire('Consigne', { taille: 13, gras: true });
  espace(2);
  for (const ligne of contenu.consigne) ecrire(ligne, { taille: 8.5, police: 'courier', interligne: 1.25 });
  return pdf.output('blob');
}
