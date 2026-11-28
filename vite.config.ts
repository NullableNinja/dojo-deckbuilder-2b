import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
  const pagesBase = repositoryName ? `/${repositoryName}/` : "/dojo-deckbuilder/";

  return {
    base: mode === "offline" ? "./" : pagesBase,
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // Do not force app/playtest.tsx into a named group: a group pulls every module it shares
            // with the entry (card catalog, art map, rules JSON) into that chunk, so the Home page then
            // downloads the whole game runtime. The lazy import("./playtest") already names its chunk.
            groups: [
              {
                name: "structured-effects",
                test: /app[\\/]data[\\/]card-effects\.json$/,
                priority: 20,
              },
            ],
          },
        },
      },
    },
  };
});
