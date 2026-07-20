// 整形規則は凍結設計（Stage1設計・Stage2査読）で確定した12ステップを
// この順序で適用する。詳細な理由は各ステップのコメントを参照。
//
// 注意：ルール7（単一改行→スペース）・8（CJK隣接→連結）・9（ハイフン→
// 連結）は、文字列全体への独立した逐次正規表現パスとして実装しては
// いけない。7を先に適用すると改行そのものが消え、8・9が判定対象を
// 失って機能しなくなる（Stage2設計査読でのblocker指摘）。実装では
// 改行1箇所ごとに「ソフトハイフン→可視ハイフン→CJK→既定のスペース」の
// 優先順位で判定する単一のjoinTwoLines()関数を用いる。

// ステップ1・2：CRLF/CRをLFへ統一し、改ページ文字(\f)も改行として扱う。
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\f/g, "\n");
}

// タブ・半角スペース・NBSP(U+00A0)・figure space(U+2007)・
// narrow NBSP(U+202F)・全角スペース(U+3000)を「水平空白」として扱う。
const HORIZONTAL_WHITESPACE_CLASS = "[\\t \\u00A0\\u2007\\u202F\\u3000]";
const HORIZONTAL_WHITESPACE_RUN = new RegExp(`${HORIZONTAL_WHITESPACE_CLASS}+`, "g");

// ステップ3・4：行内の水平空白の連続を半角スペース1個へ正規化してから、
// 行頭・行末の水平空白を除去する（この2操作は可換であり、結果は
// 設計文書が列挙する順序と同一になる）。ソフトハイフン(U+00AD)は
// 水平空白ではないためここでは除去しない（joinTwoLines内で改行結合の
// 信号として使うため。Stage2査読でのminor指摘に対応）。
export function collapseAndTrimLine(line: string): string {
  return line.replace(HORIZONTAL_WHITESPACE_RUN, " ").trim();
}

const SOFT_HYPHEN = String.fromCharCode(0x00ad);

// 改行に隣接しない（＝単語の途中に紛れ込んだだけの）ソフトハイフンを
// 除去する最終パス。改行に隣接するソフトハイフンはjoinTwoLines内で
// 個別に処理済みのため、ここで二重処理しても実害はない
// （既に除去済みで対象が残っていないだけ）。
export function removeSoftHyphen(text: string): string {
  return text.split(SOFT_HYPHEN).join("");
}

const CJK_SCRIPT_CHAR = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;

// Unicode ScriptプロパティのHan/Hiragana/Katakana/Hangulだけでは、
// 日本語の句読点・括弧類（「」『』、。等）がScript=Commonのため判定漏れ
// する（Stage2設計査読でのmajor指摘）。頻出する日本語の括弧・句読点を
// 明示的に含める。波ダッシュ・三点リーダー・全角コロン/セミコロンも
// 日本語文章で頻出するため追加する（Stage5実装レビューでの指摘に対応）。
// 全角英数字まで広げると英字を誤ってCJK扱いしてしまうため、そこまでは
// 広げない。
const CJK_PUNCTUATION_CHAR = /[、。「」『』【】（）・ー！？，．〜…：；]/;

export function isCjkChar(char: string): boolean {
  if (char.length === 0) return false;
  return CJK_SCRIPT_CHAR.test(char) || CJK_PUNCTUATION_CHAR.test(char);
}

// 単一改行で区切られた2行を1行へ結合する際の優先順位判定。
// 1. 直前行が改行直前でソフトハイフンで終わる場合、ソフトハイフンを
//    除去して直接連結する（スペースを入れない）。ソフトハイフンは
//    「ここで折り返した」という信号であり、除去後に空白を残すと
//    誤って単語を分断してしまう（Stage2設計査読でのminor指摘に対応）。
// 2. 行末が可視ASCIIハイフンで次行が英字始まりなら、改行だけ除去し
//    ハイフンは残す（state-\nof -> state-of）。ハイフン自体の自動削除は
//    行わない（hyphen-\nation -> hyphen-ation、hyphenationにはしない。
//    機械的に複合語か組版都合か判別できないため保守的に扱う）。
// 3. 前後どちらかがCJK文字（漢字・ひらがな・カタカナ・ハングル・
//    日本語の主要な括弧句読点）ならスペース無しで連結する。
// 4. それ以外は半角スペース1個を挟んで連結する（通常の折り返し）。
// 補足：規則2（可視ハイフン）は「次行が英字始まり」の場合のみ発火する。
// 次行がCJK文字始まりの場合（例："state-"の次行が"日本語"）は規則2が
// 不発となり規則3（CJK隣接）が適用され、ハイフンを保持したままスペース
// 無しで連結される（"state-日本語"）。英単語とCJKが混在する行末表現の
// 妥当な既定挙動として受け入れる。
// prev.slice(-1)/next.charAt(0)はUTF-16コード単位で切り出すため、
// 補助漢字面（サロゲートペアで表現される、より稀な漢字）の文字を
// 分断してしまい、CJK判定が機能しなくなる（Stage5実装レビューでの
// major指摘）。Array.fromによるコードポイント単位のイテレーションで
// 取得する。
function lastCodePointChar(text: string): string {
  const chars = Array.from(text);
  return chars.length > 0 ? chars[chars.length - 1]! : "";
}

function firstCodePointChar(text: string): string {
  const chars = Array.from(text);
  return chars.length > 0 ? chars[0]! : "";
}

export function joinTwoLines(prev: string, next: string): string {
  if (prev.length === 0) return next;
  if (next.length === 0) return prev;

  if (prev.endsWith(SOFT_HYPHEN)) {
    return prev.slice(0, -1) + next;
  }

  const prevLastChar = lastCodePointChar(prev);
  const nextFirstChar = firstCodePointChar(next);

  if (prevLastChar === "-" && /[A-Za-z]/.test(nextFirstChar)) {
    return prev + next;
  }

  if (isCjkChar(prevLastChar) || isCjkChar(nextFirstChar)) {
    return prev + next;
  }

  return `${prev} ${next}`;
}

// ステップ7〜10：段落内の単一改行を、上記の優先順位で1行へ結合する。
export function joinParagraphLines(paragraph: string): string {
  const lines = paragraph.split("\n");
  let result = lines[0] ?? "";
  for (let i = 1; i < lines.length; i++) {
    result = joinTwoLines(result, lines[i]!);
  }
  return result;
}

// ステップ6：2個以上の連続改行を段落区切りとみなす。
function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/);
}

// ステップ12：段落区切り（\n\n）以外に残った連続半角スペースを1個へ正規化する。
function collapseRemainingSpaces(text: string): string {
  return text.replace(/ {2,}/g, " ");
}

export function cleanText(input: string): string {
  const withNormalizedNewlines = normalizeNewlines(input);
  const perLineProcessed = withNormalizedNewlines
    .split("\n")
    .map(collapseAndTrimLine)
    .join("\n");

  // ソフトハイフンの全体除去は行結合処理の「後」に行う。行結合処理内で
  // 「行末のソフトハイフン」を折り返し信号として使うため
  // （Stage2査読でのminor指摘に対応）。
  const paragraphs = splitIntoParagraphs(perLineProcessed)
    .map(joinParagraphLines)
    .map(removeSoftHyphen)
    .filter((paragraph) => paragraph.length > 0);

  // ステップ11：文書全体の先頭・末尾の空白・改行を除去する
  // （空段落のフィルタリングと.trim()の両方で担保する）。
  const joined = paragraphs.join("\n\n").trim();
  return collapseRemainingSpaces(joined);
}
