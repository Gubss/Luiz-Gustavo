import type { NextConfig } from "next";

// App local lendo SQLite: renderização dinâmica em todas as rotas (sem Cache Components).
const nextConfig: NextConfig = {
  // Transcrições coladas à mão podem passar de 1 MB em vídeos longos.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Sem cache em disco do modo dev: depois de um "git pull" o cache velho deixava a página recompilando e recarregando sem parar.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
