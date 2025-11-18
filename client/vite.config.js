import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // server: {
  //   host: '0.0.0.0',     // listen di semua interface
  //   port: 5173,          // ganti kalau perlu
  //   strictPort: false,   // true jika mau error kalau port dipakai
  //   // Jika HMR bermasalah di perangkat lain, tambahkan:
  //   // hmr: { host: '192.168.1.10', port: 5173 } 
  // }
})
