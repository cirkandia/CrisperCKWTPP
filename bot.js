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

// --- Revisar si ya se envió en este día ---
function yaSeEnvioHoy() {
  if (!fs.existsSync(FECHA_FILE)) return false;
  try {
    const { year, month, day } = JSON.parse(fs.readFileSync(FECHA_FILE, 'utf8'));
    const hoy = new Date();
    return (
      hoy.getFullYear() === year &&
      hoy.getMonth() === month &&
      hoy.getDate() === day
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

// --- Obtener número de semana del año ---
function getNumeroSemana(date = new Date()) {
  const primerDiaAno = new Date(date.getFullYear(), 0, 1);
  const dias = Math.floor((date - primerDiaAno) / (24 * 60 * 60 * 1000));
  return Math.ceil((dias + primerDiaAno.getDay() + 1) / 7);
}

// --- Revisar si estamos en la semana de envío ---
function esSemanaDeEnvio() {
  const hoy = new Date();
  const dia = hoy.getDate();
  const diasEnvio = (process.env.DIAS_ENVIO || '')
    .split(',')
    .map(d => parseInt(d.trim(), 10))
    .filter(Number.isInteger);
  return diasEnvio.includes(dia);
}

// --- Revisar si ya se envió en la semana actual ---
function yaSeEnvioEstaSemana() {
  if (!fs.existsSync(FECHA_FILE)) return false;
  try {
    const { year, semana } = JSON.parse(fs.readFileSync(FECHA_FILE, 'utf8'));
    const hoy = new Date();
    const semanaActual = getNumeroSemana(hoy);
    return hoy.getFullYear() === year && semanaActual === semana;
  } catch {
    return false;
  }
}

// --- Revisar si la última semana de envío ya terminó ---
function ultimaSemanaEnvioYaPaso() {
  if (!fs.existsSync(FECHA_FILE)) return false;
  try {
    const { year, semana } = JSON.parse(fs.readFileSync(FECHA_FILE, 'utf8'));
    const hoy = new Date();
    const semanaActual = getNumeroSemana(hoy);
    // Si la semana guardada es menor que la actual, ya pasó
    return hoy.getFullYear() > year || (hoy.getFullYear() === year && semanaActual > semana);
  } catch {
    return false;
  }
}

// --- Revisar si ya se envió en este mes ---
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

// --- FILTRO PRINCIPAL ---
if (hayImagenesEnEntrada()) {
  const archivos = fs.readdirSync(ENTRADA_DIR).filter(nombre =>
    nombre.endsWith('.jpg') ||
    nombre.endsWith('.jpeg') ||
    nombre.endsWith('.png')
  );
  console.log('Hay imágenes en la carpeta "entrada":');
  for (const nombreArchivo of archivos) {
    // Evita path traversal
    if (nombreArchivo.includes('..') || path.isAbsolute(nombreArchivo)) {
      console.warn(`Archivo ignorado por posible path traversal: ${nombreArchivo}`);
      continue;
    }
    const filePath = path.join(ENTRADA_DIR, nombreArchivo);
    // Verifica que el archivo esté realmente dentro de la carpeta entrada (seguro multiplataforma)
    const entradaDirAbs = path.resolve(ENTRADA_DIR) + path.sep;
    const filePathAbs = path.resolve(filePath);
    if (!filePathAbs.startsWith(entradaDirAbs)) {
      console.warn(`Archivo fuera de la carpeta entrada: ${nombreArchivo}`);
      continue;
    }
    console.log('-', nombreArchivo);
    // Aquí puedes procesar el archivo seguro: filePathAbs
  }
  process.exit(0); // Termina el programa, no ejecuta el bot
}

if (esDiaDeEnvio()) {
  if (!yaSeEnvioEsteMes()) {
    main();
  } else {
    console.log('Ya se envió este mes. No se repite el envío ni se trae archivos.');
    process.exit(0);
  }
} else {
  if (ultimoDiaEnvioYaPaso()) {
    console.log('Ya pasó el último día de envío. Ejecutando bengala.js...');
    execSync('node bengala.js', { stdio: 'inherit' });
    // Borra el archivo de control para permitir el ciclo el próximo mes
    fs.unlinkSync(FECHA_FILE);
  } else {
    console.log('No es día de envío y no hay nada pendiente. No se hace nada.');
  }
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

main();
