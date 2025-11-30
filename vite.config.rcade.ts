import { rename } from 'fs/promises'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'rewrite-root-to-rcade',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/') {
            req.url = '/index-rcade.html'
          }
          next()
        })
      },
      async closeBundle() {
        // Rename index-rcade.html to index.html after build
        const outDir = resolve(__dirname, 'dist-rcade')
        await rename(
          resolve(outDir, 'index-rcade.html'),
          resolve(outDir, 'index.html')
        )
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index-rcade.html'),
      },
    },
    outDir: resolve(__dirname, 'dist-rcade'),
    emptyOutDir: true,
  },
})
