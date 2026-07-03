/**
 * Генерация исходников иконки и splash в стиле Munaitelecom
 * (монограмма M↑, голубой #A5C3E6 + графит #34383C на светлом фоне).
 * Выход: assets/icon.png, icon-foreground.png, icon-background.png,
 *        splash.png, splash-dark.png — их подхватывает @capacitor/assets.
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BLUE = '#A5C3E6'
const DARK = '#34383C'
const BG_LIGHT = '#F4F6F8'
const BG_DARK = '#1B1E21'

// Монограмма: M (графит) + стрелка вверх (голубая).
// Рисуем только фигурами — без <text>, чтобы не зависеть от шрифтов.
// Координаты в системе 0..1000, центр марки ~ (500,500).
function monogram(dark, blue) {
  const sw = 92 // толщина штриха M
  return `
  <g stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- M -->
    <path d="M 190 700 L 190 330 L 375 585 L 560 330 L 560 700"
          stroke="${dark}" stroke-width="${sw}" />
    <!-- Стрелка вверх -->
    <g fill="${blue}" stroke="none">
      <path d="M 762 300 L 878 470 L 800 470 L 800 700 L 724 700 L 724 470 L 646 470 Z" />
    </g>
  </g>`
}

function svgIcon(size, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="${size}" height="${size}">
  <rect width="1000" height="1000" fill="${bg}"/>
  ${monogram(DARK, BLUE)}
</svg>`
}

// Foreground для adaptive icon: контент в безопасной зоне (центр ~66%)
function svgForeground(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="${size}" height="${size}">
  <g transform="translate(500 500) scale(0.62) translate(-500 -500)">
    ${monogram(DARK, BLUE)}
  </g>
</svg>`
}

function svgSolid(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`
}

function svgSplash(size, bg, dark, blue) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="${size}" height="${size}">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1366 1300) scale(0.55) translate(-500 -500)">
    ${monogram(dark, blue)}
  </g>
  <!-- munaitelecom: полоска-подпись под маркой -->
  <rect x="1166" y="1720" width="400" height="14" rx="7" fill="${blue}"/>
</svg>`
}

async function main() {
  const out = path.join(__dirname, '..', 'assets')
  fs.mkdirSync(out, { recursive: true })

  const jobs = [
    ['icon.png', svgIcon(1024, BG_LIGHT)],
    ['icon-foreground.png', svgForeground(1024)],
    ['icon-background.png', svgSolid(1024, BG_LIGHT)],
    ['splash.png', svgSplash(2732, BG_LIGHT, DARK, BLUE)],
    ['splash-dark.png', svgSplash(2732, BG_DARK, '#E8EAED', BLUE)],
  ]
  for (const [name, svg] of jobs) {
    await sharp(Buffer.from(svg)).png().toFile(path.join(out, name))
    console.log('written', name)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
