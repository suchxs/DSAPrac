import postcssImport from 'postcss-import'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  plugins: [
    postcssImport({
      path: [path.join(__dirname, 'node_modules')],
    }),
    tailwindcss,
    autoprefixer,
  ],
}
