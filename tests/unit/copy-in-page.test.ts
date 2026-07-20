import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextInPage } from "../../src/inject/copy-in-page";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getToastText(): string | undefined {
  const host = document.documentElement.querySelector("div");
  return host?.shadowRoot?.textContent ?? undefined;
}

let originalClipboard: Clipboard | undefined;
let originalExecCommand: typeof document.execCommand;

beforeEach(() => {
  originalClipboard = (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  originalExecCommand = document.execCommand;
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  } else {
    delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  }
  document.execCommand = originalExecCommand;
  document.querySelectorAll("textarea").forEach((el) => el.remove());
  document.documentElement.querySelectorAll("div").forEach((el) => el.remove());
});

describe("copyTextInPage", () => {
  it("空文字の場合はクリップボードへ触れず「コピー対象がありません」を表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    copyTextInPage("");
    await flushMicrotasks();

    expect(writeText).not.toHaveBeenCalled();
    expect(getToastText()).toBe("コピー対象がありません");
  });

  it("Clipboard APIが成功すれば「整えてコピーしました」を表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(writeText).toHaveBeenCalledWith("hello world");
    expect(getToastText()).toBe("整えてコピーしました");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("Clipboard APIが拒否されればexecCommandへフォールバックする", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const execCommandSpy = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandSpy;

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(getToastText()).toBe("整えてコピーしました");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("Clipboard APIもexecCommandも失敗すれば失敗トーストを表示する", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(getToastText()).toBe("コピーできませんでした");
  });

  it("execCommandフォールバック中にappendChildが例外を投げても、未処理rejectionにならず失敗トーストを表示する", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {
      throw new Error("appendChild not allowed");
    });

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(getToastText()).toBe("コピーできませんでした");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    appendChildSpy.mockRestore();
  });

  it("navigator.clipboard自体が存在しない場合（非セキュアコンテキスト等）はexecCommandへフォールバックする", async () => {
    delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
    const execCommandSpy = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandSpy;

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(getToastText()).toBe("整えてコピーしました");
  });

  it("document.bodyが無い文書でもdocumentElementへフォールバックしてコピーを試みる", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const execCommandSpy = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandSpy;
    const bodyGetterSpy = vi.spyOn(document, "body", "get").mockReturnValue(null as never);

    copyTextInPage("hello world");
    await flushMicrotasks();

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(getToastText()).toBe("整えてコピーしました");
    bodyGetterSpy.mockRestore();
  });

  it("トーストはShadow DOM内に生成され、一定時間後に削除される", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    copyTextInPage("hello world");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.documentElement.querySelectorAll("div")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2100);
    expect(document.documentElement.querySelectorAll("div")).toHaveLength(0);

    vi.useRealTimers();
  });
});
