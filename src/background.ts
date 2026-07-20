import { cleanText } from "./shared/format";
import { copyTextInPage } from "./inject/copy-in-page";

const MENU_ID = "clean-copy-selection";

// 拡張機能の更新（reason: "update"）時、removeAll()を挟まずcreate()を
// 呼ぶと既存の同一IDメニューと衝突し得るため、先に全削除してから登録する。
// それぞれのコールバックでchrome.runtime.lastErrorを確認し、失敗を
// 無言で見逃さない（姉妹拡張で確立済みのパターン）。
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("contextMenus.removeAll failed", chrome.runtime.lastError.message);
    }
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: "選択テキストを整えてコピー",
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("contextMenus.create failed", chrome.runtime.lastError.message);
        }
      },
    );
  });
});

async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (info.menuItemId !== MENU_ID) return;
  if (tab?.id === undefined) return;

  const selectionText = info.selectionText ?? "";

  try {
    const cleaned = cleanText(selectionText);

    // chrome.scripting.executeScriptはfuncを文字列化して対象コンテキストで
    // 再実行するため、値はargs経由で渡す（クロージャ参照は不可）。
    // 整形結果が空文字列の場合の判定・トースト出し分けは注入関数側で行う
    // （クリップボードを上書きしないという凍結設計どおり）。
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyTextInPage,
      args: [cleaned],
    });
  } catch (error) {
    // 保護ページ等、スクリプト注入自体が拒否される場合、ページ内
    // フィードバックを出す手段が無いためコンソールへ記録するのみとする。
    console.error("clean copy failed", error);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});
