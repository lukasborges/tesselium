import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlasma, plasmaPanelForeground, readKdeConfig, tintGreys } from '../../src/main/panelcolour.ts';

const paths = { configHome: '/config', dataDirs: ['/home/share', '/usr/share'] };
const reader = (files: Record<string, string>) => (path: string) => files[path] ?? null;
const SCHEME_LIGHT = '[Colors:Header]\nForegroundNormal=1,1,1\n[Colors:Window]\nBackgroundNormal=239,240,241\nForegroundNormal=35,38,41\n';
const SCHEME_DARK = '[Colors:Window]\nForegroundNormal=252,252,252\n';

test('knows Plasma by the desktop it says it is', () => {
	assert.equal(isPlasma({ XDG_CURRENT_DESKTOP: 'KDE' }), true);
	assert.equal(isPlasma({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }), false);
	assert.equal(isPlasma({}), false);
});

test('reads a key from its own group only', () => {
	assert.equal(readKdeConfig(SCHEME_LIGHT, 'Colors:Window', 'ForegroundNormal'), '35,38,41');
	assert.equal(readKdeConfig(SCHEME_LIGHT, 'Colors:View', 'ForegroundNormal'), null);
});

test('takes the panel colour from the colour scheme when the Plasma theme follows it', () => {
	assert.deepEqual(plasmaPanelForeground(paths, reader({
		'/config/kdeglobals': SCHEME_DARK,
		'/usr/share/plasma/desktoptheme/default/metadata.json': '{}'
	})), [252, 252, 252]);
});

test('takes it from the Plasma theme when the theme brings colours of its own', () => {
	assert.deepEqual(plasmaPanelForeground(paths, reader({
		'/config/plasmarc': '[Theme]\nname=breeze-dark\n',
		'/config/kdeglobals': SCHEME_LIGHT,
		'/usr/share/plasma/desktoptheme/breeze-dark/colors': SCHEME_DARK
	})), [252, 252, 252]);
	assert.deepEqual(plasmaPanelForeground(paths, reader({
		'/config/plasmarc': '[Theme]\nname=breeze-light\n',
		'/config/kdeglobals': SCHEME_DARK,
		'/home/share/plasma/desktoptheme/breeze-light/colors': SCHEME_LIGHT
	})), [35, 38, 41]);
});

test('falls back to Breeze light when nothing says otherwise', () => {
	assert.deepEqual(plasmaPanelForeground(paths, reader({})), [35, 38, 41]);
});

test('repaints the grey of the mark, keeping its coverage, and leaves the red dot', () => {
	// premultiplied BGRA: opaque white, half-covered white, transparent, opaque red
	const bitmap = Buffer.from([255, 255, 255, 255, 128, 128, 128, 128, 0, 0, 0, 0, 36, 27, 224, 255]);
	assert.deepEqual([...tintGreys(bitmap, [35, 38, 41])], [41, 38, 35, 255, 21, 19, 18, 128, 0, 0, 0, 0, 36, 27, 224, 255]);
});
