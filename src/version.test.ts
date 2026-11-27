// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import packageJsonRaw from '../package.json?raw';
import gradleRaw from '../android/app/build.gradle?raw';

/**
 * Coherencia de versiones para GitHub Releases y F-Droid: `versionName` de Android debe ser la
 * versión de package.json y `versionCode` debe seguir la convención mayor·10000 + menor·100 + parche
 * (monótona creciente, como exige F-Droid).
 */
describe('Versión de la app', () => {
  it('package.json y android/app/build.gradle están sincronizados', () => {
    const version = (JSON.parse(packageJsonRaw) as { version: string }).version;
    const [major, minor, patch] = version.split('.').map(Number);
    const versionName = /versionName\s+"([^"]+)"/.exec(gradleRaw)?.[1];
    const versionCode = Number(/versionCode\s+(\d+)/.exec(gradleRaw)?.[1]);

    expect(versionName).toBe(version);
    expect(versionCode).toBe(major! * 10000 + minor! * 100 + patch!);
  });
});
