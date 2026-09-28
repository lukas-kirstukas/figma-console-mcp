// Both strings are inserted into a template literal and evaluated in the Figma plugin sandbox:
// no backtick, no dollar-brace, no optional chaining, no nullish coalescing, no object spread.
export const ASTRA_RUNTIME = String.raw`function (figma, DS, ASSETS, OPTS) {
    const t0 = Date.now();
    const O = OPTS || {};
    const resolveMs = O.resolveMs || 20000;
    const totalMs = O.totalMs || 27000;
    const A = ASSETS || {};
    const warns = [];
    const warn = function (m) { warns.push(m); };
    const jobs = [];
    const exps = [];
    const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    const msgOf = function (e) { return e && e.message ? e.message : String(e); };

    const lev = function (a, b) {
        let prev = [];
        for (let j = 0; j <= b.length; j++) prev.push(j);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            for (let j = 1; j <= b.length; j++) {
                cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
            }
            prev = cur;
        }
        return prev[b.length];
    };
    const nearest = function (name, candidates) {
        let best = null;
        let bestD = Infinity;
        const s = String(name).toLowerCase();
        (candidates || []).forEach(function (c) {
            const d = lev(s, String(c).toLowerCase());
            if (d < bestD) { bestD = d; best = c; }
        });
        return best;
    };
    const nearTxt = function (n) { return n === null || n === undefined ? '' : " (nearest '" + n + "')"; };
    const near = function (name, candidates) { return nearTxt(nearest(name, candidates)); };

    const matchName = function (name, names) {
        const all = names || [];
        const s = String(name);
        if (all.indexOf(s) >= 0) return { hit: s };
        const lo = s.toLowerCase();
        const ci = all.filter(function (n) { return n.toLowerCase() === lo; });
        if (ci.length) return { hit: ci[0] };
        const seg = all.filter(function (n) {
            const parts = n.split('/');
            return parts[parts.length - 1].trim().toLowerCase() === lo;
        });
        if (seg.length === 1) return { hit: seg[0] };
        return { nearest: nearest(s, all) };
    };
    const base = function (k) { return k.split('#')[0]; };
    const matchProp = function (name, keys) {
        const all = keys || [];
        const s = String(name);
        if (all.indexOf(s) >= 0) return { hit: s };
        let f = all.filter(function (k) { return base(k) === s; });
        if (f.length) return { hit: f[0] };
        const lo = s.toLowerCase();
        f = all.filter(function (k) { return base(k).toLowerCase() === lo; });
        if (f.length) return { hit: f[0] };
        return { nearest: nearest(s, all.map(base)) };
    };

    const KW = {
        h: ['layout', 'HORIZONTAL'], v: ['layout', 'VERTICAL'],
        wrap: ['wrap', true], fill: ['fillW', true], fillv: ['fillH', true],
        hug: ['hug', true], abs: ['abs', true], clip: ['clip', true],
        start: ['main', 'MIN'], center: ['main', 'CENTER'], end: ['main', 'MAX'], between: ['main', 'SPACE_BETWEEN'],
        mid: ['cross', 'CENTER'], cend: ['cross', 'MAX'], base: ['cross', 'BASELINE']
    };
    const PREFIXES = ['dpi', 'sw', 'lh', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'w', 'h', 'x', 'y', 'g', 'r', 'o', 'p', 'm'];
    const FIELD = { w: 'w', h: 'h', x: 'x', y: 'y', g: 'gap', r: 'r', sw: 'sw', lh: 'lh', dpi: 'dpi', o: 'o' };
    const SIDES = { '': [0, 1, 2, 3], x: [1, 3], y: [0, 2], t: [0], r: [1], b: [2], l: [3] };
    const COLS = ['bg', 'c', 'stroke', 'fx'];
    const VOCAB = Object.keys(KW).concat(PREFIXES, COLS.map(function (c) { return c + ':'; }));
    const NUM = /^(-?\d+(?:\.\d+)?)(mm|pt|in|px)?$/;

    const parseProps = function (str) {
        const p = {};
        const w = [];
        const toks = String(str === undefined || str === null ? '' : str).split(/\s+/).filter(Boolean);
        toks.forEach(function (t) {
            if (has(KW, t)) { p[KW[t][0]] = KW[t][1]; return; }
            const ci = t.indexOf(':');
            if (ci > 0 && COLS.indexOf(t.slice(0, ci)) >= 0) { p[t.slice(0, ci)] = t.slice(ci + 1); return; }
            if (t.charAt(0) === '#' && t.length > 1) { p.name = t.slice(1); return; }
            for (let i = 0; i < PREFIXES.length; i++) {
                const k = PREFIXES[i];
                if (t.indexOf(k) !== 0) continue;
                const m = NUM.exec(t.slice(k.length));
                if (!m) continue;
                let n = parseFloat(m[1]);
                if (m[2] === 'mm') n = n * 72 / 25.4;
                else if (m[2] === 'in') n = n * 72;
                n = Math.round(n * 100) / 100;
                if (has(FIELD, k)) {
                    p[FIELD[k]] = k === 'o' ? n / 100 : n;
                } else {
                    const f = k.charAt(0) === 'p' ? 'pad' : 'margin';
                    if (!p[f]) p[f] = [0, 0, 0, 0];
                    SIDES[k.slice(1)].forEach(function (s) { p[f][s] = n; });
                }
                return;
            }
            w.push("props: unknown '" + t + "'" + near(t, VOCAB));
        });
        return { p: p, warn: w };
    };

    const vnode = function (kind, props) {
        const r = parseProps(props);
        r.warn.forEach(warn);
        return { kind: kind, p: r.p, kids: [] };
    };
    const kidsOf = function (k) {
        const out = [];
        const walk = function (x) {
            if (Array.isArray(x)) x.forEach(walk);
            else if (x !== null && x !== undefined && x !== false) out.push(x);
        };
        walk(k);
        return out;
    };
    const page = function (name, props, kids) {
        if (Array.isArray(props)) return page(name, '', props);
        const v = vnode('page', props);
        v.kids = kidsOf(kids);
        jobs.push({ kind: 'page', name: name, v: v });
        return v;
    };
    const frame = function (props, kids) {
        if (Array.isArray(props)) return frame('', props);
        const v = vnode('frame', props);
        v.kids = kidsOf(kids);
        return v;
    };
    const inst = function (name, overrides, props) {
        if (typeof overrides === 'string' && props === undefined) return inst(name, {}, overrides);
        const v = vnode('inst', props);
        v.label = name;
        v.ov = overrides || {};
        return v;
    };
    const text = function (str, style, props) {
        const v = vnode('text', props);
        v.str = String(str);
        v.style = style;
        return v;
    };
    const img = function (asset, props) {
        const v = vnode('img', props);
        v.asset = asset;
        return v;
    };
    const svg = function (asset, props) {
        const v = vnode('svg', props);
        v.asset = asset;
        return v;
    };
    const clone = function (src, name, swaps) { jobs.push({ kind: 'clone', src: src, name: name, swaps: swaps || {} }); };
    const edit = function (name, swaps) { jobs.push({ kind: 'edit', src: name, name: name, swaps: swaps || {} }); };
    const exp = function (name, fmt) { exps.push({ name: name, fmt: fmt || 'png' }); };

    const D = {};
    const ok = function (l) { return !!D[l] && D[l].state === 'ok'; };
    const need = function (label, fn, user) {
        if (!D[label]) D[label] = { label: label, fn: fn, state: 'pending', users: [] };
        if (user) {
            if (D[label].users.indexOf(user) < 0) D[label].users.push(user);
            if (user.needs.indexOf(label) < 0) user.needs.push(label);
        }
        return label;
    };
    const kitNames = function (bag, type) {
        if (!DS || !DS[bag]) return [];
        return Object.keys(DS[bag]).filter(function (k) { return !type || DS[bag][k].type === type; });
    };
    const fontDep = function (family, style, user) {
        return need("font '" + family + ' ' + style + "'", function () {
            return figma.loadFontAsync({ family: family, style: style });
        }, user);
    };
    const byId = function (get, id) {
        return Promise.resolve().then(function () { return get(id); }).then(null, function () { return null; });
    };
    const compDep = function (name, user) {
        const c = DS.components[name];
        const label = need("comp '" + name + "'", function () {
            return byId(figma.getNodeByIdAsync, c.id).then(function (n) {
                if (n && n.type === (c.set ? 'COMPONENT_SET' : 'COMPONENT') && n.key === c.key) return n;
                return c.set ? figma.importComponentSetByKeyAsync(c.key) : figma.importComponentByKeyAsync(c.key);
            });
        }, user);
        (c.fonts || []).forEach(function (f) { fontDep(f[0], f[1], user); });
        return label;
    };
    const styleDep = function (name, user) {
        const s = DS.styles[name];
        return need("style '" + name + "'", function () {
            return byId(figma.getStyleByIdAsync, s.id).then(function (n) {
                return n && n.key === s.key ? n : figma.importStyleByKeyAsync(s.key);
            });
        }, user);
    };
    const varDep = function (name) {
        const s = DS.variables[name];
        return need("var '" + name + "'", function () {
            return byId(figma.variables.getVariableByIdAsync, s.id).then(function (n) {
                return n && n.key === s.key ? n : figma.variables.importVariableByKeyAsync(s.key);
            });
        }, null);
    };
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    const color = function (str) {
        const s = String(str);
        if (s === 'none') return { none: true };
        const hx = HEX.exec(s);
        if (hx) {
            let h = hx[1];
            if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
            const ch = function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; };
            return { hex: { r: ch(0), g: ch(2), b: ch(4), a: h.length === 8 ? ch(6) : 1 } };
        }
        const vars = kitNames('variables', 'COLOR');
        const vm = matchName(s, vars);
        if (vm.hit) return { v: varDep(vm.hit) };
        const paints = kitNames('styles', 'PAINT');
        const pm = matchName(s, paints);
        if (pm.hit) return { s: styleDep(pm.hit, null) };
        warn("color: unknown '" + s + "'" + near(s, vars.concat(paints)));
        return null;
    };

    const mapProp = function (who, k, val, keys, typeOf, user) {
        const pm = matchProp(k, keys);
        if (!pm.hit) { warn(who + ": unknown prop '" + k + "'" + nearTxt(pm.nearest)); return null; }
        const t = typeOf(pm.hit);
        if (Array.isArray(t)) {
            if (t.indexOf(String(val)) < 0) {
                warn(who + ": '" + base(pm.hit) + "' has no option '" + val + "'" + near(val, t));
                return null;
            }
            return { key: pm.hit, value: String(val) };
        }
        if (t === 'B' || t === 'BOOLEAN') return { key: pm.hit, value: val === 'false' ? false : !!val };
        if (t === 'S' || t === 'INSTANCE_SWAP') {
            if (!DS) { warn(who + ": '" + base(pm.hit) + "': no kit"); return null; }
            const cm = matchName(String(val), kitNames('components'));
            if (!cm.hit) { warn(who + ": unknown '" + val + "'" + nearTxt(cm.nearest)); return null; }
            return { key: pm.hit, comp: compDep(cm.hit, user) };
        }
        return { key: pm.hit, value: String(val) };
    };

    const collect = function (v) {
        if (!v || !v.kind) return;
        const p = v.p;
        v.needs = [];
        v.col = {};
        ['bg', 'c', 'stroke'].forEach(function (k) { if (p[k] !== undefined) v.col[k] = color(p[k]); });
        if (p.fx !== undefined) {
            const effects = kitNames('styles', 'EFFECT');
            const fm = matchName(p.fx, effects);
            if (fm.hit) v.fx = styleDep(fm.hit, null);
            else warn("fx: unknown '" + p.fx + "'" + nearTxt(fm.nearest));
        }
        if (v.kind === 'inst') {
            if (!DS) { warn("inst '" + v.label + "': no kit"); v.skip = true; return; }
            const m = matchName(v.label, kitNames('components'));
            if (!m.hit) { warn("inst: unknown '" + v.label + "'" + nearTxt(m.nearest)); v.skip = true; return; }
            v.comp = compDep(m.hit, v);
            const defs = DS.components[m.hit].props || {};
            v.map = [];
            Object.keys(v.ov).forEach(function (k) {
                const r = mapProp("inst '" + v.label + "'", k, v.ov[k], Object.keys(defs), function (key) { return defs[key]; }, null);
                if (r) v.map.push(r);
            });
        } else if (v.kind === 'text') {
            const tstyles = kitNames('styles', 'TEXT');
            if (v.style === undefined || v.style === null || v.style === '') {
                v.font = ['Inter', 'Regular'];
            } else {
                const m = matchName(v.style, tstyles);
                if (m.hit) {
                    v.kstyle = styleDep(m.hit, v);
                    v.font = DS.styles[m.hit].font || ['Inter', 'Regular'];
                } else {
                    const words = String(v.style).split(/\s+/).filter(Boolean);
                    const i = words.findIndex(function (x) { return /^\d+(\.\d+)?$/.test(x); });
                    if (i < 0) { warn("text: unknown style '" + v.style + "'" + nearTxt(m.nearest)); v.skip = true; return; }
                    v.font = [words.slice(0, i).join(' ') || 'Inter', words.slice(i + 1).join(' ') || 'Regular'];
                    v.size = parseFloat(words[i]);
                }
            }
            fontDep(v.font[0], v.font[1], v);
        } else if (v.kind === 'img') {
            const a = A[v.asset];
            if (!a || !a.b64) { warn("img: asset '" + v.asset + "' not passed in assets"); v.skip = true; return; }
            v.imgDep = need("img '" + v.asset + "'", function () {
                const image = figma.createImage(figma.base64Decode(a.b64));
                return image.getSizeAsync().then(function (s) { return { image: image, width: s.width, height: s.height }; });
            }, v);
        } else if (v.kind === 'svg') {
            const a = A[v.asset];
            if (!a || !a.svg) { warn("svg: asset '" + v.asset + "' not passed in assets"); v.skip = true; return; }
        }
        v.kids.forEach(collect);
    };

    const topNames = function () { return figma.currentPage.children.map(function (n) { return n.name; }); };
    const findNode = function (name) {
        const top = figma.currentPage.children.filter(function (n) { return n.name === name; });
        if (top.length) return top[0];
        return figma.currentPage.findOne(function (n) { return n.name === name; });
    };
    const fontsOf = function (t) {
        return t.fontName === figma.mixed ? t.getRangeAllFontNames(0, t.characters.length) : [t.fontName];
    };
    const collectSwap = function (j, k, val) {
        const s = { key: k, val: val, needs: [] };
        const root = j.node;
        const t = k === '.' ? root : (typeof root.findOne === 'function' ? root.findOne(function (n) { return n.name === k; }) : null);
        if (!t) {
            const names = typeof root.findAll === 'function' ? root.findAll(function () { return true; }).map(function (n) { return n.name; }) : [];
            warn("swap '" + k + "': no node" + near(k, names));
            s.skip = true;
            return s;
        }
        if (val && val.kind === 'img') {
            s.kind = 'img';
            collect(val);
        } else if (typeof val === 'string' && t.type === 'TEXT') {
            s.kind = 'text';
            fontsOf(t).forEach(function (f) { fontDep(f.family, f.style, s); });
        } else if (val && typeof val === 'object' && !Array.isArray(val) && !val.kind && t.type === 'INSTANCE') {
            s.kind = 'props';
            const cp = t.componentProperties || {};
            t.findAll(function (n) { return n.type === 'TEXT'; }).forEach(function (n) {
                fontsOf(n).forEach(function (f) { fontDep(f.family, f.style, s); });
            });
            s.map = Object.keys(val).map(function (pk) {
                return mapProp("swap '" + k + "'", pk, val[pk], Object.keys(cp), function (key) { return cp[key].type; }, null);
            }).filter(Boolean);
        } else if (typeof val === 'string') {
            s.kind = 'str';
            s.v = vnode('swap', val);
            collect(s.v);
        } else {
            s.kind = 'bad';
            s.what = val && val.kind ? val.kind : Array.isArray(val) ? 'array' : typeof val;
        }
        return s;
    };

    const run = async function () {
        jobs.forEach(function (j) {
            if (j.kind === 'page') { collect(j.v); return; }
            j.node = findNode(j.src);
            if (!j.node) { warn(j.kind + ": no node '" + j.src + "'" + near(j.src, topNames())); j.skip = true; return; }
            j.sw = Object.keys(j.swaps).map(function (k) { return collectSwap(j, k, j.swaps[k]); });
        });

        const labels = Object.keys(D);
        const timeoutError = function () {
            const pending = labels.filter(function (l) { return D[l].state === 'pending'; }).slice(0, 5);
            return new Error('timeout after ' + resolveMs + ' ms resolving' + (pending.length ? ': ' + pending.join(', ') : ''));
        };
        let timer = null;
        const all = Promise.all(labels.map(function (l) {
            const d = D[l];
            return Promise.resolve().then(d.fn).then(function (val) { d.state = 'ok'; d.value = val; }, function (e) { d.state = 'fail'; d.err = msgOf(e); });
        }));
        const timedOut = await Promise.race([
            all.then(function () { return false; }),
            new Promise(function (res) { timer = setTimeout(function () { res(true); }, Math.max(0, resolveMs - (Date.now() - t0))); })
        ]);
        clearTimeout(timer);
        if (timedOut) throw timeoutError();
        labels.forEach(function (l) {
            if (D[l].state === 'fail') warn(l + ' failed: ' + D[l].err + ' (skipped ' + D[l].users.length + ')');
        });
        if (Date.now() - t0 > resolveMs) throw timeoutError();

        const created = [];
        const queue = [];
        const reps = [];
        const ids = {};
        const imgs = [];
        let last = null;
        const pre = figma.currentPage.children.slice();
        const blocked = function (v) { return !!v.skip || v.needs.some(function (l) { return !ok(l); }); };
        const isAuto = function (n) { return !!n && !!n.layoutMode && n.layoutMode !== 'NONE'; };
        const imagePaint = function (im) { return { type: 'IMAGE', imageHash: im.image.hash, scaleMode: 'FILL' }; };

        const setPaint = function (node, field, d) {
            if (!d) return;
            if (d.none) node[field] = [];
            else if (d.hex) node[field] = [{ type: 'SOLID', color: { r: d.hex.r, g: d.hex.g, b: d.hex.b }, opacity: d.hex.a }];
            else if (d.v && ok(d.v)) node[field] = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', D[d.v].value)];
            else if (d.s && ok(d.s)) {
                const id = D[d.s].value.id;
                queue.push(field === 'fills' ? function () { return node.setFillStyleIdAsync(id); } : function () { return node.setStrokeStyleIdAsync(id); });
            }
        };
        const propsOf = function (map) {
            const o = {};
            let any = false;
            map.forEach(function (r) {
                if (r.comp) {
                    if (!ok(r.comp)) return;
                    const c = D[r.comp].value;
                    o[r.key] = c.type === 'COMPONENT_SET' ? c.defaultVariant.id : c.id;
                } else {
                    o[r.key] = r.value;
                }
                any = true;
            });
            return any ? o : null;
        };
        const apply = function (node, v) {
            const p = v.p;
            if (p.name) { node.name = p.name; ids[p.name] = node.id; }
            if (node.type === 'TEXT') {
                if (p.main === 'CENTER' || p.main === 'MAX') node.textAlignHorizontal = p.main === 'CENTER' ? 'CENTER' : 'RIGHT';
                if (p.lh !== undefined) node.lineHeight = { value: p.lh, unit: 'PIXELS' };
                setPaint(node, 'fills', v.col.c);
            } else {
                if (p.layout) node.layoutMode = p.layout;
                if (p.wrap) node.layoutWrap = 'WRAP';
                if (p.gap !== undefined) node.itemSpacing = p.gap;
                if (p.pad) {
                    node.paddingTop = p.pad[0];
                    node.paddingRight = p.pad[1];
                    node.paddingBottom = p.pad[2];
                    node.paddingLeft = p.pad[3];
                }
                if (p.main) node.primaryAxisAlignItems = p.main;
                if (p.cross) node.counterAxisAlignItems = p.cross;
                setPaint(node, 'fills', v.col.bg);
            }
            if (p.r !== undefined) node.cornerRadius = p.r;
            if (p.o !== undefined) node.opacity = p.o;
            if (p.clip) node.clipsContent = true;
            if (v.col.stroke) {
                setPaint(node, 'strokes', v.col.stroke);
                node.strokeWeight = p.sw !== undefined ? p.sw : 1;
                node.strokeAlign = 'INSIDE';
            }
            if (v.fx && ok(v.fx)) {
                const fxId = D[v.fx].value.id;
                queue.push(function () { return node.setEffectStyleIdAsync(fxId); });
            }
        };
        const size = function (v, n, outer, parent) {
            const p = v.p;
            const pAuto = isAuto(parent);
            const self = isAuto(n);
            const defaults = v.kind !== 'swap';
            let w = p.w;
            let h = p.h;
            if (v.kind === 'img') {
                const im = D[v.imgDep].value;
                if (w === undefined && h === undefined) { w = im.width; h = im.height; }
                else if (w === undefined) w = Math.round(h * im.width / im.height * 100) / 100;
                else if (h === undefined) h = Math.round(w * im.height / im.width * 100) / 100;
            }
            if (v.kind === 'svg') {
                if (w !== undefined) n.rescale(w / n.width);
                else if (h !== undefined) n.rescale(h / n.height);
            } else if (w !== undefined || h !== undefined) {
                n.resize(w !== undefined ? w : n.width, h !== undefined ? h : n.height);
                if (self || outer !== n || pAuto) {
                    if (w !== undefined) n.layoutSizingHorizontal = 'FIXED';
                    if (h !== undefined) n.layoutSizingVertical = 'FIXED';
                }
            }
            if (self && (v.kind === 'frame' || v.kind === 'page')) {
                if (w === undefined && !p.fillW) n.layoutSizingHorizontal = 'HUG';
                if (h === undefined && !p.fillH) n.layoutSizingVertical = 'HUG';
            }
            if (p.hug && (self || n.type === 'TEXT')) {
                n.layoutSizingHorizontal = 'HUG';
                n.layoutSizingVertical = 'HUG';
            }
            if (outer !== n) {
                outer.layoutSizingHorizontal = 'HUG';
                outer.layoutSizingVertical = 'HUG';
            }
            const block = defaults && v.kind === 'frame' && w === undefined && !p.hug && !p.fillW && !!parent && parent.layoutMode === 'VERTICAL';
            if (p.fillW || block) {
                if (pAuto) {
                    outer.layoutSizingHorizontal = 'FILL';
                    if (outer !== n) n.layoutSizingHorizontal = 'FILL';
                } else if (p.fillW) warn('fill ignored: parent has no auto layout');
            }
            if (p.fillH) {
                if (pAuto) outer.layoutSizingVertical = 'FILL';
                else warn('fill ignored: parent has no auto layout');
            }
            if (p.abs && pAuto) outer.layoutPositioning = 'ABSOLUTE';
            if (p.x !== undefined) outer.x = p.x;
            if (p.y !== undefined) outer.y = p.y;
            if (n.type === 'TEXT' && (w !== undefined || p.fillW)) n.textAutoResize = 'HEIGHT';
        };
        const create = function (v) {
            let n = null;
            if (v.kind === 'frame') {
                n = figma.createFrame();
                created.push(n);
                n.fills = [];
                n.clipsContent = false;
            } else if (v.kind === 'inst') {
                const comp = D[v.comp].value;
                n = (comp.type === 'COMPONENT_SET' ? comp.defaultVariant : comp).createInstance();
                created.push(n);
                const o = propsOf(v.map);
                if (o) n.setProperties(o);
            } else if (v.kind === 'text') {
                n = figma.createText();
                created.push(n);
                n.fontName = { family: v.font[0], style: v.font[1] };
                n.characters = v.str;
                if (v.size !== undefined) n.fontSize = v.size;
                if (v.kstyle) {
                    const sid = D[v.kstyle].value.id;
                    const tn = n;
                    queue.push(function () { return tn.setTextStyleIdAsync(sid); });
                }
            } else if (v.kind === 'img') {
                n = figma.createRectangle();
                created.push(n);
                const im = D[v.imgDep].value;
                n.fills = [imagePaint(im)];
                imgs.push({ v: v, n: n, im: im });
            } else if (v.kind === 'svg') {
                n = figma.createNodeFromSvg(A[v.asset].svg);
                created.push(n);
            }
            return n;
        };
        const draw = function (v, parent) {
            if (!v || !v.kind || !v.needs || blocked(v)) return null;
            const n = create(v);
            if (!n) return null;
            apply(n, v);
            let outer = n;
            if (v.p.margin) {
                outer = figma.createFrame();
                created.push(outer);
                outer.fills = [];
                outer.clipsContent = false;
                outer.layoutMode = 'VERTICAL';
                outer.paddingTop = v.p.margin[0];
                outer.paddingRight = v.p.margin[1];
                outer.paddingBottom = v.p.margin[2];
                outer.paddingLeft = v.p.margin[3];
            }
            parent.appendChild(outer);
            if (outer !== n) outer.appendChild(n);
            size(v, n, outer, parent);
            v.kids.forEach(function (k) { draw(k, n); });
            return n;
        };
        const place = function (n, name) {
            const old = pre.filter(function (o) { return o.name === name && !o.removed; })[0];
            if (old) {
                reps.push([n, old]);
                n.x = old.x;
                n.y = old.y;
                return;
            }
            let right = null;
            figma.currentPage.children.forEach(function (c) {
                if (c === n) return;
                const edge = c.x + c.width;
                if (right === null || edge > right) right = edge;
            });
            n.x = right === null ? 0 : right + 100;
            n.y = 0;
        };
        const applySwaps = function (j, root) {
            j.sw.forEach(function (s) {
                if (s.skip || s.needs.some(function (l) { return !ok(l); })) return;
                const t = s.key === '.' ? root : root.findOne(function (n) { return n.name === s.key; });
                if (!t) { warn("swap '" + s.key + "': no node"); return; }
                if (s.kind === 'img') {
                    if (blocked(s.val)) return;
                    if (!('fills' in t)) { warn("swap '" + s.key + "': cannot apply img to " + t.type); return; }
                    t.fills = [imagePaint(D[s.val.imgDep].value)];
                } else if (s.kind === 'text') {
                    t.characters = s.val;
                } else if (s.kind === 'props') {
                    const o = propsOf(s.map);
                    if (o) t.setProperties(o);
                } else if (s.kind === 'str') {
                    apply(t, s.v);
                    size(s.v, t, t, t.parent);
                } else {
                    warn("swap '" + s.key + "': cannot apply " + s.what + ' to ' + t.type);
                }
            });
        };

        try {
            jobs.forEach(function (j) {
                if (j.skip) return;
                if (j.kind === 'page') {
                    const n = figma.createFrame();
                    created.push(n);
                    n.fills = [];
                    n.clipsContent = true;
                    apply(n, j.v);
                    n.name = j.name;
                    figma.currentPage.appendChild(n);
                    place(n, j.name);
                    size(j.v, n, n, null);
                    j.v.kids.forEach(function (k) { draw(k, n); });
                    ids[j.name] = n.id;
                    last = n;
                } else if (j.kind === 'clone') {
                    const c = j.node.clone();
                    created.push(c);
                    c.name = j.name;
                    figma.currentPage.appendChild(c);
                    place(c, j.name);
                    applySwaps(j, c);
                    ids[j.name] = c.id;
                    last = c;
                } else {
                    applySwaps(j, j.node);
                    ids[j.name] = j.node.id;
                    last = j.node;
                }
            });
            await Promise.all(queue.map(function (f) { return f(); }));
        } catch (e) {
            created.forEach(function (n) {
                if (!n.removed) { try { n.remove(); } catch (x) { warn('remove: ' + msgOf(x)); } }
            });
            const ws = warns.filter(function (m, i) { return warns.indexOf(m) === i; });
            throw new Error('build failed, nothing kept: ' + msgOf(e) + (ws.length ? '; warn: ' + ws.join('; ') : ''));
        }

        imgs.forEach(function (r) {
            const dpi = r.v.p.dpi || 72;
            const per = r.v.p.dpi ? r.v.p.dpi / 72 : 1;
            if (r.im.width < r.n.width * per || r.im.height < r.n.height * per) {
                warn("img '" + r.v.asset + "': " + r.im.width + 'x' + r.im.height + ' px is under ' + dpi + ' dpi at ' + Math.round(r.n.width) + 'x' + Math.round(r.n.height));
            }
        });

        reps.forEach(function (r) {
            const nw = r[0];
            const old = r[1];
            const par = old.parent;
            par.insertChild(par.children.indexOf(old), nw);
            nw.x = old.x;
            nw.y = old.y;
            old.remove();
        });

        const within = function (pr) {
            let tm = null;
            return Promise.race([
                pr,
                new Promise(function (res, rej) {
                    tm = setTimeout(function () { rej(new Error('timeout after ' + totalMs + ' ms')); }, Math.max(0, totalMs - (Date.now() - t0)));
                })
            ]).then(function (v) { clearTimeout(tm); return v; }, function (e) { clearTimeout(tm); throw e; });
        };
        const exportOne = async function (node, ext, scale, outline) {
            if (ext === 'png' || ext === 'jpg') return node.exportAsync({ format: ext === 'png' ? 'PNG' : 'JPG', constraint: { type: 'SCALE', value: scale } });
            if (ext === 'pdf') return node.exportAsync({ format: 'PDF' });
            if (!outline) return node.exportAsync({ format: 'SVG', svgOutlineText: true });
            const temps = [];
            try {
                const c = node.clone();
                temps.push(c);
                const flat = figma.flatten([c]);
                temps.push(flat);
                let target = flat;
                if (flat.strokes && flat.strokes.length) {
                    const o = flat.outlineStroke();
                    if (o) {
                        temps.push(o);
                        target = figma.union([flat, o], flat.parent);
                        temps.push(target);
                    }
                }
                return await target.exportAsync({ format: 'SVG', svgOutlineText: true });
            } finally {
                temps.forEach(function (t) { if (!t.removed) t.remove(); });
            }
        };
        const FMT = /^(png|jpg|pdf|svg)(?:@(\d+(?:\.\d+)?))?(?: (outline))?$/;
        const out = [];
        for (const e of exps) {
            const node = findNode(e.name);
            if (!node) { warn("exp: no node '" + e.name + "'" + near(e.name, topNames())); continue; }
            const m = FMT.exec(String(e.fmt));
            if (!m) { warn("exp '" + e.name + "': unknown format '" + e.fmt + "'"); continue; }
            const scale = m[2] ? parseFloat(m[2]) || 1 : 1;
            try {
                const bytes = await within(exportOne(node, m[1], scale, !!m[3]));
                out.push({ name: e.name, fmt: e.fmt, ext: m[1], scale: scale, outline: !!m[3], b64: figma.base64Encode(bytes) });
            } catch (x) {
                warn("exp '" + e.name + "': " + msgOf(x));
            }
        }

        let look = null;
        if (O.look) {
            const node = O.look === true ? last : findNode(O.look);
            if (!node) warn("look: no node '" + (O.look === true ? 'last job' : O.look) + "'");
            else {
                try {
                    look = figma.base64Encode(await within(node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } })));
                } catch (x) {
                    warn('look: ' + msgOf(x));
                }
            }
        }

        const res = { ids: ids, warn: warns.filter(function (m, i) { return warns.indexOf(m) === i; }), exports: out };
        if (look !== null) res.look = look;
        return res;
    };

    return {
        verbs: { page: page, frame: frame, inst: inst, text: text, img: img, svg: svg, clone: clone, edit: edit, exp: exp },
        run: run,
        parseProps: parseProps,
        matchName: matchName,
        matchProp: matchProp,
        nearest: nearest
    };
}`;

