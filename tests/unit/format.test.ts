import { describe, expect, it } from "vitest";
import {
  cleanText,
  collapseAndTrimLine,
  isCjkChar,
  joinTwoLines,
  normalizeNewlines,
  removeSoftHyphen,
} from "../../src/shared/format";

describe("normalizeNewlines", () => {
  it("CRLF・CRをLFへ統一する", () => {
    expect(normalizeNewlines("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  it("改ページ文字(\\f)を改行として扱う", () => {
    expect(normalizeNewlines("a\fb")).toBe("a\nb");
  });
});

describe("collapseAndTrimLine", () => {
  it("行内の連続する半角スペース・タブを1個へ正規化する", () => {
    expect(collapseAndTrimLine("a\t\t  b")).toBe("a b");
  });

  it("NBSP・figure space・narrow NBSP・全角スペースも正規化する", () => {
    const nbsp = String.fromCharCode(0x00a0);
    const figureSpace = String.fromCharCode(0x2007);
    const narrowNbsp = String.fromCharCode(0x202f);
    const fullWidthSpace = String.fromCharCode(0x3000);
    expect(collapseAndTrimLine(`a${nbsp}${figureSpace}${narrowNbsp}${fullWidthSpace}b`)).toBe(
      "a b",
    );
  });

  it("行頭・行末の水平空白を除去する", () => {
    expect(collapseAndTrimLine("   hello   ")).toBe("hello");
  });

  it("空白のみの行は空文字になる", () => {
    expect(collapseAndTrimLine("   \t  ")).toBe("");
  });
});

describe("removeSoftHyphen", () => {
  it("soft hyphen(U+00AD)を除去する", () => {
    const softHyphen = String.fromCharCode(0x00ad);
    expect(removeSoftHyphen(`hyphen${softHyphen}ation`)).toBe("hyphenation");
  });
});

describe("isCjkChar", () => {
  it("漢字・ひらがな・カタカナ・ハングルをCJKと判定する", () => {
    expect(isCjkChar("漢")).toBe(true);
    expect(isCjkChar("ひ")).toBe(true);
    expect(isCjkChar("カ")).toBe(true);
    expect(isCjkChar("한")).toBe(true);
  });

  it("英数字・記号・絵文字はCJKと判定しない", () => {
    expect(isCjkChar("a")).toBe(false);
    expect(isCjkChar("1")).toBe(false);
    expect(isCjkChar("-")).toBe(false);
    expect(isCjkChar("😀")).toBe(false);
  });

  it("空文字はCJKと判定しない", () => {
    expect(isCjkChar("")).toBe(false);
  });

  it("日本語の括弧・句読点はCJKとして扱う（Script=Commonのため見落としやすい）", () => {
    expect(isCjkChar("」")).toBe(true);
    expect(isCjkChar("「")).toBe(true);
    expect(isCjkChar("。")).toBe(true);
    expect(isCjkChar("、")).toBe(true);
  });
});

describe("joinTwoLines", () => {
  it("通常の英文折り返しは半角スペースで連結する", () => {
    expect(joinTwoLines("hello", "world")).toBe("hello world");
  });

  it("行末が可視ハイフン・次行が英字始まりなら改行のみ除去しハイフンは残す", () => {
    expect(joinTwoLines("state-", "of")).toBe("state-of");
  });

  it("ハイフン自体は自動削除しない（複合語かどうか機械的に判別できないため）", () => {
    expect(joinTwoLines("hyphen-", "nation")).toBe("hyphen-nation");
  });

  it("行末ハイフンでも次行が英字始まりでなければ通常のスペース連結にする", () => {
    expect(joinTwoLines("state-", "1つ")).toBe("state- 1つ");
  });

  it("前後どちらかがCJK文字ならスペース無しで連結する", () => {
    expect(joinTwoLines("こんにちは", "世界")).toBe("こんにちは世界");
    expect(joinTwoLines("hello", "世界")).toBe("hello世界");
    expect(joinTwoLines("こんにちは", "world")).toBe("こんにちはworld");
  });

  it("片方が空文字ならもう片方をそのまま返す", () => {
    expect(joinTwoLines("", "next")).toBe("next");
    expect(joinTwoLines("prev", "")).toBe("prev");
  });

  it("行末のsoft hyphenは改行を除去しつつ単語を直接連結する（スペースを入れない）", () => {
    const softHyphen = String.fromCharCode(0x00ad);
    expect(joinTwoLines(`hyphen${softHyphen}`, "ation")).toBe("hyphenation");
  });

  it("行の前後がどちらも句読点・括弧（Han/Hiragana等の文字に接していない）でもスペースを入れない", () => {
    // 「た。」で終わる行の直後に「「」で始まる行が続く、引用が連続する
    // ケース。両端ともScript=Commonの記号のみで、Unicode Scriptだけの
    // 判定だと見落としてスペースを挿入してしまっていた（Stage2査読での
    // major指摘）。
    expect(joinTwoLines("そう言った。", "「はい」と答えた。")).toBe(
      "そう言った。「はい」と答えた。",
    );
  });

  it("補助漢字面（サロゲートペアで表現される漢字）が行境界にあってもCJKと判定する", () => {
    // prev.slice(-1)/next.charAt(0)はUTF-16コード単位で切り出すため、
    // サロゲートペアの片方だけを取り出してしまい判定が壊れていた
    // （Stage5実装レビューでのmajor指摘）。𠮷はU+20BB7（補助漢字面）。
    expect(joinTwoLines("𠮷", "𠮷")).toBe("𠮷𠮷"); // 両方CJK（補助漢字面）ならスペース無し
    expect(joinTwoLines("これは", "𠮷です")).toBe("これは𠮷です");
    // 片方がラテン文字でも、もう片方が補助漢字面のCJKならスペース無し
    // （前後どちらかがCJKであればスペース無しという既定のOR条件どおり）。
    expect(joinTwoLines("Smith", "𠮷")).toBe("Smith𠮷");
  });

  it("優先順位の交差ケース：soft hyphen行の直後がCJKでもソフトハイフン結合が優先される", () => {
    const softHyphen = String.fromCharCode(0x00ad);
    expect(joinTwoLines(`日本語${softHyphen}`, "です")).toBe("日本語です");
  });

  it("優先順位の交差ケース：可視ハイフン行の直後がCJKなら通常のハイフン規則は適用されずCJK結合になる", () => {
    // 次行の先頭が英字でないため、可視ハイフン規則（次行が英字始まり）は
    // 発火せず、CJK隣接規則が適用される。
    expect(joinTwoLines("state-", "日本語")).toBe("state-日本語");
  });
});

describe("cleanText（統合的な整形パイプライン）", () => {
  it("単一行はそのまま返す", () => {
    expect(cleanText("hello world")).toBe("hello world");
  });

  it("英文の折り返し（単一改行）をスペースで連結する", () => {
    expect(cleanText("This is a\nsentence.")).toBe("This is a sentence.");
  });

  it("日本語の折り返し（単一改行）をスペース無しで連結する", () => {
    expect(cleanText("これは\n日本語です。")).toBe("これは日本語です。");
  });

  it("2個以上の連続改行は段落区切り（空行1行）として維持する", () => {
    expect(cleanText("段落1\n\n段落2")).toBe("段落1\n\n段落2");
    expect(cleanText("段落1\n\n\n\n段落2")).toBe("段落1\n\n段落2");
  });

  it("空白だけの行を挟む改行も段落区切りとして扱う", () => {
    expect(cleanText("段落1\n   \n段落2")).toBe("段落1\n\n段落2");
  });

  it("行末ハイフンによる英単語分割を結合する", () => {
    expect(cleanText("This is a state-\nof-the-art system.")).toBe(
      "This is a state-of-the-art system.",
    );
  });

  it("行末のsoft hyphenで折り返された単語をスペース無しで結合する", () => {
    const softHyphen = String.fromCharCode(0x00ad);
    expect(cleanText(`This is a hyphen${softHyphen}\nation example.`)).toBe(
      "This is a hyphenation example.",
    );
  });

  it("先頭・末尾の空白・改行を除去する", () => {
    expect(cleanText("\n\n  hello world  \n\n")).toBe("hello world");
  });

  it("空文字・空白のみの入力は空文字を返す", () => {
    expect(cleanText("")).toBe("");
    expect(cleanText("   \n\n\t  ")).toBe("");
  });

  it("絵文字・サロゲートペアを保持する", () => {
    expect(cleanText("こんにちは😀🎉世界")).toBe("こんにちは😀🎉世界");
  });

  it("詩・箇条書き等、改行に意味がある文章も仕様どおり変換される（既知の制約の回帰テスト）", () => {
    // 詩の各行は単一改行のみで区切られているため、通常の折り返しと
    // 区別できず1行へ結合される。これは凍結設計で受け入れた既知の制約
    // であり、通常のブラウザコピー（メニューを使わない）がオプトアウト
    // 手段となる。
    const poem = "春は\nあけぼの\nやうやう白くなりゆく";
    expect(cleanText(poem)).toBe("春はあけぼのやうやう白くなりゆく");
  });

  it("日本語の複数段落を正しく処理する", () => {
    const input = "これは最初の\n段落です。\n\nこれは2番目の\n段落です。";
    expect(cleanText(input)).toBe("これは最初の段落です。\n\nこれは2番目の段落です。");
  });

  it("PDF由来のsoft hyphenと全角スペースを含む文章を整形する", () => {
    const softHyphen = String.fromCharCode(0x00ad);
    const fullWidthSpace = String.fromCharCode(0x3000);
    const input = `hy${softHyphen}phen${fullWidthSpace}${fullWidthSpace}ation`;
    expect(cleanText(input)).toBe("hyphen ation");
  });
});
