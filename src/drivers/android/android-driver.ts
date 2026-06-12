import CDP from 'chrome-remote-interface';
import { Adb, mapToDeviceCoords } from './adb.js';
import type { AutomationDriver, MouseButton } from '../automation-driver.js';
import type { AppState, LaunchAppParams, AndroidConfig } from '../../types.js';

/** `adb forward` is created by the adb *server*, so the local port opens on the server host,
 *  not on this machine. With a remote/Windows-hosted server (ADB_SERVER_SOCKET=tcp:<ip>:<port>)
 *  the CDP client must connect to <ip>, not 127.0.0.1. Returns the host, or undefined if adb is
 *  local (unix socket / unset) — caller then falls back to 127.0.0.1. */
export function cdpHostFromAdbSocket(socket: string | undefined): string | undefined {
  const m = socket?.match(/^tcp:(\[[^\]]+\]|[^:]+):\d+$/i);
  return m ? m[1] : undefined;
}

export class AndroidDriver implements AutomationDriver {
  private adb: Adb;
  private cfg: Required<AndroidConfig>;
  private cdp: CDP.Client | null = null;
  private state: AppState = { isRunning: false, browser: null };

  constructor(cfg: AndroidConfig = {}) {
    this.cfg = {
      adbPath: cfg.adbPath ?? 'adb',
      appId: cfg.appId ?? 'com.voltius.app',
      mainActivity: cfg.mainActivity ?? '.MainActivity',
      serial: cfg.serial ?? '',
      forwardPort: cfg.forwardPort ?? 9222,
      cdpHost: cfg.cdpHost ?? cdpHostFromAdbSocket(process.env.ADB_SERVER_SOCKET) ?? '127.0.0.1',
    };
    this.adb = new Adb(this.cfg.adbPath, this.cfg.serial || undefined);
  }

  async launchApp(_params: LaunchAppParams): Promise<void> {
    if (this.state.isRunning) throw new Error('Application is already running. Close it first.');
    await this.adb.startActivity(`${this.cfg.appId}/${this.cfg.mainActivity}`);
    let pid: number | null = null;
    for (let i = 0; i < 30 && pid === null; i++) {
      const wv = await this.adb.webviewPid();
      if (wv !== null && wv === await this.adb.pidOf(this.cfg.appId)) { pid = wv; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    if (pid === null) throw new Error('WebView debugging socket not found (is this a --debug build?)');
    try {
      await this.adb.forward(this.cfg.forwardPort, pid);
      // local:true → build the ws URL from host:port we pass, ignoring the device's
      // self-reported (localhost) webSocketDebuggerUrl, which is wrong across a remote forward.
      this.cdp = await CDP({ host: this.cfg.cdpHost, port: this.cfg.forwardPort, local: true });
      await this.cdp.Page.enable();
      await this.cdp.Runtime.enable();
      await this.cdp.DOM.enable();
      this.state = { isRunning: true, browser: null, appPath: this.cfg.appId, sessionId: String(pid) };
    } catch (e) {
      await this.closeApp();
      throw e;
    }
  }

  async closeApp(): Promise<void> {
    try { await this.cdp?.close(); } catch { /* ignore */ }
    this.cdp = null;
    await this.adb.removeForward(this.cfg.forwardPort);
    await this.adb.forceStop(this.cfg.appId);
    this.state = { isRunning: false, browser: null };
  }

  getAppState(): Readonly<AppState> { return this.state; }

  private client(): CDP.Client {
    if (!this.cdp) throw new Error('App not running. Call launch_app first.');
    return this.cdp;
  }

  private async evalJs<T = unknown>(expr: string): Promise<T> {
    const { result, exceptionDetails } = await this.client().Runtime.evaluate({
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'JS evaluation failed');
    return result.value as T;
  }

  async captureScreenshot(_filename?: string, returnBase64 = true): Promise<string> {
    if (returnBase64 === false) throw new Error('Android screenshot supports base64 only (returnBase64=false not supported)');
    const png = await this.adb.screencapPng();
    return png.toString('base64');
  }

  async getElementText(selector: string): Promise<string> {
    return this.evalJs<string>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
         if (!el) throw new Error('No element: ' + ${JSON.stringify(selector)});
         return el.textContent ?? ''; })()`);
  }

  async waitForElement(selector: string, timeout = 5000): Promise<void> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = await this.evalJs<boolean>(
        `!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) return;
      if (Date.now() > deadline) throw new Error('Timeout waiting for: ' + selector);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async getPageTitle(): Promise<string> { return this.evalJs<string>('document.title'); }
  async getPageUrl(): Promise<string> { return this.evalJs<string>('location.href'); }

  async clickElement(selector: string, button: MouseButton = 'left'): Promise<void> {
    const center = await this.evalJs<{ x: number; y: number; dpr: number } | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
         if (!el) return null;
         el.scrollIntoView({block:'center', inline:'center'});
         const r = el.getBoundingClientRect();
         return { x: r.left + r.width/2, y: r.top + r.height/2, dpr: window.devicePixelRatio || 1 }; })()`);
    if (!center) throw new Error('No element: ' + selector);
    const { x, y } = mapToDeviceCoords(center.x, center.y, center.dpr);
    if (button === 'right') await this.adb.longPress(x, y);
    else await this.adb.tap(x, y);
  }

  async typeText(selector: string, text: string, clear = false): Promise<void> {
    await this.evalJs(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
         if (!el) throw new Error('No element: ' + ${JSON.stringify(selector)});
         el.focus(); ${clear ? "if ('value' in el) el.value=''; else el.textContent='';" : ''} })()`);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await this.client().Input.insertText({ text: lines[i] });
      if (i < lines.length - 1) await this.adb.keyevent('66'); // KEYCODE_ENTER
    }
  }

  private static readonly KEY_CODES: Record<string, string> = {
    Enter: '66', Tab: '61', Escape: '111', Backspace: '67', Delete: '112',
    ArrowUp: '19', ArrowDown: '20', ArrowLeft: '21', ArrowRight: '22',
    Home: '122', End: '123',
  };

  async pressKey(keys: string | string[], selector?: string): Promise<void> {
    if (selector) await this.clickElement(selector);
    const arr = Array.isArray(keys) ? keys : [keys];
    if (arr.length === 1 && AndroidDriver.KEY_CODES[arr[0]]) {
      await this.adb.keyevent(AndroidDriver.KEY_CODES[arr[0]]);
      return;
    }
    const MODS: Record<string, number> = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
    let modifiers = 0;
    const last = arr[arr.length - 1];
    for (const k of arr.slice(0, -1)) modifiers |= MODS[k] ?? 0;
    await this.client().Input.dispatchKeyEvent({ type: 'keyDown', key: last, modifiers });
    await this.client().Input.dispatchKeyEvent({ type: 'keyUp', key: last, modifiers });
  }

  async executeTauriCommand(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    // Tauri v2 only exposes window.__TAURI__ when `withGlobalTauri` is set; otherwise the
    // invoke bridge lives at window.__TAURI_INTERNALS__.invoke. Try both.
    return this.evalJs(
      `(() => { const t = window.__TAURI__;
         const invoke = (t && t.core && t.core.invoke) || (t && t.invoke)
           || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
         if (!invoke) throw new Error('Tauri invoke not found (no __TAURI__ or __TAURI_INTERNALS__)');
         return invoke(${JSON.stringify(command)}, ${JSON.stringify(args)}); })()`);
  }
}
