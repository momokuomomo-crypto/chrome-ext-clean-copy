import { beforeEach, describe, expect, it, vi } from "vitest";
import chrome from "sinon-chrome";
import { chromeExtra } from "../setup";

async function loadBackgroundFresh(): Promise<void> {
  vi.resetModules();
  await import("../../src/background");
}

interface ContextMenuInfo {
  menuItemId: string;
  selectionText?: string;
}

interface FakeTab {
  id?: number;
}

function triggerMenuClick(info: ContextMenuInfo, tab?: FakeTab): Promise<void> {
  const listener = chrome.contextMenus.onClicked.addListener.lastCall.args[0] as (
    info: ContextMenuInfo,
    tab?: FakeTab,
  ) => void;
  listener(info, tab);
  return flushMicrotasks();
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const MENU_ID = "clean-copy-selection";

beforeEach(() => {
  chrome.contextMenus.removeAll.callsFake((callback?: () => void) => {
    callback?.();
  });
  chromeExtra.scripting.executeScript.resolves([{ result: undefined }]);
});

describe("background: リスナー登録・contextMenus", () => {
  it("インポート時点で同期的にリスナーを登録する", async () => {
    await loadBackgroundFresh();
    expect(chrome.runtime.onInstalled.addListener.called).toBe(true);
    expect(chrome.contextMenus.onClicked.addListener.called).toBe(true);
  });

  it("インストール時にremoveAll後、selectionコンテキストでメニューを1件登録する", async () => {
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;
    installListener();

    expect(chrome.contextMenus.removeAll.called).toBe(true);
    expect(chrome.contextMenus.create.callCount).toBe(1);
    const createArgs = chrome.contextMenus.create.lastCall.args[0];
    expect(createArgs.id).toBe(MENU_ID);
    expect(createArgs.contexts).toEqual(["selection"]);
    expect(createArgs.documentUrlPatterns).toEqual(["http://*/*", "https://*/*"]);
  });

  it("拡張機能アップデート相当（onInstalledを2回発火）でも重複ID登録エラーを起こさない", async () => {
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;

    installListener();
    installListener();

    expect(chrome.contextMenus.removeAll.callCount).toBe(2);
    expect(chrome.contextMenus.create.callCount).toBe(2);
  });

  it("removeAll失敗（chrome.runtime.lastError）をコンソールへ記録する", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    chrome.contextMenus.removeAll.callsFake((callback?: () => void) => {
      (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = {
        message: "boom",
      };
      callback?.();
      (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = undefined;
    });
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;

    installListener();

    expect(consoleErrorSpy).toHaveBeenCalledWith("contextMenus.removeAll failed", "boom");
    consoleErrorSpy.mockRestore();
  });

  it("create失敗（chrome.runtime.lastError）をコンソールへ記録する", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    chrome.contextMenus.create.callsFake((_options: unknown, callback?: () => void) => {
      (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = {
        message: "duplicate id",
      };
      callback?.();
      (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = undefined;
    });
    await loadBackgroundFresh();
    const installListener = chrome.runtime.onInstalled.addListener.lastCall.args[0] as () => void;

    installListener();

    expect(consoleErrorSpy).toHaveBeenCalledWith("contextMenus.create failed", "duplicate id");
    consoleErrorSpy.mockRestore();
  });
});

describe("background: メニュークリック", () => {
  it("正常なクリックで整形済み文字列をexecuteScriptのargsへ渡す", async () => {
    await loadBackgroundFresh();

    await triggerMenuClick(
      { menuItemId: MENU_ID, selectionText: "line1\nline2" },
      { id: 1 },
    );

    expect(chromeExtra.scripting.executeScript.called).toBe(true);
    const call = chromeExtra.scripting.executeScript.lastCall.args[0];
    expect(call.target).toEqual({ tabId: 1 });
    expect(typeof call.func).toBe("function");
    expect(call.args).toEqual(["line1 line2"]);
  });

  it("空文字選択でも整形結果（空文字）を渡す（クリップボード上書き判定は注入関数側で行う）", async () => {
    await loadBackgroundFresh();

    await triggerMenuClick({ menuItemId: MENU_ID, selectionText: "" }, { id: 1 });

    expect(chromeExtra.scripting.executeScript.called).toBe(true);
    const call = chromeExtra.scripting.executeScript.lastCall.args[0];
    expect(call.args).toEqual([""]);
  });

  it("対象外のmenuItemIdでは何もしない", async () => {
    await loadBackgroundFresh();

    await triggerMenuClick({ menuItemId: "unrelated", selectionText: "text" }, { id: 1 });

    expect(chromeExtra.scripting.executeScript.called).toBe(false);
  });

  it("tab.idが無い場合は何もしない", async () => {
    await loadBackgroundFresh();

    await triggerMenuClick({ menuItemId: MENU_ID, selectionText: "text" }, undefined);

    expect(chromeExtra.scripting.executeScript.called).toBe(false);
  });

  it("executeScriptが失敗（スクリプト注入禁止ページ等）しても例外を外へ伝播させない", async () => {
    chromeExtra.scripting.executeScript.rejects(new Error("Cannot access contents"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadBackgroundFresh();

    await expect(
      triggerMenuClick({ menuItemId: MENU_ID, selectionText: "text" }, { id: 1 }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
