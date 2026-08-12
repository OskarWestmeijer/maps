import { describe, it, expect } from 'vitest';
import { decimal, formatDate, sourceLine } from './format';

describe('decimal', () => {
	it('groups the integer part and uses a Finnish comma', () => {
		expect(decimal(3235.84)).toBe('3 235,8');
	});

	it('drops the separator entirely at zero digits, rather than joining on nothing', () => {
		// The compare map's percentiles are whole numbers — a decimal place there would be false
		// precision. Without the guard this rendered "96,undefined".
		expect(decimal(96.4, 0)).toBe('96');
		expect(decimal(1234.5, 0)).toBe('1 235');
	});

	it('em-dashes a missing figure', () => {
		expect(decimal(null)).toBe('—');
	});
});

describe('formatDate', () => {
	it('formats the manifest timestamp', () => {
		expect(formatDate('2026-08-11T05:31:04Z')).toBe('11 Aug 2026');
	});

	it('drops the leading zero from the day', () => {
		expect(formatDate('2026-08-01T05:31:04Z')).toBe('1 Aug 2026');
	});

	it('reads the string rather than constructing a Date', () => {
		// The timestamp is a UTC instant. A local `Date` would render this as 10 Aug for anyone
		// west of Greenwich, silently disagreeing with the file it came from.
		expect(formatDate('2026-08-11T00:30:00Z')).toBe('11 Aug 2026');
	});

	it('returns nothing for a missing date, so the line simply drops it', () => {
		expect(formatDate(null)).toBe('');
		expect(formatDate(undefined)).toBe('');
		expect(formatDate('')).toBe('');
	});

	it('returns nothing rather than "Invalid Date" for a malformed manifest', () => {
		expect(formatDate('yesterday')).toBe('');
		expect(formatDate('2026-13-11T05:31:04Z')).toBe('');
	});
});

describe('sourceLine', () => {
	it('joins the fragments it was given', () => {
		expect(sourceLine('KEHA-keskus', 'June 2026', 'polled 11 Aug 2026')).toBe(
			'KEHA-keskus · June 2026 · polled 11 Aug 2026'
		);
	});

	it('leaves no dangling separator when the live figures have not landed', () => {
		expect(sourceLine('KEHA-keskus', '', null)).toBe('KEHA-keskus');
		expect(sourceLine('', '', undefined)).toBe('');
	});
});
