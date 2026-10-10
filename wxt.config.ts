import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AttentionFlow",
    description: "本地重建 Linux DO 注意力流",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://linux.do/*"],
    action: { default_title: "打开 AttentionFlow" },
  },
});
