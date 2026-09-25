// lib/zhihu-markdown.js — Markdown → 知乎正文 HTML。
//
// 两件事:用 lute 把 Markdown 渲染成 HTML,再按知乎的口味修一遍结构。
//
// 为什么是 lute(思源笔记的 Markdown 引擎):知乎这边要改的地方,正是思源"复制到
// 知乎"针对的那些,而它的输入就是 lute 的输出。同一套引擎,那些规则才谈得上配套
// —— 换一个渲染器,每条规则都得重新验证一遍。
//
// 知乎吃不下两样东西(规则照搬 s-forge/app/src/protyle/preview/):
//   1. 表格的表头行不能在独立的 <thead> 里,必须并进 <tbody>。
//      (zhihuAdapter.ts: processPreviewElementsZhihuTable)
//   2. 列表项里出现 img / pre / figure / table / blockquote / section,或者列表项里
//      既有嵌套列表又有别的内容时,整个列表会被拆坏 —— 这类列表要"拍平"成
//      段落 + 文字标记。(platformCopy.ts: flattenUnsupportedLists)
// 引用块那条不用做:思源要把连续段落合进同一个 <blockquote>,而 lute 本来就
// 是这么输出的。

import { parseHTML } from "linkedom";

/** 无序列表的标记,按嵌套深度轮换(与思源一致)。 */
const BULLETS = ["•", "◦", "▪", "▫"];

/** 知乎在列表项里消化不了的块级元素。 */
const UNSUPPORTED_IN_LIST = "img, pre, figure, table, blockquote, section";

/** 能跟在同一行里的元素;遇到它们不进新段落。 */
const INLINE = new Set([
  "A", "ABBR", "B", "BR", "CODE", "DEL", "EM", "I", "IMG", "KBD", "MARK", "S",
  "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "WBR",
]);

/** nodeType:元素与文本(linkedom 不导出 Node 常量,直接用数字)。 */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** lute 引擎句柄。3.6MB 的 GopherJS 产物,第一次真的要用时才加载。 */
let engine;

/**
 * 拿到 lute 引擎(惰性,只建一次)。
 * @returns {Promise<object>} lute 引擎
 */
export async function luteEngine() {
  if (engine === undefined) {
    // lute.min.js 是个 IIFE,跑完把 Lute 挂到全局 —— 那是它唯一的用法(见它自带的
    // javascript/demo.js)。取完立刻收进自己的变量,不指望全局一直在。
    // 扩展名必须是 .cjs:lute 是 GopherJS 产物,内部用 require 探测 Node 环境,
    // 而本包 package.json 是 "type": "module" —— 叫 .js 的话会被当成 ESM,
    // require 未定义,加载直接抛 ReferenceError。
    await import("./vendor/lute.cjs");
    engine = globalThis.Lute.New();
  }
  return engine;
}

/**
 * 数字转字母标记(a / A)。
 * @param {number} number 序号
 * @param {boolean} uppercase 是否大写
 * @returns {string} 字母标记
 */
