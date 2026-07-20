import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "選択テキスト整形コピー",
  description: "選択したテキストの余計な改行・空白を整えてクリップボードへコピーします。",
  version: pkg.version,
  permissions: ["contextMenus", "scripting", "activeTab"],
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
