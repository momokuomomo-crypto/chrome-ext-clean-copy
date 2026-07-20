import chrome from "sinon-chrome";
import sinon from "sinon";
import { afterEach, beforeEach } from "vitest";

// sinon-chromeが提供するグローバルchrome APIフェイクを、テスト実行環境へ注入する。
(globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;

// sinon-chrome(v3.0.1)はManifest V3で追加されたchrome.scriptingを持たない。
// 本拡張機能はexecuteScriptのみ使うため、最小限の手書きスタブを追加する。
// chrome.flush()の対象外なので、履歴・振る舞いのリセットはbeforeEachで
// 個別に行う。
export interface ScriptingExtras {
  scripting: {
    executeScript: sinon.SinonStub;
  };
}

export const chromeExtra = chrome as unknown as ScriptingExtras;
chromeExtra.scripting = {
  executeScript: sinon.stub(),
};

beforeEach(() => {
  chrome.flush();
  chromeExtra.scripting.executeScript.reset();
});

afterEach(() => {
  chrome.flush();
});