function letter(number, uppercase) {
  let value = Math.max(1, number);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode((uppercase ? 65 : 97) + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

/**
 * 数字转罗马标记;超出 1-3999 退回阿拉伯数字。
 * @param {number} number 序号
 * @returns {string} 罗马标记
 */
function roman(number) {
  if (number < 1 || number > 3999) return String(number);
  const numerals = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let remaining = number;
  let result = "";
  for (const [value, numeral] of numerals) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

/**
 * 有序列表的标记,按嵌套深度换样式(与思源 getPlatformListMarker 一致)。
 * @param {number} number 序号
 * @param {number} depth 嵌套深度
 * @returns {string} 标记
 */
function orderedMarker(number, depth) {
  switch (depth % 6) {
    case 1: return number + ") ";
    case 2: return letter(number, true) + ". ";
    case 3: return letter(number, false) + ". ";
    case 4: return roman(number) + ". ";
    default: return number + ". ";
  }
}

/**
 * 一个列表项的标记。
 * @param {boolean} ordered 是否有序
 * @param {number} number 序号
 * @param {number} depth 嵌套深度
 * @param {boolean|undefined} taskState 任务项状态(true = 已勾选)
 * @returns {string} 标记文本
 */
function listMarker(ordered, number, depth, taskState) {
  if (taskState !== undefined) return taskState ? "✅ " : "▢ ";
  if (!ordered) return BULLETS[depth % BULLETS.length] + " ";
  return orderedMarker(number, depth);
}

/**
 * 列表的直接子项。
 * @param {Element} list 列表
 * @returns {Element[]} 子项
 */
function directItems(list) {
  return Array.from(list.children).filter((child) => child.tagName === "LI");
}

/**
 * 列表项的直接嵌套列表。
 * @param {Element} item 列表项
 * @returns {Element[]} 嵌套列表
 */
function directNestedLists(item) {
  return Array.from(item.children)
    .filter((child) => child.tagName === "OL" || child.tagName === "UL");
}

/**
 * 列表的起始序号。
 * @param {Element} list 列表
 * @returns {number} 起始序号
 */
function listStart(list) {
  const parsed = Number.parseInt(list.getAttribute("start") || "1", 10);
  return Number.isNaN(parsed) ? 1 : parsed;
}

/**
 * 列表项自己的序号(有 value 属性时以它为准)。
 * @param {Element} item 列表项
 * @param {number} fallback 默认序号
 * @returns {number} 序号
 */
function itemValue(item, fallback) {
  const parsed = Number.parseInt(item.getAttribute("value") || "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * 列表项自己的任务框(不含更深层列表里的)。
 * @param {Element} item 列表项
 * @returns {Element|undefined} 复选框
 */
function ownTaskMarker(item) {
  return Array.from(item.querySelectorAll('input[type="checkbox"]'))
    .find((input) => input.closest("li") === item);
}

/**
 * 段落里有没有值得保留的内容。
 * @param {Element} paragraph 段落
 * @returns {boolean} true = 有内容
 */
function hasContent(paragraph) {
  if (paragraph.textContent && paragraph.textContent.trim() !== "") return true;
  return paragraph.querySelector("img") !== null;
}

/**
 * 这个列表项需不需要拍平。
 * @param {Element} item 列表项
 * @returns {boolean} true = 知乎会把它拆坏
 */
function needsFlattening(item) {
  const nested = directNestedLists(item);
  const content = Array.from(item.children).filter((child) =>
    child.tagName !== "OL" && child.tagName !== "UL"
    && !(child.tagName === "INPUT" && child.getAttribute("type") === "checkbox"));
  const hasDirectText = Array.from(item.childNodes).some((node) =>
    node.nodeType === TEXT_NODE && Boolean(node.textContent && node.textContent.trim()));
  const unsupported = content.some((child) =>
    child.matches(UNSUPPORTED_IN_LIST) || child.querySelector(UNSUPPORTED_IN_LIST) !== null);
  const contentCount = content.length + (hasDirectText ? 1 : 0);
  return unsupported || (nested.length > 0 && contentCount > 1);
}

/**
 * 找到包含这个列表的最外层列表。
 * @param {Element} list 列表
 * @param {Element} root 容器
 * @returns {Element} 最外层列表
 */
function outermostList(list, root) {
  let result = list;
  let parent = list.parentElement && list.parentElement.closest("ol, ul");
  while (parent && root.contains(parent)) {
    result = parent;
    parent = parent.parentElement && parent.parentElement.closest("ol, ul");
  }
  return result;
}

/**
 * 深一层的内容缩进一点。
 * @param {Element} element 元素
 * @param {number} depth 深度
 * @returns {void}
 */
function indent(element, depth) {
  if (depth > 0) element.style.marginLeft = (depth * 2) + "em";
}

/**
 * 把标记插到段落最前面。
 * @param {Element} paragraph 段落
 * @param {string} marker 标记
 * @param {number} depth 深度
 * @returns {void}
 */
function prependMarker(paragraph, marker, depth) {
  Array.from(paragraph.querySelectorAll('input[type="checkbox"]'))
    .forEach((input) => input.remove());
  const strong = paragraph.ownerDocument.createElement("strong");
  strong.textContent = marker;
  paragraph.insertBefore(strong, paragraph.firstChild);
  indent(paragraph, depth);
}

/**
 * 把一个列表拍平成"段落 + 文字标记",结果追加进 fragment。
 * @param {Element} list 列表
 * @param {number} depth 嵌套深度
 * @param {DocumentFragment} fragment 输出
 * @returns {void}
 */
function flattenList(list, depth, fragment) {
  const ordered = list.tagName === "OL";
  let number = listStart(list);
  for (const item of directItems(list)) {
    const task = ownTaskMarker(item);
    const itemNumber = itemValue(item, number);
    const marker = listMarker(ordered, itemNumber, depth, task ? task.checked : undefined);
    let markerAdded = false;
    let inline;

    const appendParagraph = (paragraph) => {
      if (!hasContent(paragraph)) return;
      if (!markerAdded) {
        prependMarker(paragraph, marker, depth);
        markerAdded = true;
      } else {
        indent(paragraph, depth + 1);
      }
      fragment.appendChild(paragraph);
    };
    const addMarkerParagraph = () => {
      const empty = item.ownerDocument.createElement("p");
      prependMarker(empty, marker, depth);
      fragment.appendChild(empty);
      markerAdded = true;
    };
    const flushInline = () => {
      if (inline) {
        appendParagraph(inline);
        inline = undefined;
      }
    };

    for (const node of Array.from(item.childNodes)) {
      if (node.nodeType === TEXT_NODE) {
        if (!(node.textContent && node.textContent.trim()) && !inline) continue;
        if (!inline) inline = item.ownerDocument.createElement("p");
        inline.appendChild(node.cloneNode(true));
        continue;
      }
      if (node.nodeType !== ELEMENT_NODE) continue;
      const element = node;
      if (element.tagName === "INPUT" && element.getAttribute("type") === "checkbox") continue;
      if (element.tagName === "OL" || element.tagName === "UL") {
        flushInline();
        if (!markerAdded) addMarkerParagraph();
        flattenList(element, depth + 1, fragment);
        continue;
      }
      if (INLINE.has(element.tagName)) {
        if (!inline) inline = item.ownerDocument.createElement("p");
        inline.appendChild(element.cloneNode(true));
        continue;
      }
      flushInline();
      const clone = element.cloneNode(true);
      if (clone.tagName === "P") {
        appendParagraph(clone);
        continue;
      }
      if (!markerAdded) addMarkerParagraph();
      indent(clone, depth + 1);
      fragment.appendChild(clone);
    }
    flushInline();
    if (!markerAdded) addMarkerParagraph();
    number = itemNumber + 1;
  }
}

/**
 * 按知乎的口味修一遍 HTML 结构。
 *
 * 表格和列表两条规则都在这里落地;引用块不用管(lute 的输出本来就对)。
 * @param {string} html 原始 HTML
 * @returns {string} 适配后的 HTML
 */
export function adaptForZhihu(html) {
  const { document } = parseHTML("<!DOCTYPE html><html><body>" + html + "</body></html>");
  const root = document.body;

  // 表格:表头行搬进 tbody,去掉 thead。
  Array.from(root.querySelectorAll("table")).forEach((table) => {
    const head = table.querySelector("thead");
    if (!head) return;
    const body = table.querySelector("tbody");
    const firstRow = head.firstElementChild;
    if (body) {
      if (firstRow) body.insertAdjacentElement("afterbegin", firstRow);
    } else if (firstRow) {
      const created = document.createElement("tbody");
      created.appendChild(firstRow);
      table.appendChild(created);
    }
    // 顺手把 thead 前后那两段换行空白也去掉,免得正文里留下 <table>\n\n<tbody>。
    const before = head.previousSibling;
    const after = head.nextSibling;
    head.remove();
    for (const node of [before, after]) {
      if (node && node.nodeType === TEXT_NODE && !String(node.textContent).trim()) node.remove();
    }
  });

  // 列表:知乎拆得坏的那种拍平(整棵最外层列表一起拍)。
  const targets = new Set();
  Array.from(root.querySelectorAll("ol, ul")).forEach((list) => {
    if (directItems(list).some(needsFlattening)) targets.add(outermostList(list, root));
  });
  for (const list of targets) {
    if (!root.contains(list)) continue;
    const fragment = document.createDocumentFragment();
    flattenList(list, 0, fragment);
    list.replaceWith(fragment);
  }

  return root.innerHTML;
}

/**
 * 把 Markdown 转成知乎正文 HTML。
 * @param {string} source Markdown 原文
 * @returns {Promise<string>} 知乎可接受的 HTML
 */
export async function markdownToZhihuHtml(source) {
  const lute = await luteEngine();
  return adaptForZhihu(lute.Md2HTML(source));
}
