const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const SALIDA_DIR = path.join(__dirname, 'Salida');
const PATRON = /TU_PATRON_AQUI/gi; // Cambia esto por tu patrón o texto a buscar

async function analizarImagen(filePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'spa'); // 'spa' para español
    const encontrados = text.match(PATRON);
    if (encontrados) {
      console.log(`Patrón encontrado en ${path.basename(filePath)}:`, encontrados);
    } else {
      console.log(`No se encontró el patrón en ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.error(`Error analizando ${filePath}:`, err.message);
  }
}

async function analizarTodasLasImagenes() {
  if (!fs.existsSync(SALIDA_DIR)) {
    console.log('No existe la carpeta Salida.');
    return;
  }
  const archivos = fs.readdirSync(SALIDA_DIR).filter(f =>
    f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
  );
  for (const archivo of archivos) {
    const filePath = path.join(SALIDA_DIR, archivo);
    await analizarImagen(filePath);
  }
}

analizarTodasLasImagenes();