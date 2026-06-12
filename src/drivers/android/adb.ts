import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export function parseWebviewPid(procNetUnix: string): number | null {
  const m = procNetUnix.match(/@webview_devtools_remote_(\d+)/);
  return m ? Number(m[1]) : null;
}

export function mapToDeviceCoords(cssX: number, cssY: number, dpr: number) {
  return { x: Math.round(cssX * dpr), y: Math.round(cssY * dpr) };
}

export class Adb {
  constructor(private adbPath = 'adb', private serial?: string) {}
  private base() { return this.serial ? [this.adbPath, '-s', this.serial] : [this.adbPath]; }

  async shell(cmd: string): Promise<string> {
    const [bin, ...pre] = this.base();
    const { stdout } = await pexec(bin, [...pre, 'shell', cmd], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  }

  async raw(args: string[]): Promise<Buffer> {
    const [bin, ...pre] = this.base();
    const opts = { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' } as Parameters<typeof pexec>[2];
    const { stdout } = await pexec(bin, [...pre, ...args], opts);
    return stdout as unknown as Buffer;
  }

  async pidOf(appId: string): Promise<number | null> {
    const out = (await this.shell(`pidof ${appId}`)).trim();
    return out ? Number(out.split(/\s+/)[0]) : null;
  }

  async webviewPid(): Promise<number | null> {
    return parseWebviewPid(await this.shell('grep -a webview_devtools_remote /proc/net/unix'));
  }

  async forward(localPort: number, pid: number): Promise<void> {
    const [bin, ...pre] = this.base();
    await pexec(bin, [...pre, 'forward', `tcp:${localPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  }

  async removeForward(localPort: number): Promise<void> {
    const [bin, ...pre] = this.base();
    await pexec(bin, [...pre, 'forward', '--remove', `tcp:${localPort}`]).catch(() => {});
  }

  async tap(x: number, y: number) { await this.shell(`input tap ${x} ${y}`); }
  async longPress(x: number, y: number) { await this.shell(`input swipe ${x} ${y} ${x} ${y} 600`); }
  async keyevent(code: string) { await this.shell(`input keyevent ${code}`); }
  async startActivity(activity: string) { await this.shell(`am start -n ${activity}`); }
  async forceStop(appId: string) { await this.shell(`am force-stop ${appId}`); }
  async screencapPng(): Promise<Buffer> { return this.raw(['exec-out', 'screencap', '-p']); }
}
