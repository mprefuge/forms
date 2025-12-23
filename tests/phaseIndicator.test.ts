/* @jest-environment jsdom */
import fs from 'fs';
import path from 'path';

const APP_PATH = path.resolve(__dirname, '../public/application.js');

async function loadAppScript() {
  const script = fs.readFileSync(APP_PATH, 'utf8');
  // Ensure there's a host element to mount into
  document.body.innerHTML = '<div id="volunteer-app"></div>';
  // Capture runtime errors when executing the script
  const errors: Error[] = [];
  const onErr = (e: any) => {
    errors.push(e.error || new Error(e.message || 'Unknown script error'));
    e.preventDefault && e.preventDefault();
  };
  window.addEventListener('error', onErr);

  // Create a script element with the content so `document.currentScript` is available to the running script
  const el = document.createElement('script');
  // Do not set a src attribute - inline content must run locally in jsdom
  el.type = 'text/javascript';
  el.async = false;
  el.defer = false;
  el.textContent = script;
  document.head.appendChild(el);

  // Wait up to 500ms for the script to attach the test bridge
  const start = Date.now();
  while (Date.now() - start < 500) {
    if ((window as any).__riTest) break;
    // let microtasks & any synchronous script execution finish
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 5));
  }

  window.removeEventListener('error', onErr);
  if (errors.length) throw errors[0];
  if (!(window as any).__riTest) {
    throw new Error('Application script did not attach test bridge after execution. DOM snapshot: ' + document.body.innerHTML + '\nHEAD: ' + document.head.innerHTML);
  }
}

function chips() {
  return Array.from(document.querySelectorAll('.ri-phase-indicator .ri-phase-chip')) as HTMLElement[];
}

beforeEach(() => {
  // Clean up between runs
  document.body.innerHTML = '';
  // Delete any existing bridge
  try { delete (global as any).__riTest; } catch (e) {}
  try { delete (window as any).__riTest; } catch (e) {}
});

test('Phase pills update for Pending -> Submitted -> Approved -> Denied', async () => {
  await loadAppScript();

  const bridge = (window as any).__riTest;
  expect(bridge).toBeDefined();

  // Pending (default)
  bridge.setData({ CurrentStatus: 'Pending', CurrentStatus__c: 'Pending' });
  bridge.renderPhaseIndicator();
  let ps = chips();
  expect(ps.length).toBeGreaterThanOrEqual(3);
  expect(ps[0].classList.contains('active')).toBe(true);
  expect(ps[0].textContent?.trim()).toBe('Initial Application');

  // Submitted => Supplemental Documents active, Initial Application completed
  bridge.setData({ CurrentStatus: 'Submitted', CurrentStatus__c: 'Submitted' });
  bridge.renderPhaseIndicator();
  ps = chips();
  expect(ps[1].classList.contains('active')).toBe(true);
  expect(ps[0].classList.contains('completed')).toBe(true);
  expect(ps[1].textContent?.trim()).toMatch(/Supplemental/i);

  // Approved => final chip says Approved and completed
  bridge.setData({ CurrentStatus: 'Approved', CurrentStatus__c: 'Approved' });
  bridge.renderPhaseIndicator();
  ps = chips();
  const last = ps[ps.length - 1];
  expect(last.textContent?.trim()).toBe('Approved');
  expect(last.classList.contains('completed')).toBe(true);

  // Denied => final chip says Denied and has denied class
  bridge.setData({ CurrentStatus: 'Denied', CurrentStatus__c: 'Denied' });
  bridge.renderPhaseIndicator();
  ps = chips();
  const last2 = ps[ps.length - 1];
  expect(last2.textContent?.trim()).toBe('Denied');
  expect(last2.classList.contains('denied')).toBe(true);
});