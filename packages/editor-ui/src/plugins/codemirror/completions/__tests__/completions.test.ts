import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { DateTime } from 'luxon';

import * as workflowHelpers from '@/composables/useWorkflowHelpers';
import { dollarOptions } from '@/plugins/codemirror/completions/dollar.completions';
import * as utils from '@/plugins/codemirror/completions/utils';
import {
	extensions,
	luxonInstanceOptions,
	luxonStaticOptions,
	natives,
} from '@/plugins/codemirror/completions/datatype.completions';

import { mockNodes, mockProxy } from './mock';
import type { CompletionSource, CompletionResult } from '@codemirror/autocomplete';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { n8nLang } from '@/plugins/codemirror/n8nLang';
import { useExternalSecretsStore } from '@/stores/externalSecrets.ee.store';
import { useUIStore } from '@/stores/ui.store';
import { useSettingsStore } from '@/stores/settings.store';
import { CREDENTIAL_EDIT_MODAL_KEY, EnterpriseEditionFeature } from '@/constants';
import {
	ARRAY_NUMBER_ONLY_METHODS,
	LUXON_RECOMMENDED_OPTIONS,
	METADATA_SECTION,
	METHODS_SECTION,
	RECOMMENDED_SECTION,
	STRING_RECOMMENDED_OPTIONS,
} from '../constants';
import { set, uniqBy } from 'lodash-es';

let externalSecretsStore: ReturnType<typeof useExternalSecretsStore>;
let uiStore: ReturnType<typeof useUIStore>;
let settingsStore: ReturnType<typeof useSettingsStore>;

beforeEach(async () => {
	setActivePinia(createTestingPinia());

	externalSecretsStore = useExternalSecretsStore();
	uiStore = useUIStore();
	settingsStore = useSettingsStore();

	vi.spyOn(utils, 'receivesNoBinaryData').mockReturnValue(true); // hide $binary
	vi.spyOn(utils, 'isSplitInBatchesAbsent').mockReturnValue(false); // show context
	vi.spyOn(utils, 'hasActiveNode').mockReturnValue(true);
});

describe('No completions', () => {
	test('should not return completions mid-word: {{ "ab|c" }}', () => {
		expect(completions('{{ "ab|c" }}')).toBeNull();
	});

	test('should not return completions for isolated dot: {{ "abc. |" }}', () => {
		expect(completions('{{ "abc. |" }}')).toBeNull();
	});
});

describe('Top-level completions', () => {
	test('should return dollar completions for blank position: {{ | }}', () => {
		const result = completions('{{ | }}');
		expect(result).toHaveLength(dollarOptions().length);

		expect(result?.[0]).toEqual(
			expect.objectContaining({ label: '$json', section: RECOMMENDED_SECTION }),
		);
		expect(result?.[4]).toEqual(
			expect.objectContaining({ label: '$execution', section: METADATA_SECTION }),
		);
		expect(result?.[14]).toEqual(
			expect.objectContaining({ label: '$max()', section: METHODS_SECTION }),
		);
	});

	test('should return DateTime completion for: {{ D| }}', () => {
		const found = completions('{{ D| }}');

		if (!found) throw new Error('Expected to find completion');

		expect(found).toHaveLength(1);
		expect(found[0].label).toBe('DateTime');
	});

	test('should return Math completion for: {{ M| }}', () => {
		const found = completions('{{ M| }}');

		if (!found) throw new Error('Expected to find completion');

		expect(found).toHaveLength(1);
		expect(found[0].label).toBe('Math');
	});

	test('should return Object completion for: {{ O| }}', () => {
		const found = completions('{{ O| }}');

		if (!found) throw new Error('Expected to find completion');

		expect(found).toHaveLength(1);
		expect(found[0].label).toBe('Object');
	});

	test('should return dollar completions for: {{ $| }}', () => {
		expect(completions('{{ $| }}')).toHaveLength(dollarOptions().length);
	});

	test('should return node selector completions for: {{ $(| }}', () => {
		vi.spyOn(utils, 'autocompletableNodeNames').mockReturnValue(mockNodes.map((node) => node.name));

		expect(completions('{{ $(| }}')).toHaveLength(mockNodes.length);
	});
});

