/**
 * @jest-environment jsdom
 */

// @ts-nocheck

import { jest } from '@jest/globals';

describe('registration.js frontend logic', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="registration-app"></div>';
    document.documentElement.lang = 'en';
    window.history.replaceState({}, '', 'http://localhost/public/registration.html');
    jest.resetModules();
    delete window.REGISTRATION_FIELDS;
    delete window.REGISTRATION_FORMS;
    delete window.REGISTRATION_FORM_CONFIGS;
    delete window.__ri_registration;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ formCode: 'abc12' }),
    });
  });

  const loadCore = () => {
    require('../public/registration-fields.js');
    require('../public/registration-forms.js');
  };

  it('defaults to the generic contact form when no type is supplied', async () => {
    loadCore();
    require('../public/registration-configs/generic-contact.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('.ri-title')?.textContent).toBe('Contact Form');
    expect(document.querySelector('input[name="Location__c"]')).toBeNull();
    expect(document.querySelector('input[name="Type__c"]')).toBeNull();
    expect(document.querySelector('textarea[name="Comments__c"]')).toBeTruthy();
    expect(window.__ri_registration.getActiveFormType()).toBe('Generic Contact');
    expect(window.__ri_registration.getLanguage()).toBe('en');
  });

  it('loads the event registration form from the registry and config file', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?type=event&location=Lexington');
    loadCore();
    require('../public/registration-configs/event-registration.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector('.ri-title')?.textContent).toBe('Event Registration');
    expect((document.querySelector('input[name="Location"]') as HTMLInputElement)?.value).toBe('Lexington');
    expect(document.querySelector('input[name="Birthdate__c"]')).toBeNull();
    expect(window.__ri_registration.getActiveFormType()).toBe('Event Registration');
  });

  it('renders form images when a form config provides them', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?type=farmdale-esl');
    loadCore();
    require('../public/registration-configs/esl-network-registration-farmdale.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    const image = document.querySelector('.ri-form-media img') as HTMLImageElement;
    expect(image).toBeTruthy();
    expect(image.src).toContain('No+MS+1.jpg');
    expect(document.querySelector('.ri-form-media-caption')?.textContent).toBe('Community volunteers serving together.');
  });

  it('translates supported content when language is supplied', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=es&type=student-registration&location=Lexington');
    loadCore();
    require('../public/registration-configs/student-registration.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    expect(document.documentElement.lang).toBe('es');
    expect(document.querySelector('.ri-title')?.textContent).toBe('Registro de estudiante');
    expect(document.querySelector('label[for="registration-FirstName"]')?.textContent).toBe('Nombre');
    expect(document.querySelector('button.ri-btn-primary')?.textContent).toBe('Enviar registro');
    expect((document.querySelector('input[name="Location"]') as HTMLInputElement)?.value).toBe('Lexington');
  });

  it('keeps dropdown payload values in English even when Spanish labels are shown', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=es&type=esl-network-registration&location=Louisville');
    loadCore();
    require('../public/registration-configs/esl-network-registration.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    const interestSelect = document.querySelector('select[name="Interest"]') as HTMLSelectElement;
    const ktapSelect = document.querySelector('select[name="KTAPProgram"]') as HTMLSelectElement;

    expect(interestSelect.options[1].textContent).toBe('Inscribir a sus hijos en la escuela');
    expect(interestSelect.options[1].value).toBe('Registering your children for school');
    expect(ktapSelect.options[1].textContent).toBe('Sí');
    expect(ktapSelect.options[1].value).toBe('Yes');

    const setField = (selector: string, value: string, eventName = 'input') => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      el.value = value;
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
    };

    setField('input[name="FirstName__c"]', 'Ana');
    setField('input[name="LastName__c"]', 'Lopez');
    setField('input[name="Email__c"]', 'ana@example.com');
    setField('input[name="Phone__c"]', '555-111-2222');
    setField('input[name="NativeCountry"]', 'Guatemala');
    setField('input[name="Location"]', 'Louisville');
    setField('select[name="Interest"]', 'Registering your children for school', 'change');
    setField('select[name="KTAPProgram"]', 'Yes', 'change');

    (document.querySelector('button.ri-btn-primary') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(JSON.parse(payload.Custom__c)).toEqual(expect.objectContaining({
      Interest: 'Registering your children for school',
      KTAPProgram: 'Yes',
      Type: 'ESL Network Registration',
    }));
  });

  it('falls back to English when the language parameter is unsupported', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=de');
    loadCore();
    require('../public/registration-configs/generic-contact.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('.ri-title')?.textContent).toBe('Contact Form');
  });

  it('submits esl-network payload in English even when the UI language is Spanish', async () => {
    window.history.replaceState({}, '', 'http://localhost/public/registration.html?language=es&type=esl-network-registration&location=Louisville');
    loadCore();
    require('../public/registration-configs/esl-network-registration.js');
    require('../public/registration.js');
    await Promise.resolve();
    await Promise.resolve();

    const setField = (selector: string, value: string, eventName = 'input') => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      el.value = value;
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
    };

    setField('input[name="FirstName__c"]', 'Ana');
    setField('input[name="LastName__c"]', 'Lopez');
    setField('input[name="Email__c"]', 'ana@example.com');
    setField('input[name="Phone__c"]', '555-111-2222');
    setField('input[name="NativeCountry"]', 'Guatemala');
    setField('input[name="Location"]', 'Louisville');
    setField('input[name="HowHeard"]', 'A friend from church');
    setField('select[name="Interest"]', 'Bible study in Spanish', 'change');
    setField('select[name="KTAPProgram"]', 'Yes', 'change');
    setField('select[name="SNAPProgram"]', 'No', 'change');

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
    });
    expect(payload.Type__c).toBeUndefined();
    expect(payload.__language).toBeUndefined();
    expect(payload.Location__c).toBeUndefined();
    expect(payload.CountryOfOrigin__c).toBeUndefined();
    expect(payload.HowHeard__c).toBeUndefined();
    expect(payload.Interest__c).toBeUndefined();
    expect(payload.KTAPProgram__c).toBeUndefined();
    expect(payload.SNAPProgram__c).toBeUndefined();
    expect(JSON.parse(payload.Custom__c)).toEqual({
      Type: 'ESL Network Registration',
      NativeCountry: 'Guatemala',
      Location: 'Louisville',
      HowHeard: 'A friend from church',
      Interest: 'Bible study in Spanish',
      KTAPProgram: 'Yes',
      SNAPProgram: 'No',
    });
  });
});
