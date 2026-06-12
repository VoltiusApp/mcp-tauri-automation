import type { AppState, LaunchAppParams } from '../types.js';

export type MouseButton = 'left' | 'right' | 'middle';

export interface AutomationDriver {
  launchApp(params: LaunchAppParams): Promise<void>;
  closeApp(): Promise<void>;
  captureScreenshot(filename?: string, returnBase64?: boolean): Promise<string>;
  clickElement(selector: string, button?: MouseButton): Promise<void>;
  typeText(selector: string, text: string, clear?: boolean): Promise<void>;
  pressKey(keys: string | string[], selector?: string): Promise<void>;
  waitForElement(selector: string, timeout?: number): Promise<void>;
  getElementText(selector: string): Promise<string>;
  executeTauriCommand(command: string, args?: Record<string, unknown>): Promise<unknown>;
  getAppState(): Readonly<AppState>;
  getPageTitle(): Promise<string>;
  getPageUrl(): Promise<string>;
}
