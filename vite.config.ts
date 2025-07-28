import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "background.js", dest: "." },
        { src: "content.js", dest: "." },
        { src: "onboarding.html", dest: "." },
        { src: "onboarding.js", dest: "." },
        { src: "onboarding.css", dest: "." },
        { src: "popup.html", dest: "." },
        { src: "popup.js", dest: "." },
        { src: "popup.css", dest: "." },
        { src: "content.css", dest: "." },
        { src: "assets", dest: "." },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "popup.html"),
        onboarding: path.resolve(__dirname, "onboarding.html"),
        // Optional:
        // index: path.resolve(__dirname, "index.html"),
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
});
