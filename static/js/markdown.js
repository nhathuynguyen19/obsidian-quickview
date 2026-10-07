/**
 * Obsidian QuickView - Markdown & KaTeX Rendering Engine
 * Handles Obsidian Wikilinks, Embeds, Callouts, and LaTeX Math.
 */

let katexLoadPromise = null;

export function loadKatex() {
  if (typeof katex !== 'undefined') {
    return Promise.resolve(typeof window !== 'undefined' ? window.katex : katex);
  }
  if (katexLoadPromise) {
    return katexLoadPromise;
  }

  katexLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    // 1. Lazy-load KaTeX CSS
    if (!document.querySelector('link[href*="katex.min.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/static/katex.min.css';
      document.head.appendChild(link);
    }

    // 2. Lazy-load KaTeX JS
    const script = document.createElement('script');
    script.src = '/static/katex.min.js';
    script.onload = () => {
      renderPendingMathElements();
      resolve(window.katex);
    };
    script.onerror = (err) => {
      console.error('Failed to lazy-load KaTeX script:', err);
      katexLoadPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return katexLoadPromise;
}

export function renderPendingMathElements() {
  if (typeof katex === 'undefined' || typeof document === 'undefined') return;
  const lazyEls = document.querySelectorAll('.math-lazy');
  lazyEls.forEach((el) => {
    const latex = el.dataset.latex;
    const isBlock = el.dataset.block === 'true';
    if (!latex) return;
    try {
      const rendered = katex.renderToString(latex, {
        displayMode: isBlock,
        throwOnError: false
      });
      el.outerHTML = rendered;
    } catch (e) {
      console.warn('KaTeX render error on lazy element:', e);
    }
  });
}

export function renderLatex(latex, isBlock, customKatex) {
  const k = customKatex || (typeof katex !== 'undefined' ? katex : (typeof window !== 'undefined' ? window.katex : null));
  if (k) {
    try {
      return k.renderToString(latex, {
        displayMode: isBlock,
        throwOnError: false
      });
    } catch (e) {
      console.warn('KaTeX rendering error:', e);
    }
  } else if (typeof window !== 'undefined') {
    if (typeof loadKatex === 'function') {
      loadKatex();
    }
    const escaped = String(latex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<span class="math-lazy" data-latex="${escaped}" data-block="${isBlock}">${isBlock ? '$$' + escaped + '$$' : '$' + escaped + '$'}</span>`;
  }
  const escaped = String(latex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return isBlock
    ? `<pre class="math-block-error"><code>$$${escaped}$$</code></pre>`
    : `<code class="math-inline-error">$${escaped}$</code>`;
}

export function renderMarkdown(rawMd, currentNotePath, customMarked, customKatex, customRenderLatex) {
  let md = rawMd;

  const codeBlocks = [];
  const mathBlocks = [];
  const mathInlines = [];

  // 1. Protect code blocks: ```...``` or ~~~...~~~
  md = md.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const id = codeBlocks.length;
    codeBlocks.push(match);
    return `%%CODEBLOCK_${id}%%`;
  });

  // 2. Protect inline code: `...`
  md = md.replace(/`([^`\n]+?)`/g, (match) => {
    const id = codeBlocks.length;
    codeBlocks.push(match);
    return `%%CODEBLOCK_${id}%%`;
  });

  // 3. Extract Block Math: $$ ... $$ or $$\n ... \n$$
  md = md.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    const id = mathBlocks.length;
    // Strip leading blockquote '>' if present on each line
    const clean = content.replace(/^[ \t]*>[ \t]?/gm, '').trim();
    mathBlocks.push(clean);
    return `%%MATHBLOCK_${id}%%`;
  });

  // 4. Extract Inline Math: $...$
  md = md.replace(/(^|[^\\])\$([^\s\$\n](?:[^\$\n]*?[^\s\$\n])?)\$/g, (match, prefix, content) => {
    const id = mathInlines.length;
    mathInlines.push(content);
    return `${prefix}%%MATHINLINE_${id}%%`;
  });

  // 5. Restore code blocks so marked can parse them normally
  md = md.replace(/%%CODEBLOCK_(\d+)%%/g, (match, id) => {
    return codeBlocks[parseInt(id, 10)];
  });

  const ATTACHMENT_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|mp4|webm|ogv|mp3|wav|ogg|m4a|flac|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|txt|csv)$/i;

  // 6. Process Obsidian Embeds: ![[image.png]] or ![[image.png|300]]
  md = md.replace(/!\[\[(.*?)\]\]/g, (match, inner) => {
    const parts = inner.split('|');
    const filename = parts[0].trim();
    const extra = parts[1] ? `width="${parts[1].trim()}"` : '';
    const isImg = /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(filename);
    if (isImg) {
      return `<a href="/vault/${encodeURI(filename)}" target="_blank" rel="noopener noreferrer" class="image-embed-link" title="Mở ảnh trên tab mới"><img src="/vault/${encodeURI(filename)}" alt="${filename}" ${extra} loading="lazy" onerror="this.onerror=null; this.src='/vault/images/${encodeURI(filename)}';" /></a>`;
    }
    return `<div class="embed-box">📄 Đính kèm: <a href="/vault/${encodeURI(filename)}" target="_blank" rel="noopener noreferrer">${filename}</a></div>`;
  });

  // 7. Process Obsidian Wikilinks: [[Target]] or [[Target|Alias]]
  md = md.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
    const parts = inner.split('|');
    const target = parts[0].trim();
    const alias = parts[1] ? parts[1].trim() : target;
    const targetWithoutAnchor = target.split('#')[0];
    const isAtt = ATTACHMENT_EXT_REGEX.test(targetWithoutAnchor);
    if (isAtt) {
      return `<a class="wikilink wikilink-attachment" href="/vault/${encodeURI(target)}" target="_blank" rel="noopener noreferrer" data-target="${target}">${alias}</a>`;
    }
    return `<span class="wikilink" data-target="${target}">${alias}</span>`;
  });

  // 8. Render HTML via Marked
  const m = customMarked || (typeof marked !== 'undefined' ? marked : null);
  let html = m ? m.parse(md) : md;

  // 9. Process Obsidian Callouts
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|DANGER|TODO|FAQ|SUMMARY|EXAMPLE|QUOTE)\]\s*([^\n<]*)(?:<br\s*\/?>|\n)?([\s\S]*?)<\/p>\s*([\s\S]*?)<\/blockquote>/gis,
    (match, type, title, firstParaRest, remainingBody) => {
      const typeLower = type.toLowerCase();
      const calloutTitle = title ? title.trim() : type.toUpperCase();
      let body = '';
      if (firstParaRest && firstParaRest.trim()) {
        body += `<p>${firstParaRest.trim()}</p>`;
      }
      if (remainingBody && remainingBody.trim()) {
        body += remainingBody.trim();
      }
      return `
        <div class="callout callout-${typeLower}">
          <div class="callout-title">
            <span>📌</span>
            <strong>${calloutTitle}</strong>
          </div>
          <div class="callout-body">${body}</div>
        </div>
      `;
    }
  );

  // 10. Unwrap <p> around block math placeholders
  html = html.replace(/<p>\s*(%%MATHBLOCK_\d+%%)\s*<\/p>/g, '$1');

  const mathRenderFn = customRenderLatex || ((latex, isBlock) => renderLatex(latex, isBlock, customKatex));

  // 11. Replace Block Math Placeholders with KaTeX rendered HTML
  html = html.replace(/%%MATHBLOCK_(\d+)%%/g, (match, id) => {
    const latex = mathBlocks[parseInt(id, 10)];
    return `<div class="math-block">${mathRenderFn(latex, true)}</div>`;
  });

  // 12. Replace Inline Math Placeholders
  html = html.replace(/%%MATHINLINE_(\d+)%%/g, (match, id) => {
    const latex = mathInlines[parseInt(id, 10)];
    return `<span class="math-inline">${mathRenderFn(latex, false)}</span>`;
  });

  return html;
}

// CommonJS support for Node.js test suites
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadKatex,
    renderPendingMathElements,
    renderLatex,
    renderMarkdown
  };
}
