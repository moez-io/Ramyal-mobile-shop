import { defineConfig } from "vite";

const apiProxy = {
  target: "http://127.0.0.1:4000",
  changeOrigin: true,
  configure(proxy) {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader("origin", "http://127.0.0.1:4000");
    });
  },
};

export default defineConfig({
  server: {
    proxy: {
      "/api": apiProxy,
      "/uploads": apiProxy,
    },
  },
});
