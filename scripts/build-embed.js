/*
 * build-embed.js
 * ---------------------------------------------------------------------------
 * Generates a single, self-contained HTML snippet for embedding one
 * registration form (default: the ESL Immigrant Form) in a website builder
 * such as Squarespace, Wix, or any page that accepts a block of HTML.
 *
 * The form is rendered inside an <iframe srcdoc="..."> so that its CSS and its
 * JavaScript globals are isolated from the host page: the form's styles cannot
 * leak out and the host page's styles cannot leak in. The iframe auto-resizes to
 * the form's content height. (Note: an about:srcdoc iframe is same-origin with
 * the host page, so the boundary is a rendering/CSS boundary, not a security
 * sandbox — see the README for the optional `sandbox` hardening.)
 *
 * Everything the form needs is inlined into the iframe document (CSS, field
 * definitions, form registry, translations, the selected form's config, and the
 * renderer), so there are NO external files to host. The only network request
 * the embedded form makes is the form-submission POST to the API endpoint.
 *
 * Usage:
 *   node scripts/build-embed.js [formSlug] [--out <path>]
 *   FORMS_API_ENDPOINT=https://... node scripts/build-embed.js esl-immigrant
 *
 * Exports buildEmbed() / buildInnerDocument() for use in tests.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_ENDPOINT = 'https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form';

const readPublic = (relPath) => fs.readFileSync(path.join(PUBLIC_DIR, relPath), 'utf8');

// Neutralize any literal </script> sequences so a string containing them cannot
// terminate an enclosing <script> tag early. `<\/script>` inside a JS string or
// srcdoc value is parsed back to `</script>`, so behavior is preserved.
const guardScript = (src) => src.replace(/<\/(script)/gi, '<\\/$1');

// Evaluate one of the browser config files in a throwaway sandbox so the build
// can inspect it (it assigns to window.*). Returns the sandbox window.
const evalInSandbox = (src, seed = {}) => {
  const sandboxWindow = seed;
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandboxWindow);
  return sandboxWindow;
};

// Fields whose <select> options are populated from the shared runtime lookup
// table (see applyLookupOptions in registration.js).
const LOOKUP_BACKED_FIELDS = ['Country', 'NativeCountry'];

// True when the resolved form includes a lookup-backed field, meaning the
// runtime lookup fetch must NOT be stubbed out.
const formUsesLookup = (configSrc, formName) => {
  try {
    const win = evalInSandbox(configSrc, { REGISTRATION_FORM_CONFIGS: {} });
    const cfg = (win.REGISTRATION_FORM_CONFIGS || {})[formName] || {};
    const fields = Array.isArray(cfg.Fields) ? cfg.Fields : [];
    return fields.some((f) => LOOKUP_BACKED_FIELDS.includes(f));
  } catch (e) {
    return false;
  }
};

// Resolve a form slug (e.g. "esl-immigrant") to its display name and config
// file by evaluating the real registry file — no duplicated mapping.
const resolveForm = (slug) => {
  const registrySrc = readPublic('registration-forms.js');
  const sandboxWindow = {};
  // eslint-disable-next-line no-new-func
  new Function('window', registrySrc)(sandboxWindow);
  const registry = sandboxWindow.REGISTRATION_FORMS || { aliases: {}, forms: {} };
  const cleaned = String(slug || '').trim().toLowerCase();
  const formName =
    (registry.aliases && registry.aliases[cleaned]) ||
    Object.keys(registry.forms || {}).find((name) => name.toLowerCase() === cleaned) ||
    registry.defaultForm;
  const configFile = registry.forms && registry.forms[formName];
  if (!configFile) {
    throw new Error(`build-embed: no form config registered for slug "${slug}" (resolved name "${formName}")`);
  }
  return { formName, configFile, registrySrc };
};

// The complete, standalone HTML document that runs inside the iframe.
function buildInnerDocument(options = {}) {
  const slug = options.slug || 'esl-immigrant';
  const apiEndpoint = options.apiEndpoint || process.env.FORMS_API_ENDPOINT || DEFAULT_ENDPOINT;
  const { formName, configFile, registrySrc } = resolveForm(slug);

  const css = readPublic('registration.css');
  const configSrc = readPublic(configFile);
  const formScripts = [
    readPublic('registration-fields.js'),
    registrySrc,
    readPublic('registration-translations.js'),
    configSrc,
    readPublic('registration.js'),
  ];

  // Does this form include a field whose options come from the shared lookup
  // table (country lists)? If so we must NOT stub out the lookup, or those
  // dropdowns would silently degrade to free-text inputs.
  const needsLookup = formUsesLookup(configSrc, formName);

  const bootConfig = [
    '// Configure the form entirely in JS (no external files, no URL params).',
    'window.FORMS_CONFIG = Object.assign({}, window.FORMS_CONFIG, {',
    `  apiEndpoint: ${JSON.stringify(apiEndpoint)},`,
    `  type: ${JSON.stringify(slug)}`,
    '});',
    ...(needsLookup
      ? [
          '// This form has country/address dropdowns whose options load from the',
          '// shared lookup list, so that one script is fetched at runtime.',
        ]
      : [
          '// This form uses no country/address lookups, so provide an empty lookup',
          '// table to skip the external lookup fetch and stay fully self-contained.',
          'window.lookup = window.lookup || {};',
        ]),
  ].join('\n');

  // Reports the content height to the parent page so the iframe can be sized to
  // fit with no inner scrollbar. Re-posts on any layout change (validation
  // errors, success screen, viewport resize).
  //
  // IMPORTANT: measure document.body, NOT document.documentElement. In a
  // standards-mode document the ROOT element's scrollHeight is clamped to the
  // iframe's own viewport height, so once the iframe is sized to fit, the root
  // would keep reporting the (larger) iframe height — an unbounded feedback loop
  // that never shrinks. The body element is not viewport-clamped, so its
  // scrollHeight tracks the real content and `content === iframe height` is a
  // stable fixpoint.
  const resizeReporter = [
    '(function () {',
    '  var last = 0;',
    '  function report() {',
    '    var b = document.body;',
    '    if (!b) return;',
    '    var h = b.scrollHeight;',
    '    if (h && h !== last) {',
    '      last = h;',
    `      parent.postMessage({ __riEmbed: ${JSON.stringify(slug)}, height: h }, '*');`,
    '    }',
    '  }',
    '  if (typeof ResizeObserver === "function") {',
    '    new ResizeObserver(report).observe(document.body);',
    '  }',
    '  window.addEventListener("load", report);',
    '  window.addEventListener("resize", report);',
    '  setInterval(report, 500);',
    '  report();',
    '})();',
  ].join('\n');

  const scriptTags = [bootConfig, ...formScripts, resizeReporter]
    .map((src) => `<script>\n${src}\n</script>`)
    .join('\n');

  // Override the page-level rules from registration.css (it was authored as a
  // full page) so the iframe body blends into the host page: no forced viewport
  // height, transparent background, modest padding.
  const embedOverrides = 'html,body{min-height:0;margin:0;background:transparent;}body{padding:12px;}';

  return [
    '<!DOCTYPE html>',
    `<html lang="en">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${formName}</title>`,
    // No web-font <link>: the CSS font stack falls back to the system UI font,
    // keeping the embed fully self-contained (the only network request the form
    // makes is the submission POST).
    `<style>\n${css}\n${embedOverrides}\n</style>`,
    '</head>',
    '<body>',
    '<div id="registration-app"></div>',
    scriptTags,
    '</body>',
    '</html>',
  ].join('\n');
}

// The snippet the user pastes: an auto-resizing iframe whose document is the
// self-contained form. Isolated from the host page's CSS and JS.
function buildEmbed(options = {}) {
  const slug = options.slug || 'esl-immigrant';
  const { formName } = resolveForm(slug);
  const inner = buildInnerDocument(options);
  const frameId = `ri-embed-${slug}`;

  // Locate THIS block's iframe via document.currentScript rather than a shared
  // id, so multiple copies of the same form on one page each drive their own
  // iframe. Only accept height messages that originate from that iframe's own
  // window (blocks other frames / spoofed messages).
  const parentScript = [
    '(function () {',
    '  var s = document.currentScript;',
    '  var iframe = s && s.previousElementSibling;',
    `  if (!iframe || iframe.tagName !== "IFRAME") { iframe = document.getElementById(${JSON.stringify(frameId)}); }`,
    '  if (!iframe) return;',
    '  window.addEventListener("message", function (e) {',
    '    if (e.source !== iframe.contentWindow) return;',
    `    if (e.data && e.data.__riEmbed === ${JSON.stringify(slug)} && e.data.height) {`,
    '      var h = parseInt(e.data.height, 10);',
    '      if (h > 0 && h < 20000) iframe.style.height = h + "px";',
    '    }',
    '  });',
    `  iframe.srcdoc = ${JSON.stringify(inner)};`,
    '})();',
  ].join('\n');

  return [
    `<!-- Refuge International — ${formName} (self-contained embed) -->`,
    '<!-- Paste this entire block into a single Squarespace Code Block (or any HTML area). -->',
    `<iframe id="${frameId}" title="${formName}" loading="lazy" scrolling="no"`,
    '        style="width:100%;height:760px;border:0;overflow:hidden;display:block;"></iframe>',
    `<script>\n${guardScript(parentScript)}\n</script>`,
    `<!-- /Refuge International — ${formName} -->`,
    '',
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let slug = 'esl-immigrant';
  let outPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') {
      outPath = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  const embed = buildEmbed({ slug });
  const target = outPath
    ? path.resolve(outPath)
    : path.join(__dirname, '..', 'embed', `${slug}-embed.html`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, embed, 'utf8');
  const kb = (Buffer.byteLength(embed, 'utf8') / 1024).toFixed(1);
  console.log(`build-embed: wrote ${target} (${kb} KB) for form "${slug}"`);
}

if (require.main === module) {
  main();
}

module.exports = { buildEmbed, buildInnerDocument, resolveForm };
