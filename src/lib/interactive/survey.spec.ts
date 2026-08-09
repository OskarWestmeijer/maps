import { describe, it, expect } from 'vitest';
import { toLabourSurvey } from './survey';

// Trimmed to the columns that matter, but keeps the real file's shape: a free-text title
// line, a blank line, then header and data.
const csv = `"135z -- Työvoimatutkimuksen tärkeimmät tunnusluvut, 2010M01-2026M06"

"Kuukausi";"Työlliset, 1000 henkilöä";"Työttömyysaste, %";"Työttömyysaste, %, trendi";"Työttömyysaste, %, kausitasoitettu sarja"
"2026M06";2658;10.0;10.5;10.1
`;

describe('toLabourSurvey', () => {
	const survey = toLabourSurvey(csv);

	it('takes the trend series, which is the figure Tilastokeskus advertises', () => {
		expect(survey.rate).toBe(10.5);
	});

	it('keeps the unadjusted figure separate', () => {
		// "Työttömyysaste, %" is a prefix of the other two column names, so an index lookup
		// that matched loosely would return the wrong column here.
		expect(survey.rateOriginal).toBe(10.0);
	});

	it('reads the period', () => {
		expect(survey.period).toBe('2026M06');
	});

	it('accepts comma decimals, which other Tilastokeskus exports use', () => {
		const commas = csv.replace('10.0;10.5;10.1', '10,0;10,5;10,1');

		expect(toLabourSurvey(commas).rate).toBe(10.5);
	});

	it('returns null instead of guessing when a column is absent', () => {
		const missing = `"title"

"Kuukausi";"Työlliset, 1000 henkilöä"
"2026M06";2658
`;

		expect(toLabourSurvey(missing).rate).toBeNull();
	});

	it('throws if the header row cannot be found', () => {
		expect(() => toLabourSurvey('just a title line\n')).toThrow();
	});
});
