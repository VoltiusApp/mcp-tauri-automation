import { test } from 'node:test';
import assert from 'node:assert';
import { cdpHostFromAdbSocket } from './android-driver.js';

test('cdpHostFromAdbSocket extracts host from a remote tcp adb server socket', () => {
  // adb forward opens the port on the adb-server host, so CDP must target that host.
  assert.strictEqual(cdpHostFromAdbSocket('tcp:192.168.240.1:5037'), '192.168.240.1');
});

test('cdpHostFromAdbSocket supports a bracketed IPv6 host', () => {
  assert.strictEqual(cdpHostFromAdbSocket('tcp:[::1]:5037'), '[::1]');
});

test('cdpHostFromAdbSocket returns undefined for local adb (unix socket / unset)', () => {
  assert.strictEqual(cdpHostFromAdbSocket(undefined), undefined);
  assert.strictEqual(cdpHostFromAdbSocket('localfilesystem:/tmp/adb.sock'), undefined);
});
