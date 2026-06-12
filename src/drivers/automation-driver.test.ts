import { test } from 'node:test';
import assert from 'node:assert';
import type { AutomationDriver } from './automation-driver.js';
import { TauriDriver } from '../tauri-driver.js';

test('TauriDriver structurally satisfies AutomationDriver', () => {
  const d: AutomationDriver = new TauriDriver();
  const methods: (keyof AutomationDriver)[] = [
    'launchApp', 'closeApp', 'captureScreenshot', 'clickElement', 'typeText',
    'pressKey', 'waitForElement', 'getElementText', 'executeTauriCommand',
    'getAppState', 'getPageTitle', 'getPageUrl',
  ];
  for (const m of methods) assert.strictEqual(typeof (d as any)[m], 'function');
});
