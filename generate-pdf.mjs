import puppeteer from 'puppeteer'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath  = resolve(__dirname, 'index.html')
const outPath   = resolve(__dirname, 'FleetTrack-Presentacion.pdf')

console.log('🚀 Iniciando generación del PDF...')

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const page = await browser.newPage()

// Cargar el HTML desde archivo (resuelve rutas locales de fuentes correctamente)
const htmlContent = readFileSync(htmlPath, 'utf8')
await page.setContent(htmlContent, {
  waitUntil: 'networkidle0',   // esperar que cargue la fuente Inter de Google Fonts
  timeout: 30_000,
})

// Viewport amplio para que no haya colapso responsive
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 })

// Esperar que las fuentes terminen de cargar
await page.evaluateHandle('document.fonts.ready')

// CSS extra solo para el PDF: quitar position:sticky del nav, ocultar hover states
await page.addStyleTag({
  content: `
    nav { position: relative !important; backdrop-filter: none !important; }
    * { transition: none !important; animation: none !important; }
    .admin-live-dot { box-shadow: 0 0 0 3px rgba(16,185,129,.2) !important; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  `
})

const pdf = await page.pdf({
  path:   outPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  scale:  0.72,          // escala para que todo el layout entre en A4
})

await browser.close()

console.log(`✅ PDF generado: ${outPath}`)
console.log(`   Tamaño: ${(pdf.length / 1024).toFixed(1)} KB`)
