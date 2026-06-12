import { test } from 'node:test';
import assert from 'node:assert';
import { parseWebviewPid, mapToDeviceCoords } from './adb.js';

test('parseWebviewPid extracts pid from /proc/net/unix line', () => {
  const out =
    '0000 0 0 0001 01 12345 @webview_devtools_remote_4567\n' +
    '0000 0 0 0001 01 12346 @some_other_socket\n';
  assert.strictEqual(parseWebviewPid(out), 4567);
});

test('parseWebviewPid returns null when absent', () => {
  assert.strictEqual(parseWebviewPid('nothing here'), null);
});

test('mapToDeviceCoords scales CSS px by devicePixelRatio', () => {
  assert.deepStrictEqual(mapToDeviceCoords(100, 200, 3), { x: 300, y: 600 });
});

test('parseWebviewPid returns the first pid when multiple sockets exist', () => {
  const out = '@webview_devtools_remote_1111\n@webview_devtools_remote_2222\n';
  assert.strictEqual(parseWebviewPid(out), 1111);
});
