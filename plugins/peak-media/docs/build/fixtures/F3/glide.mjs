// Shared by the F3 storyboards: glide the page to the first visible element whose text matches
// `match` (eased scroll over `ms`), then outline it. Falls back to scrolling `fallbackPx` when
// nothing matches, so a changed live page still produces a moving plate instead of an error.
// Live pages keep laying out after load (GitHub renders diagrams lazily), so with `settle` the
// target is re-measured and nudged back into place if the layout moved under it.
export async function glideTo(page, { match, flags = 'i', ms = 1600, offset = 140, fallbackPx = 600, mark = true, settle = 2 }) {
  return page.evaluate(async ({ src, flags, ms, offset, fallbackPx, mark, settle }) => {
    const re = new RegExp(src, flags);
    // headings first, then body text; skip fixed/sticky chrome such as "on this page" sidebars
    const inChrome = (e) => { for (let n = e; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
    const els = [...document.querySelectorAll('h1, h2, h3, h4'), ...document.querySelectorAll('p, li, td, th')];
    const el = els.find((e) => re.test(e.textContent) && e.getBoundingClientRect().height > 0 && !e.closest('nav, aside') && !inChrome(e));
    const target = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(max, el ? window.scrollY + el.getBoundingClientRect().top - offset : window.scrollY + fallbackPx));
    };
    const glide = (to, dur) => new Promise((done) => {
      const from = window.scrollY;
      const start = performance.now();
      const step = () => {
        const k = dur > 0 ? Math.min(1, (performance.now() - start) / dur) : 1;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        window.scrollTo(0, from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    await glide(target(), ms);
    for (let i = 0; el && i < settle; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const drift = el.getBoundingClientRect().top - offset;
      if (Math.abs(drift) < 24) break;
      await glide(target(), 0);
    }
    if (el && mark) { el.style.outline = '3px solid rgba(240, 160, 0, 0.9)'; el.style.outlineOffset = '6px'; el.style.borderRadius = '4px'; }
    return el ? el.textContent.trim().slice(0, 80) : null;
  }, { src: match, flags, ms, offset, fallbackPx, mark, settle });
}
