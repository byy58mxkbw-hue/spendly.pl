import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Vite `preview` (sirv) nie ustawia Cache-Control domyślnie, więc przeglądarki/proxy
// mogą po swojemu cache'ować index.html — stąd po deployu losowo stara/nowa wersja
// na różnych odświeżeniach. HTML musi być zawsze rewalidowany; zasoby z hashem
// w nazwie (JS/CSS/obrazy z buildu) mogą być cache'owane bezpiecznie na stałe.
function noCacheHtmlPlugin(): Plugin {
  return {
    name: "no-cache-html",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || /\.html($|\?)/.test(req.url) || req.url === "/" || !/\.[a-z0-9]+($|\?)/i.test(req.url)) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        next();
      });
    },
  };
}

const rawPort = process.env.PORT;
const port = Number(rawPort ?? "3000");

if (rawPort !== undefined && (Number.isNaN(port) || port <= 0)) {
  console.warn(`Invalid PORT value: "${rawPort}"; falling back to 3000.`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), noCacheHtmlPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        "sign-in": path.resolve(import.meta.dirname, "sign-in.html"),
        "sign-up": path.resolve(import.meta.dirname, "sign-up.html"),
        ksef: path.resolve(import.meta.dirname, "ksef.html"),
        "food-cost": path.resolve(import.meta.dirname, "food-cost.html"),
        "ocr-faktur": path.resolve(import.meta.dirname, "ocr-faktur.html"),
        cennik: path.resolve(import.meta.dirname, "cennik.html"),
      },
    },
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
