/**
 * Unit tests for Markdown and LaTeX rendering in Obsidian QuickView
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser environment for test
global.marked = require('../static/marked.min.js');
global.hljs = require('../static/highlight.min.js');
global.katex = require('../static/katex.min.js');

// Configure marked link renderer to match app.js
global.marked.use({
  renderer: {
    link(href, title, text) {
      let linkHref = typeof href === 'object' && href ? href.href : href;
      let linkTitle = typeof href === 'object' && href ? href.title : title;
      let linkText = typeof href === 'object' && href ? href.text : text;

      const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
      if (linkHref && linkHref.startsWith('#')) {
        return `<a href="${linkHref}"${titleAttr}>${linkText}</a>`;
      }
      return `<a href="${linkHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${linkText}</a>`;
    }
  }
});
global.marked.setOptions({ gfm: true, breaks: true });

// Load renderMarkdown logic from app.js
const appJsContent = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');

// Extract renderLatex and renderMarkdown functions
const renderLatexMatch = appJsContent.match(/function renderLatex[\s\S]*?\n  \}/);
const renderMarkdownMatch = appJsContent.match(/function renderMarkdown[\s\S]*?\n  \}/);

if (!renderLatexMatch || !renderMarkdownMatch) {
  throw new Error('Could not extract renderLatex or renderMarkdown from app.js');
}

const renderLatex = new Function('latex', 'isBlock', 'katex', `
  ${renderLatexMatch[0]}
  return renderLatex(latex, isBlock);
`).bind(null);

const renderMarkdown = new Function('rawMd', 'currentNotePath', 'marked', 'katex', 'renderLatex', `
  ${renderMarkdownMatch[0]}
  return renderMarkdown(rawMd, currentNotePath);
`).bind(null);

function runTests() {
  console.log('Running LaTeX and Markdown rendering tests...');

  // Test 1: Block Math single-line
  {
    const md = 'Công thức: $$E = mc^2$$';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="math-block"'), 'Test 1 Failed: math-block class missing');
    assert(html.includes('class="katex-display"'), 'Test 1 Failed: katex-display missing');
    assert(!html.includes('$$E = mc^2$$'), 'Test 1 Failed: raw $$ was not replaced');
    console.log('✔ Test 1: Block Math single-line passed');
  }

  // Test 2: Block Math multi-line with $$ \n {content} \n $$
  {
    const md = `
# Toán học
$$
\\begin{aligned}
f(x) &= x^2 + 2x + 1 \\\\
&= (x + 1)^2
\\end{aligned}
$$
Kết thúc.
    `.trim();
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="math-block"'), 'Test 2 Failed: math-block class missing');
    assert(html.includes('class="katex-display"'), 'Test 2 Failed: katex-display missing');
    assert(html.includes('mtable'), 'Test 2 Failed: mtable from aligned missing');
    console.log('✔ Test 2: Block Math multi-line ($$\\n...\\n$$) passed');
  }

  // Test 3: Block Math with spaces before newline ($$ \\n {content} $$)
  {
    const md = '$$ \n \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \n $$';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="math-block"'), 'Test 3 Failed: math-block class missing');
    assert(html.includes('sqrt'), 'Test 3 Failed: sqrt symbol missing');
    console.log('✔ Test 3: Block Math with spaces ($$ \\n {content} $$) passed');
  }

  // Test 4: Inline Math $...$
  {
    const md = 'Cho hàm số $f(x) = ax + b$ với $a \\ne 0$.';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="math-inline"'), 'Test 4 Failed: math-inline class missing');
    assert(!html.includes('$f(x) = ax + b$'), 'Test 4 Failed: raw inline math not replaced');
    console.log('✔ Test 4: Inline Math ($...$) passed');
  }

  // Test 5: Code block containing $$ should NOT be rendered as math
  {
    const md = `
\`\`\`bash
echo "$$"
echo "$VAR"
\`\`\`
    `.trim();
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('<pre><code'), 'Test 5 Failed: code block missing');
    assert(html.includes('$$'), 'Test 5 Failed: raw $$ inside code block was mangled');
    assert(!html.includes('class="math-block"'), 'Test 5 Failed: math-block should not appear in code block');
    console.log('✔ Test 5: Code block containing $$ preserved passed');
  }

  // Test 6: Inline code containing $ or $$ should NOT be rendered as math
  {
    const md = 'Biến `$foo$` và chuỗi `$$bar$$`.';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('<code>$foo$</code>'), 'Test 6 Failed: inline code $foo$ mangled');
    assert(html.includes('<code>$$bar$$</code>'), 'Test 6 Failed: inline code $$bar$$ mangled');
    assert(!html.includes('class="math-inline"'), 'Test 6 Failed: math-inline should not appear in inline code');
    console.log('✔ Test 6: Inline code containing $ preserved passed');
  }

  // Test 7: Currency expressions should NOT be rendered as math
  {
    const md = 'Giá từ $100 đến $200 cho dịch vụ.';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('$100'), 'Test 7 Failed: $100 currency missing');
    assert(html.includes('$200'), 'Test 7 Failed: $200 currency missing');
    assert(!html.includes('class="math-inline"'), 'Test 7 Failed: currency should not be math-inline');
    console.log('✔ Test 7: Currency expressions preserved passed');
  }

  // Test 8: Callout containing math block
  {
    const md = `
> [!NOTE] Định lý Pytago
> Trong tam giác vuông:
> $$
> a^2 + b^2 = c^2
> $$
    `.trim();
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="callout callout-note"'), 'Test 8 Failed: callout missing');
    assert(html.includes('class="math-block"'), 'Test 8 Failed: math-block missing inside callout');
    console.log('✔ Test 8: Callout containing math block passed');
  }

  // Test 9: Image embed ![[image.png]] wrapped in link with target="_blank"
  {
    const md = 'Ảnh minh họa: ![[diagram.png|400]]';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="image-embed-link"'), 'Test 9 Failed: image-embed-link class missing');
    assert(html.includes('target="_blank"'), 'Test 9 Failed: target="_blank" missing on image link');
    assert(html.includes('href="/vault/diagram.png"'), 'Test 9 Failed: href pointing to /vault/diagram.png missing');
    assert(html.includes('width="400"'), 'Test 9 Failed: width="400" attribute missing');
    console.log('✔ Test 9: Image embed wrapped in new-tab link passed');
  }

  // Test 10: PDF embed ![[document.pdf]] with target="_blank"
  {
    const md = 'Tài liệu đính kèm: ![[sample.pdf]]';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="embed-box"'), 'Test 10 Failed: embed-box class missing');
    assert(html.includes('href="/vault/sample.pdf"'), 'Test 10 Failed: pdf href missing');
    assert(html.includes('target="_blank"'), 'Test 10 Failed: target="_blank" missing for pdf embed');
    console.log('✔ Test 10: PDF embed with new-tab link passed');
  }

  // Test 11: Wikilink to PDF/media [[doc.pdf|Xem PDF]] rendered as anchor with target="_blank"
  {
    const md = 'Xem thêm [[report.pdf|Báo cáo chi tiết]] và [[photo.jpg]].';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('class="wikilink wikilink-attachment"'), 'Test 11 Failed: wikilink-attachment class missing');
    assert(html.includes('href="/vault/report.pdf"'), 'Test 11 Failed: href missing on attachment wikilink');
    assert(html.includes('target="_blank"'), 'Test 11 Failed: target="_blank" missing on attachment wikilink');
    assert(html.includes('>Báo cáo chi tiết</a>'), 'Test 11 Failed: alias text missing');
    assert(html.includes('href="/vault/photo.jpg"'), 'Test 11 Failed: href for photo.jpg missing');
    console.log('✔ Test 11: Wikilink to attachments rendered as new-tab link passed');
  }

  // Test 12: Standard note wikilink [[Note]] remains as span
  {
    const md = 'Chuyển sang [[Ghi chú khác|Chi tiết]].';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('<span class="wikilink" data-target="Ghi chú khác">Chi tiết</span>'), 'Test 12 Failed: note wikilink should remain span');
    console.log('✔ Test 12: Standard note wikilink preserved passed');
  }

  // Test 13: Standard markdown link [text](url) rendered with target="_blank"
  {
    const md = 'Truy cập [Google](https://google.com) để tìm kiếm.';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>'), 'Test 13 Failed: [text](url) missing target="_blank"');
    console.log('✔ Test 13: Standard markdown link [text](url) with target="_blank" passed');
  }

  // Test 14: Plain autolink URL rendered with target="_blank"
  {
    const md = 'Tham khảo tài liệu tại https://github.com/markedjs/marked.';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('href="https://github.com/markedjs/marked"'), 'Test 14 Failed: autolink href missing');
    assert(html.includes('target="_blank"'), 'Test 14 Failed: autolink target="_blank" missing');
    assert(html.includes('rel="noopener noreferrer"'), 'Test 14 Failed: autolink rel missing');
    console.log('✔ Test 14: Plain autolink URL with target="_blank" passed');
  }

  // Test 15: Internal heading anchor [Heading](#heading) does not have target="_blank"
  {
    const md = 'Chuyển đến [Mục 1](#muc-1).';
    const html = renderMarkdown(md, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));
    assert(html.includes('<a href="#muc-1">Mục 1</a>'), 'Test 15 Failed: internal anchor should not have target="_blank"');
    console.log('✔ Test 15: Internal heading anchor preserved passed');
  }

  console.log('\nAll 15 tests passed successfully! 🎉');
}

runTests();
