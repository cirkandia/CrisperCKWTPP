require('dotenv').config();
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const FECHA_FILE = path.join(DATA_DIR, 'fecha_ultimo_envio.json');
const ENTRADA_DIR = path.join(__dirname, 'entrada');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
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

// --- Revisar si ya se envió este mes ---
function yaSeEnvioEsteMes() {
  if (!fs.existsSync(FECHA_FILE)) return false;
  try {
    const { year, month } = JSON.parse(fs.readFileSync(FECHA_FILE, 'utf8'));
    const hoy = new Date();
    return (
      hoy.getFullYear() === year &&
      hoy.getMonth() === month
    );
  } catch {
    return false;
  }
}

// --- Revisar si el último día de envío ya pasó ---
function ultimoDiaEnvioYaPaso() {
  if (!fs.existsSync(FECHA_FILE)) return false;
  try {
    const { year, month, day } = JSON.parse(fs.readFileSync(FECHA_FILE, 'utf8'));
    const hoy = new Date();
    const fechaUltimoEnvio = new Date(year, month, day);
    // Si hoy es posterior al último día de envío registrado
    return hoy > fechaUltimoEnvio;
  } catch {
    return false;
  }
}

// --- FILTRO PRINCIPAL ---

if (esDiaDeEnvio()) {
  if (!yaSeEnvioEsteMes()) {
    main();
  } else {
    console.log('Ya se envió este mes. No se repite el envío ni se trae archivos.');
    process.exit(0);
  }
} else {
  if (ultimoDiaEnvioYaPaso()) {
    (async () => {
      const { state } = await useMultiFileAuthState('auth_info_bot');
      const sock = makeWASocket({ auth: state });

      let nombreGrupo = null; // <-- Mueve aquí la declaración

      // Espera a que la conexión esté abierta
      await new Promise((resolve, reject) => {
        sock.ev.on('connection.update', async (update) => {
          if (update.connection === 'open') {
            const grupoJid = process.env.GPRUEBA;
            try {
              const metadata = await sock.groupMetadata(grupoJid);
              if (metadata && metadata.subject) {
                nombreGrupo = metadata.subject;
                console.log(`Nombre del grupo (${grupoJid}): ${nombreGrupo}`);
              } else {
                console.warn('No se pudo obtener el nombre del grupo: metadata vacía o sin subject');
              }
            } catch (err) {
              console.warn('No se pudo obtener el nombre del grupo:', err.message);
            }
            if (sock.ws && sock.ws.close) sock.ws.close();
            resolve();
          }
          if (update.connection === 'close') {
            reject(new Error('Conexión cerrada antes de obtener metadata.'));
          }
        });
      });

      if (nombreGrupo) {
        console.log('Ya pasó el último día de envío. Ejecutando bengala.js...');
        execSync(`node bengala.js "${nombreGrupo}"`, { stdio: 'inherit' });
        fs.unlinkSync(FECHA_FILE);
      } else {
        console.error('No se obtuvo el nombre del grupo. No se ejecuta bengala.js.');
      }
      process.exit(0);
    })();
  } else {
    console.log('No es día de envío y no hay nada pendiente. No se hace nada.');
    process.exit(0);
  }
  // No pongas process.exit(0) aquí, ya que el async IIFE lo maneja
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
      // Verifica que el archivo esté realmente dentro de la carpeta Salida (seguro multiplataforma)
      const salidaDirAbs = path.resolve(salidaDir) + path.sep;
      const filePathAbs = path.resolve(filePath);
      if (!filePathAbs.startsWith(salidaDirAbs)) {
        console.warn(`Archivo fuera de la carpeta Salida: ${nombreArchivo}`);
        continue;
      }
      if (
        nombreArchivo.endsWith('.jpg') ||
        nombreArchivo.endsWith('.jpeg') ||
        nombreArchivo.endsWith('.png')
      ) {
        const buffer = fs.readFileSync(filePathAbs);
        await sock.sendMessage(grupoJid, {
          image: buffer,
          fileName: nombreArchivo,
          caption: `Imagen: ${nombreArchivo}`
        });
      } else {
        let mimetype = 'application/octet-stream';
        if (nombreArchivo.endsWith('.pdf')) mimetype = 'application/pdf';
        else if (nombreArchivo.endsWith('.txt')) mimetype = 'text/plain';

        const buffer = fs.readFileSync(filePathAbs);
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

  // Guarda la fecha del envío (año, mes, día)
  const hoy = new Date();
  fs.writeFileSync(FECHA_FILE, JSON.stringify({
    year: hoy.getFullYear(),
    month: hoy.getMonth(),
    day: hoy.getDate()
  }));

  // Finaliza el proceso automáticamente
  process.exit(0);
}
