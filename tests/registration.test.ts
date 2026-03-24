/**
 * @jest-environment jsdom
 */

// @ts-nocheck

import { jest } from '@jest/globals';

describe('registration.js frontend logic', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="registration-app"></div>';
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    window.history.replaceState({}, '', 'http://localhost/public/registration.html');
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ formCode: 'abc12' }),
    });
  });

  it('defaults to English and pre-fills location and type from query params', () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?location=Louisville&type=Volunteer');

    require('../public/registration.js');

    expect(document.querySelector('.ri-title')?.textContent).toBe('Registration Form');
    expect((document.querySelector('input[name="Location__c"]') as HTMLInputElement)?.value).toBe('Louisville');
    expect((document.querySelector('input[name="Type__c"]') as HTMLInputElement)?.value).toBe('Volunteer');
    expect(window.__ri_registration.getLanguage()).toBe('en');
  });

  it('translates the form when a supported language parameter is supplied', () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=es&location=Lexington&type=Entrenamiento');

    require('../public/registration.js');

    expect(document.documentElement.lang).toBe('es');
    expect(document.querySelector('.ri-title')?.textContent).toBe('Formulario de registro');
    expect(document.querySelector('.ri-section-title')?.textContent).toBe('Información de contacto');
    expect(document.querySelector('button.ri-btn-primary')?.textContent).toBe('Enviar registro');
    expect((document.querySelector('input[name="Location__c"]') as HTMLInputElement)?.value).toBe('Lexington');
  });

  it('falls back to English when the language parameter is unsupported', () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=de');

    require('../public/registration.js');

    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('.ri-title')?.textContent).toBe('Registration Form');
  });

  it('submits the additional registration intake fields in the payload', async () => {
    require('../public/registration.js');

    const setField = (selector: string, value: string, eventName = 'input') => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      el.value = value;
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
    };

    setField('input[name="FirstName__c"]', 'Ana');
    setField('input[name="LastName__c"]', 'Lopez');
    setField('input[name="Email__c"]', 'ana@example.com');
    setField('input[name="Phone__c"]', '555-111-2222');
    setField('input[name="Location__c"]', 'Louisville');
    setField('input[name="Type__c"]', 'ESL');
    setField('input[name="Birthdate__c"]', '1990-04-15');
    setField('input[name="CountryOfOrigin__c"]', 'Guatemala');
    setField('input[name="HowHeard__c"]', 'A friend from church');
    setField('select[name="Interest__c"]', 'Bible study in Spanish', 'change');
    setField('select[name="KTAPProgram__c"]', 'Yes', 'change');
    setField('select[name="SNAPProgram__c"]', 'No', 'change');

    (document.querySelector('button.ri-btn-primary') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({
      FirstName__c: 'Ana',
      LastName__c: 'Lopez',
      Email__c: 'ana@example.com',
      Phone__c: '555-111-2222',
      Location__c: 'Louisville',
      Type__c: 'ESL',
      Birthdate__c: '1990-04-15',
      CountryOfOrigin__c: 'Guatemala',
      HowHeard__c: 'A friend from church',
      Interest__c: 'Bible study in Spanish',
      KTAPProgram__c: 'Yes',
      SNAPProgram__c: 'No',
    });
  });
});
