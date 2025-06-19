const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const notifier = require('node-notifier');

const ENTRADA_DIR = path.join(__dirname, 'entrada');
const SALIDA_TXT = path.join(__dirname, 'comprobantes.txt');
const PATRON = /Transferencia exitosa/i;

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

  // Notificación resumida
  let resumen = 'Remitente | Fecha | Valor\n';
  resumen += comprobantes.map(c =>
    `${c.remitente} | ${c.fecha} | ${c.valor}`
  ).join('\n');
  if (resumen.length > 500) resumen = resumen.slice(0, 500) + '...';

  notifier.notify({
    title: 'Comprobantes encontrados',
    message: resumen
  });

  // Detalle completo en archivo tipo tabla
  let tabla = 'Remitente\tComprobante\tFecha\tHora\tValor\tDestinatario\tCuenta destino\n';
  tabla += comprobantes.map(c =>
    `${c.remitente}\t${c.comprobante}\t${c.fecha}\t${c.hora}\t${c.valor}\t${c.destinatario}\t${c.cuenta}`
  ).join('\n');
  fs.writeFileSync(SALIDA_TXT, tabla, 'utf8');
})();