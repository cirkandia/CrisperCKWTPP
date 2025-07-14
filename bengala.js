const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

let grupoNombre = process.argv[2] || null;
const GRUPO_NOMBRE_FILE = path.join(__dirname, 'grupo_nombre.txt');

// Si no hay argumento, usa el archivo como respaldo
if (!grupoNombre && fs.existsSync(GRUPO_NOMBRE_FILE)) {
  grupoNombre = fs.readFileSync(GRUPO_NOMBRE_FILE, 'utf8').trim();
}

if (!grupoNombre) {
  console.error('No se proporcionó el nombre del grupo ni existe grupo_nombre.txt');
  process.exit(1);
}

const SALIDA_DIR = path.join(__dirname, 'Salida');
const ENTRADA_DIR = path.join(__dirname, 'entrada');
const USER_DATA_DIR = path.join(__dirname, 'firefox_profile');

if (!fs.existsSync(SALIDA_DIR)) fs.mkdirSync(SALIDA_DIR);
if (!fs.existsSync(ENTRADA_DIR)) fs.mkdirSync(ENTRADA_DIR);

(async () => {
  const context = await firefox.launchPersistentContext(USER_DATA_DIR, { headless: false });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://web.whatsapp.com');
  console.log('Navegador abierto, esperando WhatsApp Web...');

  // Selector robusto para español
  const inputSelector = 'div[contenteditable="true"][aria-label*="búsqueda"], div[contenteditable="true"][data-tab="3"]';

  console.log('Esperando input de búsqueda...');
  await page.waitForSelector(inputSelector, { timeout: 0 });
  console.log('Input de búsqueda encontrado');

  await page.click(inputSelector);
  console.log('Click en input de búsqueda');
  await page.fill(inputSelector, grupoNombre);
  console.log('Escribiendo nombre del grupo:', grupoNombre);
  await page.waitForTimeout(2000);

  // Haz clic en el primer resultado de la lista de chats
  const primerChatSelector = 'div[role="listitem"]';
  console.log('Buscando el primer resultado de la lista de chats...');
  await page.waitForSelector(primerChatSelector, { timeout: 5000 });
  await page.click(primerChatSelector);
  console.log('¡Grupo abierto por click en el primer resultado!');

  // Espera a que cargue el chat del grupo
  console.log('Esperando a que cargue el chat del grupo...');
  await page.waitForSelector('div[tabindex="-1"]');
  console.log('¡Grupo abierto! Buscando imágenes...');

  // Scroll y recolecta imágenes
  let imagenes = [];
  let intentos = 0;
  while (imagenes.length < 10 && intentos < 20) {
    imagenes = await page.evaluate(() => {
      const mensajes = Array.from(document.querySelectorAll('div.message-in, div.message-out'));
      const resultados = [];
      mensajes.forEach(msg => {
        const img = msg.querySelector('img[src^="blob:"]');
        if (img) {
          let remitente = null;
          const nombreSpan = msg.querySelector('span[dir="auto"]');
          if (nombreSpan) remitente = nombreSpan.textContent;
          resultados.push({
            src: img.src,
            remitente: remitente || 'Desconocido'
          });
        }
      });
      return resultados;
    });
    if (imagenes.length >= 10) break;
    await page.mouse.wheel(0, -1000); // Scroll hacia arriba
    await page.waitForTimeout(1500);
    intentos++;
  }

  imagenes = imagenes.slice(-10);

  console.log(`Encontradas ${imagenes.length} imágenes. Descargando...`);

  for (let i = 0; i < imagenes.length; i++) {
    const { src, remitente } = imagenes[i];
    const buffer = await page.evaluate(async (src) => {
      const res = await fetch(src);
      const arr = await res.arrayBuffer();
      return Array.from(new Uint8Array(arr));
    }, src);

    let nombreLimpio = remitente.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
    if (!nombreLimpio) nombreLimpio = 'Desconocido';
    const nombreArchivo = `${nombreLimpio}_${i + 1}.jpg`;

    fs.writeFileSync(path.join(ENTRADA_DIR, nombreArchivo), Buffer.from(buffer));
    console.log(`Imagen ${i + 1} guardada como ${nombreArchivo}. Remitente: ${remitente}`);
  }

  console.log('¡Listo! Imágenes descargadas en la carpeta entrada.');
  await context.close();

  // Ejecutar Secretario.js después de descargar las imágenes
  try {
    console.log('Ejecutando el analizador de imágenes (Secretario.js)...');
    require('child_process').execSync('node Secretario.js', { stdio: 'inherit' });
  } catch (err) {
    console.error('Error al ejecutar Secretario.js:', err.message);
  }
})();