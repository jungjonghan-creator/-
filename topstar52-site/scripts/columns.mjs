// 칼럼 원본(columns/YYYY-MM-DD-슬러그.md) 읽기 — check.mjs · build.mjs 공용 (외부 패키지 없음)
import fs from 'node:fs';
import path from 'node:path';

export const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const PUBLISH_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$/;
export const AUDIENCES = {
  '손님': { list: 'consumer', category: '손님 이야기' },
  '자녀': { list: 'consumer', category: '부모님 안경' },
  '원장님': { list: 'owner', category: '원장님 운영 이야기' }
};

const unquote = (v) => {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length > 1) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'") && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
  return v;
};

// 앞머리(--- ... ---) 해석: key: 값 / key: + 「- q: …」「  a: …」 목록
export function parseColumn(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const errors = [];
  const data = {}; const lineOf = {};
  if (lines[0].trim() !== '---') return { data, lineOf, body: lines, bodyStart: 1, lines, errors: [{ line: 1, msg: '첫 줄이 「---」가 아님 (앞머리 없음)' }] };
  let end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) { errors.push({ line: 1, msg: '앞머리를 닫는 「---」가 없음' }); end = lines.length; }
  let curKey = null; let curItem = null;
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    let m;
    if ((m = raw.match(/^([A-Za-z_]+):\s*(.*)$/))) {
      curKey = m[1]; curItem = null; lineOf[curKey] = i + 1;
      data[curKey] = m[2].trim() === '' ? [] : unquote(m[2]);
    } else if ((m = raw.match(/^\s*-\s+(.*)$/)) && curKey && Array.isArray(data[curKey])) {
      const kv = m[1].match(/^([A-Za-z_]+):\s*(.*)$/);
      if (kv) { curItem = { [kv[1]]: unquote(kv[2]), _line: i + 1 }; data[curKey].push(curItem); }
      else { curItem = null; data[curKey].push(unquote(m[1])); }
    } else if ((m = raw.match(/^\s+([A-Za-z_]+):\s*(.*)$/)) && curItem) {
      curItem[m[1]] = unquote(m[2]);
    } else errors.push({ line: i + 1, msg: `앞머리 줄을 읽을 수 없음: ${raw.trim()}` });
  }
  return { data, lineOf, body: lines.slice(end + 1), bodyStart: end + 2, lines, errors };
}

export function readColumns(root) {
  const dir = path.join(root, 'columns');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => FILE_RE.test(f)).sort().map((f) => {
    const [, date, slug] = f.match(FILE_RE);
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    return { file: 'columns/' + f, date, slug, text, ...parseColumn(text) };
  });
}

// 평일 07:00(한국 시간)인지
export function isWeekday0700(publishAt) {
  const m = String(publishAt || '').match(PUBLISH_RE);
  if (!m) return false;
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return m[4] === '07' && m[5] === '00' && m[6] === '00' && dow >= 1 && dow <= 5;
}

// 아주 작은 마크다운 → HTML (## 소제목 · ### · - 목록 · 1. 목록 · > 인용 · **굵게** · [글](주소))
export function mdToHtml(lines, { esc, link }) {
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, u) => {
      const raw = u.replace(/&amp;/g, '&');
      const ext = /^https?:/.test(raw);
      return `<a href="${ext ? esc(raw) : link(raw)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${txt}</a>`;
    });
  const out = []; let para = []; let list = null;
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list) { out.push(`<${list.tag}${list.tag === 'ul' ? ' class="check"' : ''}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  for (const raw of lines.join('\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const l = raw.trim(); let m;
    if (!l) { flush(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { flush(); out.push(m[1].length === 3 ? `<h3>${inline(m[2])}</h3>` : `<h2>${inline(m[2])}</h2>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)$/)) || (m = l.match(/^\d+[.)]\s+(.*)$/))) {
      const tag = /^\d/.test(l) ? 'ol' : 'ul';
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      if (list && list.tag !== tag) flush();
      if (!list) list = { tag, items: [] };
      list.items.push(m[1]); continue;
    }
    if ((m = l.match(/^>\s?(.*)$/))) { flush(); out.push(`<p class="quote">${inline(m[1])}</p>`); continue; }
    if (list) flush();
    para.push(l);
  }
  flush();
  return out.join('\n');
}
