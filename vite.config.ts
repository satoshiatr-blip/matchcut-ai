import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// iPhone実機はLAN越しなのでHTTPS必須。PCのlocalhost確認は --mode pc でHTTPにする
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'pc' ? [] : [basicSsl()])],
  server: { port: mode === 'pc' ? 5183 : 5182, host: mode !== 'pc' },
}))
