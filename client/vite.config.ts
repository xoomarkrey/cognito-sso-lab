import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      // Override per instance with `npm run dev -- --port 5174`
      // or VITE_PORT in the env file.
      port: Number(env.VITE_PORT ?? 5173),
      strictPort: true,
    },
  };
});
