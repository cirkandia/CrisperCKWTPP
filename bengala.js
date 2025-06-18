const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const GRUPO_NOMBRE = process.env.GPRUEBA;
const SALIDA_DIR = path.join(__dirname, 'Salida');
const ENTRADA_DIR = path.join(__dirname, 'entrada');

if (!fs.existsSync(SALIDA_DIR)) {
  fs.mkdirSync(SALIDA_DIR);
}

if (!fs.existsSync(ENTRADA_DIR)) {
  fs.mkdirSync(ENTRADA_DIR);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page = await browser.newPage();
  await page.goto('https://web.whatsapp.com');

  // Espera un poco para que cargue la página
  await page.waitForTimeout(3000);

  // Verifica si hay QR (no autenticado)
  const hayQR = await page.$('canvas[aria-label="Scan me!"]');
  if (hayQR) {
    console.log('No hay sesión activa de WhatsApp Web. Por favor, inicia sesión manualmente en el navegador antes de ejecutar este script.');
    await browser.close();
    process.exit(1);
  }

  // Verifica si ya está autenticado (busca el selector de la barra de búsqueda)
  try {
    await page.waitForSelector('._2vDPL', { timeout: 10000 });
  } catch {
    console.log('No se detectó una sesión activa de WhatsApp Web. Abortando.');
    await browser.close();
    process.exit(1);
  }

  // Busca el grupo por nombre y haz clic
  await page.waitForSelector('._2vDPL'); // Selector de la barra de búsqueda
  await page.click('._2vDPL');
  await page.type('._2vDPL', GRUPO_NOMBRE);
  await page.waitForTimeout(2000);

  // Haz clic en el grupo en la lista de resultados
  await page.evaluate((nombreGrupo) => {
    const chats = Array.from(document.querySelectorAll('._21S-L'));
    const chat = chats.find(el => el.textContent.includes(nombreGrupo));
    if (chat) chat.click();
  }, GRUPO_NOMBRE);

  // Espera a que cargue el chat del grupo
  await page.waitForSelector('._1-FMR');

  // Función para hacer scroll hacia arriba y recolectar imágenes
  async function recolectarImagenesNecesarias() {
    let imagenes = [];
    let intentos = 0;
    const maxIntentos = 20; // Limita el número de scrolls para evitar bucles infinitos

    while (imagenes.length < 10 && intentos < maxIntentos) {
      imagenes = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
        return imgs.map(img => img.src);
      });
      if (imagenes.length >= 10) break;
      // Scroll hacia arriba en el chat
      await page.evaluate(() => {
        const mensajes = document.querySelector('._1-FMR');
        if (mensajes) mensajes.scrollTop = 0;
      });
      await page.waitForTimeout(1500); // Espera a que carguen más mensajes
      intentos++;
    }
    return imagenes.slice(-10); // Solo las últimas 10
  }

  const imagenes = await recolectarImagenesNecesarias();

  console.log(`Encontradas ${imagenes.length} imágenes. Descargando...`);

  // Descarga las imágenes usando el contexto de la página
  for (let i = 0; i < imagenes.length; i++) {
    const src = imagenes[i];
    const buffer = await page.evaluate(async (src) => {
      const res = await fetch(src);
      const arr = await res.arrayBuffer();
      return Array.from(new Uint8Array(arr));
    }, src);
    fs.writeFileSync(path.join(ENTRADA_DIR, `img_${i + 1}.jpg`), Buffer.from(buffer));
    console.log(`Imagen ${i + 1} guardada.`);
  }

  console.log('¡Listo! Imágenes descargadas en la carpeta entrada.');
  await browser.close();

  // Ejecutar Secretario.js después de descargar las imágenes
  try {
    console.log('Ejecutando el analizador de imágenes (Secretario.js)...');
    require('child_process').execSync('node Secretario.js', { stdio: 'inherit' });
  } catch (err) {
    console.error('Error al ejecutar Secretario.js:', err.message);
  }
})();

// Nueva sección para verificar y advertir sobre posibles problemas de seguridad en los archivos
fs.readdir(ENTRADA_DIR, (err, archivos) => {
  if (err) throw err;

  archivos.forEach(archivo => {
    const nombreArchivo = path.basename(archivo);
    // Ignora los archivos que no tengan extensión .jpg
    if (path.extname(nombreArchivo) !== '.jpg') {
      console.warn(`Archivo ignorado (no es .jpg): ${nombreArchivo}`);
      return;
    }
    if (nombreArchivo.includes('..') || path.isAbsolute(nombreArchivo)) {
      console.warn(`Archivo ignorado por posible path traversal: ${nombreArchivo}`);
      return;
    }
    const filePath = path.join(ENTRADA_DIR, nombreArchivo);
    // Verifica que el archivo esté realmente dentro de la carpeta entrada
    if (!filePath.startsWith(ENTRADA_DIR)) {
      console.warn(`Archivo fuera de la carpeta entrada: ${nombreArchivo}`);
      return;
    }
  });
});