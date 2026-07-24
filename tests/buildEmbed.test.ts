// @ts-nocheck
/**
 * Tests for scripts/build-embed.js — the generator that produces the
 * self-contained iframe embed snippet for a registration form.
 */

const { buildEmbed, buildInnerDocument, resolveForm } = require('../scripts/build-embed');

describe('build-embed generator', () => {
  it('resolves form slugs and aliases to the registered form name', () => {
    expect(resolveForm('esl-immigrant').formName).toBe('ESL Immigrant Form');
    expect(resolveForm('immigrant').formName).toBe('ESL Immigrant Form');
    // Unknown slugs fall back to the registry default rather than throwing.
    expect(resolveForm('does-not-exist').formName).toBe('Generic Contact');
  });

  it('inlines everything the ESL Immigrant form needs into the iframe document', () => {
    const doc = buildInnerDocument({ slug: 'esl-immigrant' });

    // Mount point + renderer + styling variant.
    expect(doc).toContain('id="registration-app"');
    expect(doc).toContain("StyleVariant: 'minimal'");
    expect(doc).toContain('ri-btn-primary'); // from the inlined CSS/renderer

    // The form is configured entirely in JS (no URL params / src attributes).
    expect(doc).toContain('window.FORMS_CONFIG');
    expect(doc).toContain('type: "esl-immigrant"');

    // Both newly added questions and their labels are present.
    expect(doc).toContain('How did you hear about our organization?');
    expect(doc).toContain('available to meet with an English mentor');

    // Self-contained: an empty lookup table is provided so no external fetch runs.
    expect(doc).toContain('window.lookup = window.lookup');
  });

  it('produces a single auto-resizing iframe snippet with escaped closing tags', () => {
    const embed = buildEmbed({ slug: 'esl-immigrant' });

    // Exactly one iframe, with the expected id and inline height seed.
    expect(embed.split('<iframe').length - 1).toBe(1);
    expect(embed).toContain('id="ri-embed-esl-immigrant"');
    expect(embed).toContain('iframe.srcdoc =');
    expect(embed).toContain('__riEmbed'); // resize wiring

    // The inner document's <script> closers are neutralized so they cannot
    // terminate the wrapper <script> early.
    expect(embed).toContain('<\\/script>');

    // The wrapper <script> block itself must not contain a raw </script>.
    const wrapper = embed.slice(embed.lastIndexOf('<script>') + '<script>'.length, embed.lastIndexOf('</script>'));
    expect(wrapper.includes('</script>')).toBe(false);
  });

  it('honors a custom API endpoint', () => {
    const doc = buildInnerDocument({ slug: 'esl-immigrant', apiEndpoint: 'https://example.test/api/form' });
    expect(doc).toContain('https://example.test/api/form');
  });
});
