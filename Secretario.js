const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const notifier = require('node-notifier');

const ENTRADA_DIR = path.join(__dirname, 'entrada');
const PATRON = /Transferencia exitosa/i; // Detecta comprobantes válidos

async function analizarImagen(filePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'spa');
    if (!PATRON.test(text)) return null;

    const nombreArchivo = path.basename(filePath);
    const remitente = nombreArchivo.replace(/_\d+\.jpg$/i, '').replace(/_/g, ' ');

    const comprobante = text.match(/Comprobante\s*No\.?\s*[:\-]?\s*(\d+)/i);
    const fechaHora = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i);
    const valor = text.match(/Valor de la transferencia\s*\$?\s*([\d.,]+)/i);
    const destinatario = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+)/);
    const cuenta = text.match(/(\d{3}\s*-\s*\d{6,}\s*-\s*\d{2})/);

    return {
      remitente,
      comprobante: comprobante ? comprobante[1] : '',
      fecha: fechaHora ? fechaHora[1] : '',
      hora: fechaHora ? fechaHora[2] : '',
      valor: valor ? valor[1] : '',
      destinatario: destinatario ? destinatario[1].trim() : '',
      cuenta: cuenta ? cuenta[1] : ''
    };
  } catch (err) {
    return null;
  }
}

async function obtenerDatosComprobantes() {
  if (!fs.existsSync(ENTRADA_DIR)) return [];
  const archivos = fs.readdirSync(ENTRADA_DIR).filter(f =>
    f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
  );
  const resultados = [];
  for (const archivo of archivos) {
    const filePath = path.join(ENTRADA_DIR, archivo);
    const datos = await analizarImagen(filePath);
    if (datos) resultados.push(datos);
  }
  return resultados;
}

(async () => {
  const comprobantes = await obtenerDatosComprobantes();
  if (comprobantes.length === 0) {
    notifier.notify({
      title: 'Secretario',
      message: 'No se encontraron comprobantes válidos.'
    });
    return;
  }
  comprobantes.forEach((c, idx) => {
    const mensaje = 
      `Remitente: ${c.remitente}\n` +
      `Comprobante: ${c.comprobante}\n` +
      `Fecha: ${c.fecha}\n` +
      `Hora: ${c.hora}\n` +
      `Valor: ${c.valor}\n` +
      `Destinatario: ${c.destinatario}\n` +
      `Cuenta destino: ${c.cuenta}`;
    notifier.notify({
      title: `Comprobante #${idx + 1}`,
      message: mensaje
    });
  });
})();