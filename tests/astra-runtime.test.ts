import { ASTRA_RUNTIME, KIT_SYNC_CODE } from '../src/astra-runtime';

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
