require('dotenv').config();
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const DATA_DIR = path.join(__dirname, 'data');
const FECHA_FILE = path.join(DATA_DIR, 'fecha_ultimo_envio.json');
const ENTRADA_DIR = path.join(__dirname, 'entrada');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// --- Revisar carpeta entrada ---
function hayImagenesEnEntrada() {
  if (!fs.existsSync(ENTRADA_DIR)) return false;
  const archivos = fs.readdirSync(ENTRADA_DIR);
  return archivos.some(nombre =>
    nombre.endsWith('.jpg') ||
    nombre.endsWith('.jpeg') ||
    nombre.endsWith('.png')
  );
}

// --- Revisar si hoy es día de envío ---
function esDiaDeEnvio() {
  const hoy = new Date();
  const dia = hoy.getDate();
  const diasEnvio = (process.env.DIAS_ENVIO || '')
    .split(',')
    .map(d => parseInt(d.trim(), 10))
    .filter(Number.isInteger);
  return diasEnvio.includes(dia);
}

// --- FILTRO PRINCIPAL ---
if (hayImagenesEnEntrada()) {
  const archivos = fs.readdirSync(ENTRADA_DIR).filter(nombre =>
    nombre.endsWith('.jpg') ||
    nombre.endsWith('.jpeg') ||
    nombre.endsWith('.png')
  );
  console.log('Hay imágenes en la carpeta "entrada":');
  archivos.forEach(nombre => console.log('-', nombre));
  // Aquí puedes procesar las imágenes como quieras
  process.exit(0); // Termina el programa, no ejecuta el bot
}

if (!esDiaDeEnvio()) {
  console.log('Hoy NO es un día de envío. El bot no enviará mensajes ni archivos.');
  process.exit(0);
}

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_bot');
  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { qr, connection } = update;
    if (qr) {
      console.log('Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('¡Conexión establecida!');
      enviarMensajes(sock);
    }
  });
}

async function enviarMensajes(sock) {
  const grupoJid = process.env.GPRUEBA;

  // Envía dos mensajes de texto al grupo
  await sock.sendMessage(grupoJid, { text: "Primer mensaje automático del bot." });
  await sock.sendMessage(grupoJid, { text: "Segundo mensaje automático del bot." });

  // Guarda la fecha/hora del envío automático
  const fechaEnvio = new Date().toISOString();
  fs.writeFileSync(FECHA_FILE, JSON.stringify({ fechaEnvio }));

  // Envía todos los archivos desde la carpeta Salida
  const salidaDir = path.join(__dirname, 'Salida');
  if (fs.existsSync(salidaDir)) {
    const archivos = fs.readdirSync(salidaDir);
    for (const nombreArchivo of archivos) {
      // Evita path traversal
      if (nombreArchivo.includes('..') || path.isAbsolute(nombreArchivo)) {
        console.warn(`Archivo ignorado por posible path traversal: ${nombreArchivo}`);
        continue;
      }
      const filePath = path.join(salidaDir, nombreArchivo);
      // Verifica que el archivo esté realmente dentro de la carpeta Salida
      if (!filePath.startsWith(salidaDir)) {
        console.warn(`Archivo fuera de la carpeta Salida: ${nombreArchivo}`);
        continue;
      }
      if (
        nombreArchivo.endsWith('.jpg') ||
        nombreArchivo.endsWith('.jpeg') ||
        nombreArchivo.endsWith('.png')
      ) {
        const buffer = fs.readFileSync(filePath);
        await sock.sendMessage(grupoJid, {
          image: buffer,
          fileName: nombreArchivo,
          caption: `Imagen: ${nombreArchivo}`
        });
      } else {
        let mimetype = 'application/octet-stream';
        if (nombreArchivo.endsWith('.pdf')) mimetype = 'application/pdf';
        else if (nombreArchivo.endsWith('.txt')) mimetype = 'text/plain';

        const buffer = fs.readFileSync(filePath);
        await sock.sendMessage(grupoJid, {
          document: buffer,
          fileName: nombreArchivo,
          mimetype: mimetype
        });
      }
    }
  } else {
    console.log('La carpeta Salida no existe.');
  }

  // Finaliza el proceso automáticamente
  process.exit(0);
}

main();
