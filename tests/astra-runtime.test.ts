import { ASTRA_RUNTIME, KIT_SYNC_CODE } from '../src/astra-runtime';
import { assembleBuild } from '../src/astra';

const runtime: any = new Function('return (' + ASTRA_RUNTIME + ')')();

function fakeFigma() {
	const log: string[] = [];
	let seq = 0;
	const mixed = Symbol('mixed');
	const detach = (c: any) => {
		if (c.parent) {
			const i = c.parent.children.indexOf(c);
			if (i >= 0) c.parent.children.splice(i, 1);
		}
	};
	const markRemoved = (n: any) => {
		n.removed = true;
		n.children.forEach(markRemoved);
	};
	const walk = (n: any, f: (x: any) => boolean, out: any[]) => {
		n.children.forEach((c: any) => {
			if (f(c)) out.push(c);
			walk(c, f, out);
		});
		return out;
	};
	const node = (type: string, extra: any = {}): any => {
		const n: any = Object.assign(
			{
				id: String(++seq) + ':1',
				type,
				name: '',
				children: [],
				parent: null,
				removed: false,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				fills: [],
				layoutMode: 'NONE',
			},
			extra,
		);
		n.appendChild = (c: any) => {
			detach(c);
			c.parent = n;
			n.children.push(c);
		};
		n.insertChild = (i: number, c: any) => {
			detach(c);
			c.parent = n;
			n.children.splice(i, 0, c);
		};
		n.remove = () => {
			detach(n);
			n.parent = null;
			markRemoved(n);
		};
		n.resize = (w: number, h: number) => {
			n.width = w;
			n.height = h;
		};
		n.rescale = (s: number) => {
			n.width *= s;
			n.height *= s;
		};
		n.findAll = (f: (x: any) => boolean) => walk(n, f, []);
		n.findOne = (f: (x: any) => boolean) => walk(n, f, [])[0] || null;
		n.clone = () => {
			const copy = node(n.type, {
				name: n.name,
				x: n.x,
				y: n.y,
				width: n.width,
				height: n.height,
				fontName: n.fontName,
				characters: n.characters,
			});
			n.children.forEach((c: any) => copy.appendChild(c.clone()));
			if (n.parent) n.parent.appendChild(copy);
			return copy;
		};
		n.exportAsync = jest.fn(async () => new Uint8Array([1, 2, 3]));
		return n;
	};
	const currentPage = node('PAGE');
	const setProperties = jest.fn();
	const variant = node('COMPONENT', { key: 'k-chip-default' });
	variant.createInstance = jest.fn(() => {
		log.push('create instance');
		const i = node('INSTANCE');
		i.setProperties = setProperties;
		currentPage.appendChild(i);
		return i;
	});
	const chipSet = node('COMPONENT_SET', { key: 'k-chip', defaultVariant: variant });
	const add = (n: any) => {
		currentPage.appendChild(n);
		return n;
	};
	const figma: any = {
		mixed,
		root: { name: 'Test file' },
		currentPage,
		createFrame: jest.fn(() => {
			log.push('create frame');
			return add(node('FRAME'));
		}),
		createText: jest.fn(() => {
			log.push('create text');
			return add(node('TEXT'));
		}),
		createRectangle: jest.fn(() => {
			log.push('create rectangle');
			return add(node('RECTANGLE'));
		}),
		createNodeFromSvg: jest.fn(() => {
			log.push('create svg');
			return add(node('FRAME'));
		}),
		createImage: jest.fn(() => ({ hash: 'img-hash', getSizeAsync: async () => ({ width: 800, height: 400 }) })),
		base64Decode: jest.fn(() => new Uint8Array([0])),
		base64Encode: jest.fn(() => 'QUJD'),
		loadFontAsync: jest.fn(async (f: any) => {
			log.push('font ' + f.family + ' ' + f.style);
		}),
		getNodeByIdAsync: jest.fn(async () => null),
		getStyleByIdAsync: jest.fn(async () => null),
		importComponentSetByKeyAsync: jest.fn(async (key: string) => {
			log.push('import ' + key);
			return chipSet;
		}),
		importComponentByKeyAsync: jest.fn(async (key: string) => {
			log.push('import ' + key);
			return variant;
		}),
		importStyleByKeyAsync: jest.fn(async (key: string) => ({ id: 'S:' + key, key })),
		variables: {
			getVariableByIdAsync: jest.fn(async () => null),
			importVariableByKeyAsync: jest.fn(async (key: string) => ({ id: 'VariableID:' + key, key })),
			setBoundVariableForPaint: jest.fn((paint: any) => paint),
		},
	};
	return { figma, log, node, setProperties, variant };
}

