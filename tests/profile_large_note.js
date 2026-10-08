const { performance } = require('perf_hooks');

function splitTableCells(line) {
  let text = String(line || '').trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = []; let current = '', escaped = false, codeTicks = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }
    if (ch === '`') {
      let run = 1; while (i + run < text.length && text[i + run] === '`') run++;
      current += '`'.repeat(run);
      if (codeTicks === 0) codeTicks = run; else if (codeTicks === run) codeTicks = 0;
      i += run - 1; continue;
    }
    if (ch === '|' && codeTicks === 0) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim()); return cells;
}
function isTableSeparator(line) { const cells = splitTableCells(line); return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.trim())); }
function looksLikeTableRow(text) { const t = String(text || '').trim(); return t.includes('|') && !/^(?:```|~~~)/.test(t); }

class MockDoc {
  constructor(lines) {
    this._lines = lines;
    this.lines = lines.length;
    this._starts = new Array(lines.length);
    let pos = 0;
    for (let i = 0; i < lines.length; i++) { this._starts[i] = pos; pos += lines[i].length + 1; }
  }
  line(n) { const i=n-1; const text=this._lines[i]; const from=this._starts[i]; return {text,from,to:from+text.length,number:n}; }
}
function scan(doc) {
  const blocks=[]; const push=(kind,a,b)=>blocks.push({kind,fromLine:a,toLine:b}); let lineNo=1;
  if (doc.lines>=2 && doc.line(1).text.trim()==='---') { let end=0; for(let n=2;n<=Math.min(doc.lines,400);n++){if(doc.line(n).text.trim()==='---'){end=n;break;}} if(end){push('frontmatter',1,end);lineNo=end+1;} }
  while(lineNo<=doc.lines){
    const text=doc.line(lineNo).text;
    const fence=text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if(fence){const marker=fence[1][0],min=fence[1].length;let end=lineNo;for(let n=lineNo+1;n<=doc.lines;n++){end=n;const close=doc.line(n).text.match(/^\s*(`{3,}|~{3,})\s*$/);if(close&&close[1][0]===marker&&close[1].length>=min)break;}push('fence',lineNo,end);lineNo=end+1;continue;}
    if(/^\s*\$\$/.test(text)){let end=lineNo;const same=/^\s*\$\$[\s\S]*\$\$\s*$/.test(text)&&!/^\s*\$\$\s*$/.test(text);if(!same){for(let n=lineNo+1;n<=doc.lines;n++){end=n;if(/\$\$\s*$/.test(doc.line(n).text))break;}}push('math',lineNo,end);lineNo=end+1;continue;}
    if(/^\s*>\s*\[![A-Za-z0-9_-]+\][+-]?/.test(text)){let end=lineNo;while(end<doc.lines&&/^\s*>/.test(doc.line(end+1).text))end++;push('callout',lineNo,end);lineNo=end+1;continue;}
    if(looksLikeTableRow(text)&&lineNo<doc.lines&&isTableSeparator(doc.line(lineNo+1).text)){let end=lineNo+1;while(end<doc.lines&&looksLikeTableRow(doc.line(end+1).text))end++;push('table',lineNo,end);lineNo=end+1;continue;}
    if(/^\[\^([^\]]+)\]:\s*/.test(text)){let end=lineNo;while(end<doc.lines&&/^(?: {2,}|\t)\S?/.test(doc.line(end+1).text))end++;push('footnote',lineNo,end);lineNo=end+1;continue;}
    lineNo++;
  }
  return blocks;
}
function makeLines(n){
  const out=[];
  for(let i=0;i<n;i++){
    if(i%1200===100){out.push('| A | B |','| :-- | --: |','| x | y |');i+=2;continue;}
    if(i%1700===200){out.push('> [!NOTE] Test','> body line','> second line');i+=2;continue;}
    if(i%2200===300){out.push('```js','const x = 1;','```');i+=2;continue;}
    if(i%2600===400){out.push('$$','x^2+y^2','$$');i+=2;continue;}
    out.push(`Paragraph ${i} with **bold** and [[Note ${i%100}]].`);
  }
  return out.slice(0,n);
}
for (const n of [1000,10000,50000]) {
  const doc=new MockDoc(makeLines(n));
  for(let i=0;i<3;i++) scan(doc);
  const times=[];
  for(let i=0;i<15;i++){const t=performance.now();scan(doc);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);
  const median=times[Math.floor(times.length/2)], p95=times[Math.floor(times.length*0.95)];
  console.log(JSON.stringify({lines:n,medianMs:+median.toFixed(3),p95Ms:+p95.toFixed(3),blocks:scan(doc).length}));
}