describe('Luxon method completions', () => {
	test('should return class completions for: {{ DateTime.| }}', () => {
		// @ts-expect-error Spied function is mistyped
		vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(DateTime);

		expect(completions('{{ DateTime.| }}')).toHaveLength(luxonStaticOptions().length);
	});

	test('should return instance completions for: {{ $now.| }}', () => {
		// @ts-expect-error Spied function is mistyped
		vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(DateTime.now());

		expect(completions('{{ $now.| }}')).toHaveLength(
			uniqBy(luxonInstanceOptions().concat(extensions('date')), (option) => option.label).length +
				LUXON_RECOMMENDED_OPTIONS.length,
		);
	});

	test('should return instance completions for: {{ $today.| }}', () => {
		// @ts-expect-error Spied function is mistyped
		vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(DateTime.now());

		expect(completions('{{ $today.| }}')).toHaveLength(
			uniqBy(luxonInstanceOptions().concat(extensions('date')), (option) => option.label).length +
				LUXON_RECOMMENDED_OPTIONS.length,
		);
	});
});

describe('Resolution-based completions', () => {
	describe('literals', () => {
		test('should return completions for string literal: {{ "abc".| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce('abc');

			expect(completions('{{ "abc".| }}')).toHaveLength(
				natives('string').length + extensions('string').length + STRING_RECOMMENDED_OPTIONS.length,
			);
		});

		test('should properly handle string that contain dollar signs', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce("You 'owe' me 200$ ");

			const result = completions('{{ "You \'owe\' me 200$".| }}');

			expect(result).toHaveLength(natives('string').length + extensions('string').length + 1);
		});

		test('should return completions for number literal: {{ (123).| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(123);

			expect(completions('{{ (123).| }}')).toHaveLength(
				natives('number').length + extensions('number').length + ['isEven()', 'isOdd()'].length,
			);
		});

		test('should return completions for array literal: {{ [1, 2, 3].| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce([1, 2, 3]);

			expect(completions('{{ [1, 2, 3].| }}')).toHaveLength(
				natives('array').length + extensions('array').length,
			);
		});

		test('should return completions for Object methods: {{ Object.values({ abc: 123 }).| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce([123]);

			const found = completions('{{ Object.values({ abc: 123 }).| }}');

			if (!found) throw new Error('Expected to find completion');

			expect(found).toHaveLength(natives('array').length + extensions('array').length);
		});

		test('should return completions for object literal', () => {
			const object = { a: 1 };

			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(object);

			expect(completions('{{ ({ a: 1 }).| }}')).toHaveLength(
				Object.keys(object).length + extensions('object').length,
			);
		});
	});

	describe('indexed access completions', () => {
		test('should return string completions for indexed access that resolves to string literal: {{ "abc"[0].| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce('a');

			expect(completions('{{ "abc"[0].| }}')).toHaveLength(
				natives('string').length + extensions('string').length + STRING_RECOMMENDED_OPTIONS.length,
			);
		});
	});

	describe('complex expression completions', () => {
		const { $input } = mockProxy;

		test('should return completions when $input is used as a function parameter', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.num);
			const found = completions('{{ Math.abs($input.item.json.num1).| }}');
			if (!found) throw new Error('Expected to find completions');
			expect(found).toHaveLength(
				extensions('number').length + natives('number').length + ['isEven()', 'isOdd()'].length,
			);
		});

		test('should return completions when node reference is used as a function parameter', () => {
			const initialState = { workflows: { workflow: { nodes: mockNodes } } };

			setActivePinia(createTestingPinia({ initialState }));

			expect(completions('{{ new Date($(|) }}')).toHaveLength(mockNodes.length);
		});

		test('should return completions for complex expression: {{ $now.diff($now.diff($now.|)) }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(DateTime.now());
			expect(completions('{{ $now.diff($now.diff($now.|)) }}')).toHaveLength(
				uniqBy(luxonInstanceOptions().concat(extensions('date')), (option) => option.label).length +
					LUXON_RECOMMENDED_OPTIONS.length,
			);
		});

		test('should return completions for complex expression: {{ $execution.resumeUrl.includes($json.) }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce($input.item.json);
			const { $json } = mockProxy;
			const found = completions('{{ $execution.resumeUrl.includes($json.|) }}');

			if (!found) throw new Error('Expected to find completions');
			expect(found).toHaveLength(Object.keys($json).length + extensions('object').length);
		});

		test('should return completions for operation expression: {{ $now.day + $json. }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce($input.item.json);
			const { $json } = mockProxy;
			const found = completions('{{ $now.day + $json.| }}');

			if (!found) throw new Error('Expected to find completions');

			expect(found).toHaveLength(Object.keys($json).length + extensions('object').length);
		});

		test('should return completions for operation expression: {{ Math.abs($now.day) >= 10 ? $now : Math.abs($json.). }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json);
			const { $json } = mockProxy;
			const found = completions('{{ Math.abs($now.day) >= 10 ? $now : Math.abs($json.|) }}');

			if (!found) throw new Error('Expected to find completions');

			expect(found).toHaveLength(Object.keys($json).length + extensions('object').length);
		});
	});

	describe('bracket-aware completions', () => {
		const { $input } = mockProxy;

		test('should return bracket-aware completions for: {{ $input.item.json.str.|() }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.str);

			const found = completions('{{ $input.item.json.str.|() }}');

			if (!found) throw new Error('Expected to find completions');

			expect(found).toHaveLength(
				extensions('string').length + natives('string').length + STRING_RECOMMENDED_OPTIONS.length,
			);
			expect(found.map((c) => c.label).every((l) => !l.endsWith('()')));
		});

		test('should return bracket-aware completions for: {{ $input.item.json.num.|() }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.num);

			const found = completions('{{ $input.item.json.num.|() }}');

			if (!found) throw new Error('Expected to find completions');

			expect(found).toHaveLength(
				extensions('number').length + natives('number').length + ['isEven()', 'isOdd()'].length,
			);
			expect(found.map((c) => c.label).every((l) => !l.endsWith('()')));
		});

		test('should return bracket-aware completions for: {{ $input.item.json.arr.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.arr);

			const found = completions('{{ $input.item.json.arr.|() }}');

			if (!found) throw new Error('Expected to find completions');

			expect(found).toHaveLength(extensions('array').length + natives('array').length);
			expect(found.map((c) => c.label).every((l) => !l.endsWith('()')));
		});
	});

	describe('secrets', () => {
		const { $input } = mockProxy;

		beforeEach(() => {});

		test('should return completions for: {{ $secrets.| }}', () => {
			const provider = 'infisical';
			const secrets = ['SECRET'];

			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input);

			uiStore.modals[CREDENTIAL_EDIT_MODAL_KEY].open = true;
			set(settingsStore.settings, ['enterprise', EnterpriseEditionFeature.ExternalSecrets], true);
			externalSecretsStore.state.secrets = {
				[provider]: secrets,
			};

			const result = completions('{{ $secrets.| }}');

			expect(result).toEqual([
				{
					info: expect.any(Function),
					label: provider,
					type: 'keyword',
					apply: expect.any(Function),
				},
			]);
		});

		test('should return completions for: {{ $secrets.provider.| }}', () => {
			const provider = 'infisical';
			const secrets = ['SECRET1', 'SECRET2'];

			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input);

			uiStore.modals[CREDENTIAL_EDIT_MODAL_KEY].open = true;
			set(settingsStore.settings, ['enterprise', EnterpriseEditionFeature.ExternalSecrets], true);
			externalSecretsStore.state.secrets = {
				[provider]: secrets,
			};

			const result = completions(`{{ $secrets.${provider}.| }}`);

			expect(result).toEqual([
				{
					info: expect.any(Function),
					label: secrets[0],
					type: 'keyword',
					apply: expect.any(Function),
				},
				{
					info: expect.any(Function),
					label: secrets[1],
					type: 'keyword',
					apply: expect.any(Function),
				},
			]);
		});
	});

	describe('references', () => {
		const { $input, $ } = mockProxy;

		test('should return completions for: {{ $input.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input);

			expect(completions('{{ $input.| }}')).toHaveLength(Reflect.ownKeys($input).length);
		});

		test('should return completions for: {{ "hello"+input.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input);

			expect(completions('{{ "hello"+$input.| }}')).toHaveLength(Reflect.ownKeys($input).length);
		});

		test("should return completions for: {{ $('nodeName').| }}", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($('Rename'));

			expect(completions('{{ $("Rename").| }}')).toHaveLength(
				Reflect.ownKeys($('Rename')).length - ['pairedItem'].length,
			);
		});

		test("should return completions for: {{ $('(Complex) \"No\\'de\" name').| }}", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($('Rename'));

			expect(completions("{{ $('(Complex) \"No\\'de\" name').| }}")).toHaveLength(
				Reflect.ownKeys($('Rename')).length - ['pairedItem'].length,
			);
		});

		test('should return completions for: {{ $input.item.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item);

			const found = completions('{{ $input.item.| }}');

			if (!found) throw new Error('Expected to find completion');

			expect(found).toHaveLength(1);
			expect(found[0].label).toBe('json');
		});

		test('should return completions for: {{ $input.first().| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.first());

			const found = completions('{{ $input.first().| }}');

			if (!found) throw new Error('Expected to find completion');

			expect(found).toHaveLength(1);
			expect(found[0].label).toBe('json');
		});

		test('should return completions for: {{ $input.last().| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.last());

			const found = completions('{{ $input.last().| }}');

			if (!found) throw new Error('Expected to find completion');

			expect(found).toHaveLength(1);
			expect(found[0].label).toBe('json');
		});

		test('should return completions for: {{ $input.all().| }}', () => {
			// @ts-expect-error
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue([$input.item]);

			expect(completions('{{ $input.all().| }}')).toHaveLength(
				extensions('array').length + natives('array').length - ARRAY_NUMBER_ONLY_METHODS.length,
			);
		});

		test("should return completions for: '{{ $input.item.| }}'", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json);

			expect(completions('{{ $input.item.| }}')).toHaveLength(
				Object.keys($input.item.json).length + extensions('object').length,
			);
		});

		test("should return completions for: '{{ $input.first().| }}'", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.first().json);

			expect(completions('{{ $input.first().| }}')).toHaveLength(
				Object.keys($input.first().json).length + extensions('object').length,
			);
		});

		test("should return completions for: '{{ $input.last().| }}'", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.last().json);

			expect(completions('{{ $input.last().| }}')).toHaveLength(
				Object.keys($input.last().json).length + extensions('object').length,
			);
		});

		test("should return completions for: '{{ $input.all()[0].| }}'", () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.all()[0].json);

			expect(completions('{{ $input.all()[0].| }}')).toHaveLength(
				Object.keys($input.all()[0].json).length + extensions('object').length,
			);
		});

		test('should return completions for: {{ $input.item.json.str.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.str);

			expect(completions('{{ $input.item.json.str.| }}')).toHaveLength(
				extensions('string').length + natives('string').length + STRING_RECOMMENDED_OPTIONS.length,
			);
		});

		test('should return completions for: {{ $input.item.json.num.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.num);

			expect(completions('{{ $input.item.json.num.| }}')).toHaveLength(
				extensions('number').length + natives('number').length + ['isEven()', 'isOdd()'].length,
			);
		});

		test('should return completions for: {{ $input.item.json.arr.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.arr);

			expect(completions('{{ $input.item.json.arr.| }}')).toHaveLength(
				extensions('array').length + natives('array').length,
			);
		});

		test('should return completions for: {{ $input.item.json.obj.| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.obj);

			expect(completions('{{ $input.item.json.obj.| }}')).toHaveLength(
				Object.keys($input.item.json.obj).length + extensions('object').length,
			);
		});
	});

	describe('bracket access', () => {
		const { $input } = mockProxy;

		['{{ $input.item.json[| }}', '{{ $json[| }}'].forEach((expression) => {
			test(`should return completions for: ${expression}`, () => {
				vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json);

				const found = completions(expression);

				if (!found) throw new Error('Expected to find completions');

				expect(found).toHaveLength(Object.keys($input.item.json).length);
				expect(found.map((c) => c.label).every((l) => l.endsWith(']')));
			});
		});

		["{{ $input.item.json['obj'][| }}", "{{ $json['obj'][| }}"].forEach((expression) => {
			test(`should return completions for: ${expression}`, () => {
				vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValue($input.item.json.obj);

				const found = completions(expression);

				if (!found) throw new Error('Expected to find completions');

				expect(found).toHaveLength(Object.keys($input.item.json.obj).length);
				expect(found.map((c) => c.label).every((l) => l.endsWith(']')));
			});
		});
	});

	describe('recommended completions', () => {
		test('should recommended toDate() for {{ "1-Feb-2024".| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce('1-Feb-2024');

			expect(completions('{{ "1-Feb-2024".| }}')?.[0]).toEqual(
				expect.objectContaining({ label: 'toDate()', section: RECOMMENDED_SECTION }),
			);
		});

		test('should recommended toInt(),toFloat() for: {{ "5.3".| }}', () => {
			// @ts-expect-error Spied function is mistyped
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce('5.3');
			const options = completions('{{ "5.3".| }}');
			expect(options?.[0]).toEqual(
				expect.objectContaining({ label: 'toInt()', section: RECOMMENDED_SECTION }),
			);
			expect(options?.[1]).toEqual(
				expect.objectContaining({ label: 'toFloat()', section: RECOMMENDED_SECTION }),
			);
		});

		test('should recommended extractEmail() for: {{ "string with test@n8n.io in it".| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(
				// @ts-expect-error Spied function is mistyped
				'string with test@n8n.io in it',
			);
			const options = completions('{{ "string with test@n8n.io in it".| }}');
			expect(options?.[0]).toEqual(
				expect.objectContaining({ label: 'extractEmail()', section: RECOMMENDED_SECTION }),
			);
		});

		test('should recommended extractDomain() for: {{ "test@n8n.io".| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(
				// @ts-expect-error Spied function is mistyped
				'test@n8n.io',
			);
			const options = completions('{{ "test@n8n.io".| }}');
			expect(options?.[0]).toEqual(
				expect.objectContaining({ label: 'extractDomain()', section: RECOMMENDED_SECTION }),
			);
		});

		test('should recommended round(),floor(),ceil() for: {{ (5.46).| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter').mockReturnValueOnce(
				// @ts-expect-error Spied function is mistyped
				5.46,
			);
			const options = completions('{{ (5.46).| }}');
			expect(options?.[0]).toEqual(
				expect.objectContaining({ label: 'round()', section: RECOMMENDED_SECTION }),
			);
			expect(options?.[1]).toEqual(
				expect.objectContaining({ label: 'floor()', section: RECOMMENDED_SECTION }),
			);
			expect(options?.[2]).toEqual(
				expect.objectContaining({ label: 'ceil()', section: RECOMMENDED_SECTION }),
			);
		});
	});

	describe('explicit completions (opened by Ctrl+Space or programatically)', () => {
		test('should return completions for: {{ $json.foo| }}', () => {
			vi.spyOn(workflowHelpers, 'resolveParameter')
				// @ts-expect-error Spied function is mistyped
				.mockReturnValueOnce(undefined)
				// @ts-expect-error Spied function is mistyped
				.mockReturnValueOnce('foo');

			const result = completions('{{ $json.foo| }}', true);
			expect(result).toHaveLength(
				extensions('string').length + natives('string').length + STRING_RECOMMENDED_OPTIONS.length,
			);
		});
	});
});

export function completions(docWithCursor: string, explicit = false) {
	const cursorPosition = docWithCursor.indexOf('|');

	const doc = docWithCursor.slice(0, cursorPosition) + docWithCursor.slice(cursorPosition + 1);

	const state = EditorState.create({
		doc,
		selection: { anchor: cursorPosition },
		extensions: [n8nLang()],
	});

	const context = new CompletionContext(state, cursorPosition, explicit);

	for (const completionSource of state.languageDataAt<CompletionSource>(
		'autocomplete',
		cursorPosition,
	)) {
		const result = completionSource(context);

		if (isCompletionResult(result)) return result.options;
	}

	return null;
}

function isCompletionResult(
	candidate: ReturnType<CompletionSource>,
): candidate is CompletionResult {
	return candidate !== null && 'from' in candidate && 'options' in candidate;
}
