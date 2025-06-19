const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const ENTRADA_DIR = path.join(__dirname, 'entrada');
const PATRON = /Transferencia exitosa/i; // Detecta comprobantes válidos

async function analizarImagen(filePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'spa');
    if (!PATRON.test(text)) {
      console.log(`No es un comprobante válido: ${path.basename(filePath)}`);
      return;
    }

    // Extrae el remitente del nombre del archivo
    const nombreArchivo = path.basename(filePath);
    const remitente = nombreArchivo.replace(/_\d+\.jpg$/i, '').replace(/_/g, ' ');

    // Expresiones regulares para los datos específicos
    const comprobante = text.match(/Comprobante\s*No\.?\s*[:\-]?\s*(\d+)/i);
    const fechaHora = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i);
    const valor = text.match(/Valor de la transferencia\s*\$?\s*([\d.,]+)/i);
    const destinatario = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+)/);
    const cuenta = text.match(/(\d{3}\s*-\s*\d{6,}\s*-\s*\d{2})/);

    console.log(`Remitente (nombre de archivo): ${remitente}`);
    if (comprobante) console.log("Comprobante:", comprobante[1]);
    if (fechaHora) console.log("Fecha:", fechaHora[1], "| Hora:", fechaHora[2]);
    if (valor) console.log("Valor:", valor[1]);
    if (destinatario) console.log("Destinatario:", destinatario[1].trim());
    if (cuenta) console.log("Cuenta destino:", cuenta[1]);
  } catch (err) {
    console.error(`Error analizando ${filePath}:`, err.message);
  }
}

async function analizarTodasLasImagenes() {
  if (!fs.existsSync(ENTRADA_DIR)) {
    console.log('No existe la carpeta entrada.');
    return;
  }
  const archivos = fs.readdirSync(ENTRADA_DIR).filter(f =>
    f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
  );
  for (const archivo of archivos) {
    const filePath = path.join(ENTRADA_DIR, archivo);
    await analizarImagen(filePath);
  }
}

analizarTodasLasImagenes();