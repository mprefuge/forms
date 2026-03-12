/**
 * @jest-environment jsdom
 */

// @ts-nocheck

// simple DOM-based tests for the waiver client script

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('waiver.js frontend logic', () => {
  beforeEach(() => {
    // clear DOM and create container element for normal rendering
    document.body.innerHTML = '<div id="waiver-app"></div>';
    jest.resetModules();
    // provide a bare-bones fetch implementation so the script can load
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve([]),
    });
  });

  it('loads without throwing and registers modal helpers', () => {
    expect(() => {
      require('../public/waiver.js');
    }).not.toThrow();

    expect(typeof window.openModal).toBe('function');
  });

  it('openModal creates overlay and allows content render (via waiver alias)', () => {
    require('../public/waiver.js');
    const { overlay, close } = window.openModal({
      onOpen: (container) => {
        // simulate putting some content inside
        container.textContent = 'hello';
      }
    });
    expect(overlay).toBeDefined();
    expect(document.querySelector('.ri-modal-overlay')).toBeTruthy();
    expect(overlay.querySelector('#waiver-app')).toBeTruthy();
    expect(overlay.querySelector('#waiver-app').textContent).toBe('hello');
    close();
    expect(document.querySelector('.ri-modal-overlay')).toBeNull();

  });

  it('calling openModal twice (waiver variant) resets state (new form instance)', () => {
    require('../public/waiver.js');
    const first = window.openModal({
      onOpen(container) {
        if (window.__ri_waiver) {
          window.__ri_waiver.hostOverride = container;
          window.__ri_waiver.resetState();
          window.__ri_waiver.render();
        }
      }
    });
    // simulate entering some value in the modal's form
    const input = document.querySelector('.ri-modal #waiver-app input[name="FirstName__c"]');
    if (input) input.value = 'Jake';
    expect(document.querySelector('.ri-modal #waiver-app input[name="FirstName__c"]').value).toBe('Jake');
    first.close();

    const second = window.openModal({
      onOpen(container) {
        if (window.__ri_waiver) {
          window.__ri_waiver.hostOverride = container;
          window.__ri_waiver.resetState();
          window.__ri_waiver.render();
        }
      }
    });
    // value should be cleared for new instance
    expect(document.querySelector('.ri-modal #waiver-app input[name="FirstName__c"]').value).toBe('');
    second.close();
  });
});