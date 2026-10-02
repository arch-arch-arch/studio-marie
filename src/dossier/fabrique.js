import { jsPDF } from 'jspdf';
import { preparerCartes } from './cartes.js';
import { assemblerPdf as assembler } from './pdf.js';

export { preparerCartes };
export const assemblerPdf = (contenu, cartes) => assembler(contenu, cartes, { jsPDF });
