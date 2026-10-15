// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Cinzel",
      cssVariable: "--font-cinzel",
      weights: [600, 700],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Lora",
      cssVariable: "--font-lora",
      weights: [400, 600, 700],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["serif"],
    },
  ],
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