export const KIT_SYNC_CODE = String.raw`await figma.loadAllPagesAsync();
const kit = { file: figma.root.name, synced: new Date().toISOString(), components: {}, styles: {}, variables: {}, dupes: [] };
const put = function (bag, name, entry) {
    if (Object.prototype.hasOwnProperty.call(bag, name)) {
        if (kit.dupes.indexOf(name) < 0) kit.dupes.push(name);
        return;
    }
    bag[name] = entry;
};
const nodes = figma.root.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] });
for (const n of nodes) {
    try {
        if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
        const fonts = [];
        const seen = {};
        for (const t of n.findAllWithCriteria({ types: ['TEXT'] })) {
            const names = t.fontName === figma.mixed ? t.getRangeAllFontNames(0, t.characters.length) : [t.fontName];
            for (const f of names) {
                const k = f.family + '|' + f.style;
                if (seen[k]) continue;
                seen[k] = true;
                fonts.push([f.family, f.style]);
            }
        }
        const props = {};
        const defs = n.componentPropertyDefinitions;
        for (const k of Object.keys(defs)) {
            const d = defs[k];
            props[k] = d.type === 'TEXT' ? 'T' : d.type === 'BOOLEAN' ? 'B' : d.type === 'INSTANCE_SWAP' ? 'S' : (d.variantOptions || []);
        }
        put(kit.components, n.name, { key: n.key, id: n.id, set: n.type === 'COMPONENT_SET', fonts: fonts, props: props });
    } catch (e) {
        continue;
    }
}
for (const s of await figma.getLocalPaintStylesAsync()) put(kit.styles, s.name, { key: s.key, id: s.id, type: 'PAINT' });
for (const s of await figma.getLocalTextStylesAsync()) put(kit.styles, s.name, { key: s.key, id: s.id, type: 'TEXT', font: [s.fontName.family, s.fontName.style] });
for (const s of await figma.getLocalEffectStylesAsync()) put(kit.styles, s.name, { key: s.key, id: s.id, type: 'EFFECT' });
for (const v of await figma.variables.getLocalVariablesAsync()) put(kit.variables, v.name, { key: v.key, id: v.id, type: v.resolvedType });
return kit;`;