const OPTS = { resolveMs: 1000, totalMs: 2000, look: null };

const KIT = {
	file: 'Kit',
	synced: '2026-09-28T00:00:00.000Z',
	components: {
		Chip: {
			key: 'k-chip',
			id: '9:1',
			set: true,
			fonts: [['Inter', 'Medium']],
			props: { 'Label#1:2': 'T', State: ['On', 'Off'] },
		},
	},
	styles: {},
	variables: { 'bg/base': { key: 'k-bg', id: 'VariableID:9:2', type: 'COLOR' } },
	dupes: [],
};

function build(fig: any, ds: any, code: (v: any) => void, opts: any = OPTS, assets: any = {}) {
	const A = runtime(fig, ds, assets, opts);
	code(A.verbs);
	return A.run();
}

describe('astra runtime source', () => {
	it.each([
		['ASTRA_RUNTIME', ASTRA_RUNTIME],
		['KIT_SYNC_CODE', KIT_SYNC_CODE],
	])('%s holds no backtick, optional chain or nullish coalescing', (_name, src) => {
		expect(/`|\?\.|\?\?/.test(src)).toBe(false);
	});

	it('compiles KIT_SYNC_CODE as an async function body', () => {
		const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
		expect(typeof new AsyncFunction('figma', KIT_SYNC_CODE)).toBe('function');
	});
});

describe('parseProps', () => {
	const parse = (s: string) => runtime(null, null, {}, OPTS).parseProps(s);

	it('reads a vertical page frame', () => {
		expect(parse('v w390 h844 bg:bg/base').p).toEqual({ layout: 'VERTICAL', w: 390, h: 844, bg: 'bg/base' });
	});

	it('reads a horizontal padded row', () => {
		expect(parse('h p16 between').p).toEqual({ layout: 'HORIZONTAL', pad: [16, 16, 16, 16], main: 'SPACE_BETWEEN' });
	});

	it('reads a horizontal margin', () => {
		expect(parse('fill mx16').p).toEqual({ fillW: true, margin: [0, 16, 0, 16] });
	});

	it('reads a gap and a horizontal padding', () => {
		expect(parse('h g8 px16').p).toEqual({ layout: 'HORIZONTAL', gap: 8, pad: [0, 16, 0, 16] });
	});

	it('reads a card', () => {
		expect(parse('v g8 p16 fill bg:bg/base r12').p).toEqual({
			layout: 'VERTICAL',
			gap: 8,
			pad: [16, 16, 16, 16],
			fillW: true,
			bg: 'bg/base',
			r: 12,
		});
	});

	it('converts millimetres', () => {
		expect(parse('w210mm').p.w).toBe(595.28);
	});

	it('converts inches', () => {
		expect(parse('w4in').p.w).toBe(288);
	});

	it('reads pt as padding top', () => {
		expect(parse('pt8').p.pad).toEqual([8, 0, 0, 0]);
	});

	it('reads a name', () => {
		expect(parse('#Header').p.name).toBe('Header');
	});

	it('warns an unknown token with its nearest', () => {
		expect(parse('fil').warn).toEqual(["props: unknown 'fil' (nearest 'fill')"]);
	});

	it('reads an empty string', () => {
		expect(parse('')).toEqual({ p: {}, warn: [] });
	});
});

describe('matchProp and matchName', () => {
	const rt = runtime(null, null, {}, OPTS);
	const keys = ['Label#123:4', 'State'];

	it('matches the part before #', () => {
		expect(rt.matchProp('Label', keys)).toEqual({ hit: 'Label#123:4' });
	});

	it('matches an exact key', () => {
		expect(rt.matchProp('State', keys)).toEqual({ hit: 'State' });
	});

	it('matches case-insensitively', () => {
		expect(rt.matchProp('label', keys)).toEqual({ hit: 'Label#123:4' });
	});

	it('returns the nearest prop name', () => {
		expect(rt.matchProp('Lable', keys)).toEqual({ nearest: 'Label' });
	});

	it('matches a name exactly', () => {
		expect(rt.matchName('Chip', ['Chip', 'Card'])).toEqual({ hit: 'Chip' });
	});

	it('matches a last path segment', () => {
		expect(rt.matchName('IconButton', ['Buttons/IconButton', 'Chip'])).toEqual({ hit: 'Buttons/IconButton' });
	});

	it('returns the nearest name', () => {
		expect(rt.matchName('Chp', ['Chip', 'Card'])).toEqual({ nearest: 'Chip' });
	});
});

describe('run without a kit', () => {
	it('builds a page and loads the inline font', async () => {
		const f = fakeFigma();
		const res = await build(f.figma, null, ({ page, frame, text }) => {
			page('P', 'v w390 h844', [frame('h p16', [text('Hi', 'Inter 16 Bold')])]);
		});
		expect(res.ids.P).toBeDefined();
		expect(f.figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Inter', style: 'Bold' });
	});

	it('warns an instance without a kit and still builds the page', async () => {
		const f = fakeFigma();
		const res = await build(f.figma, null, ({ page, inst }) => {
			page('P', 'v', [inst('Chip', {})]);
		});
		expect([res.warn, res.ids.P !== undefined]).toEqual([["inst 'Chip': no kit"], true]);
	});
});

describe('run with a kit', () => {
	const threeChips = ({ page, inst }: any) => {
		page('P', 'h', [1, 2, 3].map((i) => inst('Chip', { Label: 'A' + i, State: 'On' })));
	};

	it('imports a component once for three instances', async () => {
		const f = fakeFigma();
		await build(f.figma, KIT, threeChips);
		expect(f.figma.importComponentSetByKeyAsync).toHaveBeenCalledTimes(1);
	});

	it('maps the overrides onto the kit keys', async () => {
		const f = fakeFigma();
		await build(f.figma, KIT, threeChips);
		expect(f.setProperties).toHaveBeenCalledWith({ 'Label#1:2': 'A1', State: 'On' });
	});

	it('resolves every import and font before the first create', async () => {
		const f = fakeFigma();
		await build(f.figma, KIT, threeChips);
		const firstCreate = f.log.findIndex((l) => l.indexOf('create') === 0);
		const lastResolve = Math.max(
			...f.log.map((l, i) => (l.indexOf('import') === 0 || l.indexOf('font') === 0 ? i : -1)),
		);
		expect(lastResolve).toBeLessThan(firstCreate);
	});

	it('warns an unknown component with its nearest', async () => {
		const f = fakeFigma();
		const res = await build(f.figma, KIT, ({ page, inst }) => {
			page('P', 'v', [inst('Chp', {})]);
		});
		expect(res.warn).toEqual(["inst: unknown 'Chp' (nearest 'Chip')"]);
	});
});

describe('instance sizing', () => {
	const setup = (code: (v: any) => void) => {
		const f = fakeFigma();
		const made: any[] = [];
		f.variant.createInstance.mockImplementation(() => {
			const i = f.node('INSTANCE', { layoutMode: 'HORIZONTAL' });
			i.setProperties = f.setProperties;
			f.figma.currentPage.appendChild(i);
			made.push(i);
			return i;
		});
		return { made, result: build(f.figma, KIT, code) };
	};

	it('reads a props string in the overrides place without a warn', async () => {
		const { result } = setup(({ page, inst }: any) => {
			page('P', 'v', [inst('Chip', 'fill')]);
		});
		expect((await result).warn).toEqual([]);
	});

	it('fills with a props string in the overrides place', async () => {
		const { made, result } = setup(({ page, inst }: any) => {
			page('P', 'v', [inst('Chip', 'fill')]);
		});
		await result;
		expect(made[0].layoutSizingHorizontal).toBe('FILL');
	});

	it('keeps the sizing of an auto-layout component', async () => {
		const { made, result } = setup(({ page, inst }: any) => {
			page('P', 'v', [inst('Chip', {})]);
		});
		await result;
		expect([made[0].layoutSizingHorizontal, made[0].layoutSizingVertical]).toEqual([undefined, undefined]);
	});
});

describe('a failed font', () => {
	const rejectBad = (f: any) =>
		f.figma.loadFontAsync.mockImplementation(async (font: any) => {
			if (font.family === 'Bad') throw new Error('no such font');
		});

	it('warns the font and the skipped count', async () => {
		const f = fakeFigma();
		rejectBad(f);
		const res = await build(f.figma, null, ({ page, text }) => {
			page('P', 'v', [text('Hi', 'Bad 16 Bold')]);
		});
		expect(res.warn).toEqual(["font 'Bad Bold' failed: no such font (skipped 1)"]);
	});

	it('leaves the text out and builds the page', async () => {
		const f = fakeFigma();
		rejectBad(f);
		const res = await build(f.figma, null, ({ page, text }) => {
			page('P', 'v', [text('Hi', 'Bad 16 Bold')]);
		});
		const built = f.figma.currentPage.children.filter((n: any) => n.id === res.ids.P);
		expect(built.map((n: any) => n.children.length)).toEqual([0]);
	});
});

describe('a draw that throws', () => {
	const setup = () => {
		const f = fakeFigma();
		const old = f.node('FRAME', { name: 'P', x: 40, y: 60 });
		f.figma.currentPage.appendChild(old);
		f.variant.createInstance.mockImplementation(() => {
			throw new Error('boom');
		});
		const result = build(f.figma, KIT, ({ page, frame, inst }) => {
			page('P', 'v', [frame('h', [inst('Chip', {})])]);
		});
		return { f, old, result };
	};

	it('rejects with nothing kept', async () => {
		const { result } = setup();
		await expect(result).rejects.toThrow('build failed, nothing kept: boom');
	});

	it('removes every created node', async () => {
		const { f, result } = setup();
		await result.catch(() => null);
		const created = f.figma.createFrame.mock.results.map((r: any) => r.value);
		expect(created.every((n: any) => n.removed)).toBe(true);
	});

	it('leaves the existing page untouched', async () => {
		const { f, old, result } = setup();
		await result.catch(() => null);
		expect(f.figma.currentPage.children).toEqual([old]);
	});
});

describe('a rebuild', () => {
	it('replaces the page at the old position and index', async () => {
		const f = fakeFigma();
		const before = f.node('FRAME', { name: 'A' });
		const old = f.node('FRAME', { name: 'P', x: 500, y: 40 });
		const after = f.node('FRAME', { name: 'B' });
		[before, old, after].forEach((n) => f.figma.currentPage.appendChild(n));
		const res = await build(f.figma, null, ({ page, frame }) => {
			page('P', 'v', [frame('h')]);
		});
		const kids = f.figma.currentPage.children;
		expect([kids.map((n: any) => n.name), kids[1].id, kids[1].x, kids[1].y, old.removed]).toEqual([
			['A', 'P', 'B'],
			res.ids.P,
			500,
			40,
			true,
		]);
	});
});

describe('a resolve timeout', () => {
	const setup = () => {
		const f = fakeFigma();
		f.figma.importComponentSetByKeyAsync.mockImplementation(() => new Promise(() => undefined));
		const result = build(
			f.figma,
			KIT,
			({ page, inst }) => {
				page('P', 'v', [inst('Chip', {})]);
			},
			{ resolveMs: 50, totalMs: 100, look: null },
		);
		return { f, result };
	};

	it('rejects naming the pending import', async () => {
		const { result } = setup();
		await expect(result).rejects.toThrow("timeout after 50 ms resolving: comp 'Chip'");
	});

	it('creates no node', async () => {
		const { f, result } = setup();
		await result.catch(() => null);
		expect(f.log.filter((l) => l.indexOf('create') === 0)).toEqual([]);
	});
});

describe('clone and export', () => {
	const setup = () => {
		const f = fakeFigma();
		const src = f.node('FRAME', { name: 'P' });
		const title = f.node('TEXT', { name: 'Title', characters: 'Old', fontName: { family: 'Inter', style: 'Regular' } });
		src.appendChild(title);
		f.figma.currentPage.appendChild(src);
		const result = build(f.figma, null, ({ clone, exp }) => {
			clone('P', 'P2', { Title: 'New' });
			exp('P', 'png@4.17');
		});
		return { f, result };
	};

	it('sets the text inside the clone', async () => {
		const { f, result } = setup();
		const res = await result;
		const copy = f.figma.currentPage.children.filter((n: any) => n.id === res.ids.P2)[0];
		expect(copy.findOne((n: any) => n.name === 'Title').characters).toBe('New');
	});

	it('exports at the given scale', async () => {
		const { result } = setup();
		const res = await result;
		expect(res.exports).toEqual([
			{ name: 'P', fmt: 'png@4.17', ext: 'png', scale: 4.17, outline: false, b64: 'QUJD' },
		]);
	});
});

describe('the code the server assembles', () => {
	it('runs the verbs and returns the build result', async () => {
		const f = fakeFigma();
		const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
		const code = assembleBuild(null, "page('P','v w390',[text('Hi')])", {}, OPTS);
		const res = await new AsyncFunction('figma', code)(f.figma);
		expect(Object.keys(res.ids)).toEqual(['P']);
	});
});

describe('shadow and noise presets', () => {
	const parse = (s: string) => runtime(null, null, {}, OPTS).parseProps(s);
	const pageEffects = async (props: string) => {
		const f = fakeFigma();
		const res = await build(f.figma, null, ({ page }) => {
			page('P', props, []);
		});
		return f.figma.currentPage.children.filter((n: any) => n.id === res.ids.P)[0].effects;
	};

	it('reads sh3', () => {
		expect(parse('sh3').p).toEqual({ sh: 3 });
	});

	it('reads sh3 with a colour', () => {
		expect(parse('sh3:#000').p).toEqual({ sh: 3, shc: '#000' });
	});

	it('reads a bare noise', () => {
		expect(parse('noise').p).toEqual({ noise: 0.1 });
	});

	it('reads a noise opacity', () => {
		expect(parse('noise:0.08').p).toEqual({ noise: 0.08 });
	});

	it('warns sh6 as unknown', () => {
		expect(parse('sh6').warn).toEqual(["props: unknown 'sh6' (nearest 'sh1')"]);
	});

	it('warns a colour that is not hex', () => {
		expect(parse('sh2:red')).toEqual({ p: {}, warn: ["props: 'sh2:red' colour is not hex"] });
	});

	it('warns a noise opacity out of range', () => {
		expect(parse('noise:3')).toEqual({ p: {}, warn: ["props: 'noise:3' opacity is not between 0 and 1"] });
	});

	it('sets six drop shadows for sh3, the blur growing faster than the offset', async () => {
		const fx = await pageEffects('sh3');
		expect(fx.map((e: any) => [e.type, e.offset.y, e.radius])).toEqual([
			['DROP_SHADOW', 0.25, 0.33],
			['DROP_SHADOW', 0.5, 0.83],
			['DROP_SHADOW', 1, 2],
			['DROP_SHADOW', 2, 4.67],
			['DROP_SHADOW', 4, 10.67],
			['DROP_SHADOW', 8, 24],
		]);
	});

	it('makes each sh3 layer fainter than the one before', async () => {
		const fx = await pageEffects('sh3');
		expect(fx.map((e: any) => e.color.a)).toEqual([0.065, 0.059, 0.053, 0.047, 0.041, 0.035]);
	});

	it('sums the alphas of every level to 0.3', async () => {
		const sums = [];
		for (const level of [1, 2, 3, 4, 5]) {
			const fx = await pageEffects('sh' + level);
			sums.push(Math.round(fx.reduce((s: number, e: any) => s + e.color.a, 0) * 1000) / 1000);
		}
		expect(sums).toEqual([0.3, 0.3, 0.3, 0.3, 0.3]);
	});

	it('colours the shadows from the hex', async () => {
		const fx = await pageEffects('sh2:#ff0000');
		expect(fx.map((e: any) => [e.color.r, e.color.g, e.color.b])[0]).toEqual([1, 0, 0]);
	});

	it('puts the noise after the shadows', async () => {
		const fx = await pageEffects('sh1 noise:0.08');
		expect(fx.map((e: any) => [e.type, e.type === 'NOISE' ? [e.noiseType, e.color.a] : null])).toEqual([
			['DROP_SHADOW', null],
			['DROP_SHADOW', null],
			['DROP_SHADOW', null],
			['DROP_SHADOW', null],
			['DROP_SHADOW', null],
			['DROP_SHADOW', null],
			['NOISE', ['MONOTONE', 0.08]],
		]);
	});

	describe('a node that refuses noise', () => {
		const setup = () => {
			const f = fakeFigma();
			let made: any = null;
			f.figma.createFrame.mockImplementation(() => {
				const n = f.node('FRAME');
				let fx: any[] = [];
				Object.defineProperty(n, 'effects', {
					get: () => fx,
					set: (v: any[]) => {
						if (v.some((e) => e.type === 'NOISE')) throw new Error('noise is beta');
						fx = v;
					},
				});
				f.figma.currentPage.appendChild(n);
				made = made || n;
				return n;
			});
			const result = build(f.figma, null, ({ page }) => {
				page('P', 'sh1 noise', []);
			});
			return { made: () => made, result };
		};

		it('keeps the shadows', async () => {
			const { made, result } = setup();
			await result;
			expect(made().effects.map((e: any) => e.type)).toEqual(Array(6).fill('DROP_SHADOW'));
		});

		it('warns the skipped noise', async () => {
			const { result } = setup();
			expect((await result).warn).toEqual(['noise skipped: noise is beta']);
		});
	});

	it('sets six shadows on an existing page through edit', async () => {
		const f = fakeFigma();
		const old = f.node('FRAME', { name: 'P' });
		f.figma.currentPage.appendChild(old);
		await build(f.figma, null, ({ edit }) => {
			edit('P', { '.': 'sh4' });
		});
		expect(old.effects.length).toBe(6);
	});
});

describe('a replace in place', () => {
	it('replaces the first match at its index and removes the duplicate', async () => {
		const f = fakeFigma();
		const old = f.node('FRAME', { name: 'P', x: 500, y: 40 });
		const other = f.node('FRAME', { name: 'A' });
		const dupe = f.node('FRAME', { name: 'P' });
		for (const n of [old, other, dupe]) f.figma.currentPage.appendChild(n);
		const res = await build(f.figma, null, ({ page, frame }) => {
			page('P', 'v', [frame('h')]);
		});
		const kids = f.figma.currentPage.children;
		expect([kids.map((n: any) => n.name), kids[0].id, kids[0].x, kids[0].y]).toEqual([
			['P', 'A'],
			res.ids.P,
			500,
			40,
		]);
	});

	it('warns an old page that stays on the page', async () => {
		const f = fakeFigma();
		const old = f.node('FRAME', { name: 'P' });
		old.remove = () => undefined;
		f.figma.currentPage.appendChild(old);
		const res = await build(f.figma, null, ({ page, frame }) => {
			page('P', 'v', [frame('h')]);
		});
		expect(res.warn).toEqual(["replace 'P': " + old.id + ' still on the page']);
	});
});

describe('add', () => {
	const setup = (slotExtra: any = {}) => {
		const f = fakeFigma();
		const p = f.node('FRAME', { name: 'P' });
		const slot = f.node('FRAME', Object.assign({ name: 'Slot' }, slotExtra));
		const oldKid = f.node('FRAME', { name: 'Old' });
		slot.appendChild(oldKid);
		p.appendChild(slot);
		f.figma.currentPage.appendChild(p);
		return { f, p, slot };
	};

	it('appends the children after the existing ones', async () => {
		const { f, slot } = setup();
		const res = await build(f.figma, null, ({ add, frame, text }) => {
			add('Slot', [frame('#Card w10 h10'), text('Hi', 'Inter 12 Bold')]);
		});
		expect([
			slot.children.slice(0, 2).map((n: any) => n.name),
			slot.children[2].type,
			res.ids.Slot === slot.id,
			res.ids.Card !== undefined,
		]).toEqual([['Old', 'Card'], 'TEXT', true, true]);
	});

	it('loads the font of an added text', async () => {
		const { f } = setup();
		await build(f.figma, null, ({ add, text }) => {
			add('Slot', [text('Hi', 'Inter 12 Bold')]);
		});
		expect(f.figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Inter', style: 'Bold' });
	});

	it('warns a missing target with its nearest and creates nothing', async () => {
		const { f } = setup();
		const res = await build(f.figma, null, ({ add, frame }) => {
			add('Nope', [frame('#Card')]);
		});
		expect([res.warn, f.figma.createFrame.mock.calls.length]).toEqual([["add: no node 'Nope' (nearest 'P')"], 0]);
	});

	it('warns a target that takes no children', async () => {
		const f = fakeFigma();
		f.figma.currentPage.appendChild(f.node('TEXT', { name: 'T' }));
		const res = await build(f.figma, null, ({ add, frame }) => {
			add('T', [frame('#Card')]);
		});
		expect(res.warn).toEqual(["add: 'T' is a TEXT and takes no children"]);
	});

	it('fills a width-less frame added to a vertical target', async () => {
		const { f, slot } = setup({ layoutMode: 'VERTICAL' });
		await build(f.figma, null, ({ add, frame }) => {
			add('Slot', [frame('#Card')]);
		});
		expect(slot.children[1].layoutSizingHorizontal).toBe('FILL');
	});

	describe('a throw while adding', () => {
		const run = () => {
			const s = setup();
			s.f.variant.createInstance.mockImplementation(() => {
				throw new Error('boom');
			});
			const result = build(s.f.figma, KIT, ({ add, frame, inst }) => {
				add('Slot', [frame('#Card'), inst('Chip', {})]);
			});
			return Object.assign(s, { result });
		};

		it('rejects with nothing kept', async () => {
			const { result } = run();
			await expect(result).rejects.toThrow('build failed, nothing kept: boom');
		});

		it('leaves the target children as they were', async () => {
			const { slot, result } = run();
			await result.catch(() => null);
			expect(slot.children.map((n: any) => n.name)).toEqual(['Old']);
		});
	});
});

describe('del', () => {
	const setup = () => {
		const f = fakeFigma();
		const p = f.node('FRAME', { name: 'P' });
		const card = f.node('FRAME', { name: 'Card' });
		p.appendChild(card);
		f.figma.currentPage.appendChild(p);
		return { f, p, card };
	};

	it('removes a top-level node', async () => {
		const { f, p } = setup();
		await build(f.figma, null, ({ del }) => {
			del('P');
		});
		expect([p.removed, f.figma.currentPage.children.length]).toEqual([true, 0]);
	});

	it('removes a nested node and keeps its parent', async () => {
		const { f, p } = setup();
		await build(f.figma, null, ({ del }) => {
			del('Card');
		});
		expect([f.figma.currentPage.children.map((n: any) => n.name), p.children.length]).toEqual([['P'], 0]);
	});

	it('warns a missing name with its nearest', async () => {
		const { f } = setup();
		const res = await build(f.figma, null, ({ del }) => {
			del('Nope');
		});
		expect(res.warn).toEqual(["del: no node 'Nope' (nearest 'P')"]);
	});

	it('adds nothing to the ids', async () => {
		const { f } = setup();
		const res = await build(f.figma, null, ({ del }) => {
			del('Card');
		});
		expect(res.ids).toEqual({});
	});

	it('deletes nothing when the build fails', async () => {
		const { f, card } = setup();
		f.variant.createInstance.mockImplementation(() => {
			throw new Error('boom');
		});
		await build(f.figma, KIT, ({ del, page, inst }) => {
			del('Card');
			page('Q', 'v', [inst('Chip', {})]);
		}).catch(() => null);
		expect(card.removed).toBe(false);
	});

	it('removes the old node and keeps a new one of the same name', async () => {
		const f = fakeFigma();
		const old = f.node('FRAME', { name: 'X' });
		const slot = f.node('FRAME', { name: 'Slot' });
		f.figma.currentPage.appendChild(old);
		f.figma.currentPage.appendChild(slot);
		const res = await build(f.figma, null, ({ del, add, frame }) => {
			del('X');
			add('Slot', [frame('#X')]);
		});
		expect([old.removed, slot.children.map((n: any) => n.id)]).toEqual([true, [res.ids.X]]);
	});
});

describe('gradient fills', () => {
	const paint = async (props: string, field = 'fills') => {
		const f = fakeFigma();
		const res = await build(f.figma, null, ({ page }) => {
			page('P', props, []);
		});
		const node = f.figma.currentPage.children.filter((n: any) => n.id === res.ids.P)[0];
		return { paints: node[field], warn: res.warn };
	};
	const BLACK = { r: 0, g: 0, b: 0, a: 1 };
	const WHITE = { r: 1, g: 1, b: 1, a: 1 };

	it('sets a linear paint from top to bottom for 180', async () => {
		const { paints } = await paint('bg:lin(180,#000,#fff)');
		expect(paints).toEqual([
			{
				type: 'GRADIENT_LINEAR',
				gradientTransform: [
					[0, 1, 0],
					[-1, 0, 1],
				],
				gradientStops: [
					{ position: 0, color: BLACK },
					{ position: 1, color: WHITE },
				],
			},
		]);
	});

	it.each([
		['0', [[0, -1, 1], [1, 0, 0]]],
		['90', [[1, 0, 0], [0, 1, 0]]],
		['45', [[0.5, -0.5, 0.5], [0.707107, 0.707107, -0.207107]]],
		['270deg', [[-1, 0, 1], [0, -1, 1]]],
	])('turns angle %s into its transform', async (angle, t) => {
		const { paints } = await paint('bg:lin(' + angle + ',#000,#fff)');
		expect(paints[0].gradientTransform).toEqual(t);
	});

	it('spreads stops without a position evenly', async () => {
		const { paints } = await paint('bg:lin(90,#000,#fff,#000)');
		expect(paints[0].gradientStops.map((s: any) => s.position)).toEqual([0, 0.5, 1]);
	});

	it('reads an alpha and a position as a fraction or a percent', async () => {
		const { paints } = await paint('bg:lin(90,#ffffff@0.5:0.2,#000000@50:80)');
		expect(paints[0].gradientStops).toEqual([
			{ position: 0.2, color: { r: 1, g: 1, b: 1, a: 0.5 } },
			{ position: 0.8, color: { r: 0, g: 0, b: 0, a: 0.5 } },
		]);
	});

	it('multiplies the alpha of an eight-digit hex', async () => {
		const { paints } = await paint('bg:lin(90,#00000080@0.5,#000)');
		expect(paints[0].gradientStops[0].color.a).toBeCloseTo((128 / 255) * 0.5, 6);
	});

	it('sets a radial paint centred on the box', async () => {
		const { paints } = await paint('bg:rad(#ff0000,#ff000000)');
		expect(paints).toEqual([
			{
				type: 'GRADIENT_RADIAL',
				gradientTransform: [
					[1, 0, 0],
					[0, 1, 0],
				],
				gradientStops: [
					{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
					{ position: 1, color: { r: 1, g: 0, b: 0, a: 0 } },
				],
			},
		]);
	});

	it('sets a gradient stroke', async () => {
		const { paints } = await paint('stroke:lin(90,#000,#fff)', 'strokes');
		expect(paints.map((p: any) => p.type)).toEqual(['GRADIENT_LINEAR']);
	});

	it.each([
		['lin(90,red,#fff)', "color: 'lin(90,red,#fff)' stop 'red' is not #hex[@alpha][:pos]"],
		['lin(90,#fff@200,#000)', "color: 'lin(90,#fff@200,#000)' stop '#fff@200' is not #hex[@alpha][:pos]"],
		['rad(#fff)', "color: 'rad(#fff)' needs two stops or more"],
		['lin(#fff,#000)', "color: 'lin(#fff,#000)' needs an angle first"],
	])('warns %s and sets no paint', async (token, message) => {
		const { paints, warn } = await paint('bg:' + token);
		expect([warn, paints]).toEqual([[message], []]);
	});
});
