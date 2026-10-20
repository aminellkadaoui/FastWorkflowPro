/* fast workflow pro - 4.0 tools
   Builds the new sections (they behave like the built-in ones: workspace.js can put them
   in any tab): Masks (explode), Select by type, Split text, Color palette, Accordion.
   Notes lives in js/notes.js. The After Effects side is jsx/fwp_tools2.jsx. */
(function () {
    var JSX_FILE = 'fwp_tools2.jsx';

    function byId(id) { return document.getElementById(id); }
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
    function say(msg, type) { if (typeof toast === 'function') toast(msg, type); }

    // run ExtendScript from fwp_tools2.jsx (loaded on demand, from the copy that is running)
    function jsx(code, cb) {
        if (typeof cs === 'undefined' || !cs) return cb && cb('EZW_ERROR: After Effects غير متصل');
        // tools stay off until the trial is running or the licence is active (set by main.js)
        if (window.__fwpLicensed !== true) return cb && cb('EZW_ERROR: فعّل Fast Workflow Pro أول');
        var dir = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '') + '/jsx/';
        // After Effects keeps scripts in memory for the whole session, so a check like
        // "is the function defined?" would keep running the OLD script after an update.
        // Stamp the loaded copy with the panel version and reload when it differs.
        var stamp = String(window.FWP_VERSION || '0') + '|' + dir;
        var load = 'if(typeof fwp_stamp==="undefined"||fwp_stamp!==' + JSON.stringify(stamp) + '){$.evalFile("' + dir + JSX_FILE + '");fwp_stamp=' + JSON.stringify(stamp) + ';}';
        cs.evalScript(load + code, function (r) { cb && cb(r); });
    }
    function run(code, okMsg, cb) {
        jsx(code, function (r) {
            r = String(r || '');
            if (r.indexOf('EZW_ERROR') === 0) { say(r.replace('EZW_ERROR: ', ''), 'error'); return; }
            if (okMsg) say(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'success');
            cb && cb(r);
        });
    }
    function q(s) { return JSON.stringify(String(s)); }
    window.FWP_JSX = jsx;

    // run fn when el becomes visible, when the panel window gets focus, and every `every` ms
    // while visible AND focused — instead of polling After Effects non-stop
    function whenNeeded(el, fn, every) {
        var wasVisible = false, last = 0;
        function tick(force) {
            var vis = el.offsetParent !== null;
            if (vis && (force || !wasVisible || (document.hasFocus() && Date.now() - last > every))) { last = Date.now(); fn(); }
            wasVisible = vis;
        }
        setInterval(function () { tick(false); }, 1500);            // cheap: no AE call unless needed
        window.addEventListener('focus', function () { tick(true); });
    }
    window.FWP_WHEN_NEEDED = whenNeeded;

    function section(id, label) {
        var s = el('div', 'psec fwp-tool');
        s.id = id;
        if (label) s.appendChild(el('div', 'tools-section-label', label));
        return s;
    }
    var ICON = {
        masks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><rect x="11" y="11" width="9" height="9" rx="1.5"/><path d="M4 20l3-3M20 4l-3 3"/></svg>',
        words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h5M3 12h5M3 17h5"/><path d="M11 7h4M11 12h4M11 17h4"/><path d="M18 7h3M18 12h3M18 17h3"/></svg>',
        lines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h12"/></svg>',
        letters: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l3-12 3 12M4.2 14h3.6"/><path d="M13 6v12M13 6h3a3 3 0 0 1 0 6h-3M13 12h3.5a3 3 0 0 1 0 6H13"/></svg>',
        group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 11h13M7 16h13"/><path d="M4 11v5"/></svg>'
    };

    // ── Masks ──────────────────────────────────────────────────────────────
    function buildMasks() {
        var s = section('sec-masks', 'Masks');
        var o = store('fwp_masks_opts') || { hide: true, pre: false, stag: 0 };
        var btn = el('button', 'srt-btn fwp-wide', '<span class="srt-icon">' + ICON.masks + '</span><span>Explode Masks</span>');
        btn.id = 'fwp-explode';
        btn.title = 'كل ماسك في طبقة لحاله';
        var opts = el('div', 'fwp-opts');
        opts.innerHTML =
            '<label><input type="checkbox" data-o="hide"> إخفاء الأصل</label>' +
            '<label><input type="checkbox" data-o="pre"> Precomp</label>' +
            '<label class="fwp-stag">تأخير <input type="number" min="0" max="999" data-o="stag"> فريم</label>';
        opts.querySelectorAll('[data-o]').forEach(function (i) {
            if (i.type === 'checkbox') i.checked = !!o[i.dataset.o]; else i.value = o[i.dataset.o] || 0;
            i.addEventListener('change', function () { o[i.dataset.o] = i.type === 'checkbox' ? i.checked : (parseInt(i.value, 10) || 0); store('fwp_masks_opts', o); });
        });
        btn.addEventListener('click', function () {
            run('fwp_explodeMasks(' + !!o.hide + ',' + !!o.pre + ',' + (o.stag || 0) + ')', function (r) { return 'تم ✓ ' + r.split(':')[1] + ' ماسك'; });
        });
        s.appendChild(btn); s.appendChild(opts);
        return s;
    }

    // ── Select by type ─────────────────────────────────────────────────────
    var TYPES = [['text', 'T', 'Text'], ['shape', '★', 'Shape'], ['solid', '■', 'Solid'], ['null', '⊠', 'Null'], ['adjust', '◐', 'Adjust'],
        ['precomp', '▣', 'Precomp'], ['footage', '▶', 'Footage'], ['audio', '♪', 'Audio'], ['camera', '◉', 'Camera'], ['light', '✷', 'Light']];
    function buildSelect() {
        var s = section('sec-select', 'Select Layers <span class="hint">(Shift = إضافة للتحديد)</span>');
        var g = el('div', 'fwp-seltypes');
        TYPES.forEach(function (t) {
            var b = el('button', 'fwp-selbtn', '<span class="fwp-selico">' + t[1] + '</span><span>' + t[2] + '</span>');
            b.dataset.seltype = t[0];
            b.title = 'حدّد كل طبقات ' + t[2];
            b.addEventListener('click', function (e) {
                run('fwp_selectByType(' + q(t[0]) + ',' + !!e.shiftKey + ')', function (r) { return 'تحديد ' + r.split(':')[1] + ' طبقة'; });
            });
            g.appendChild(b);
        });
        s.appendChild(g);
        evenGrid(g, 64);
        return s;
    }

    // Columns = the largest divisor of the button count that still fits, so every row is
    // full (10 buttons → 5+5 when wide, 2 per row when narrow). Never a half-empty last row.
    function evenGrid(g, minW) {
        function fit() {
            var n = g.children.length, w = g.clientWidth; if (!n || !w) return;
            var cols = 1;
            for (var c = n; c >= 1; c--) if (n % c === 0 && (w - (c - 1) * 4) / c >= minW) { cols = c; break; }
            g.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
        }
        if (window.ResizeObserver) new ResizeObserver(fit).observe(g);
        setTimeout(fit, 0);
    }

    // ── Split text ─────────────────────────────────────────────────────────
    function buildSplit() {
        var s = section('sec-split', 'Split Text <span class="hint">(Shift = أسطر)</span>');
        var row = el('div', 'cappre-row');
        var w = el('button', 'srt-btn', '<span class="srt-icon">' + ICON.words + '</span><span>كلمات</span>');
        var l = el('button', 'srt-btn', '<span class="srt-icon">' + ICON.lines + '</span><span>أسطر</span>');
        var c = el('button', 'srt-btn', '<span class="srt-icon">' + ICON.letters + '</span><span>أحرف</span>');
        w.id = 'fwp-split-words'; l.id = 'fwp-split-lines'; c.id = 'fwp-split-letters';
        c.title = 'كل حرف في طبقة بنفس مكانه — الحروف العربية تحافظ على شكلها المتصل';
        w.title = 'كل كلمة في طبقة بنفس مكانها — Shift = أسطر';
        l.title = 'كل سطر في طبقة بنفس مكانه';
        function go(mode) { run('fwp_splitText(' + q(mode) + ')', function (r) { return 'تم ✓ ' + r.split(':')[1] + (mode === 'lines' ? ' سطر' : mode === 'letters' ? ' حرف' : ' كلمة'); }); }
        w.addEventListener('click', function (e) { go(e.shiftKey ? 'lines' : 'words'); });
        l.addEventListener('click', function () { go('lines'); });
        c.addEventListener('click', function () { go('letters'); });
        row.appendChild(w); row.appendChild(l); row.appendChild(c);
        s.appendChild(row);
        return s;
    }

    // ── Color palette ──────────────────────────────────────────────────────
    var PAL_KEY = 'fwp_palettes_v1';
    var DEFAULT_PALS = [
        { name: 'Brand', colors: ['#00A1FF', '#1C79FE', '#FFFFFF', '#1D1D1D', '#FFC83D', '#FF4455'] },
        { name: 'Pastel', colors: ['#FFD6E0', '#FFEFB5', '#C1F0DB', '#C6E2FF', '#E2D4FF', '#FFE0C2'] }
    ];
    function buildPalette() {
        var s = section('sec-palette', 'Colors <span class="hint">(ضغطة = نسخ + تطبيق · Shift = Stroke · كليك يمين = حذف)</span>');
        var data = store(PAL_KEY) || { pals: DEFAULT_PALS, cur: 0 };
        var head = el('div', 'fwp-palhead');
        var sel = el('select', 'fwp-palsel');
        var add = el('button', 'fwp-mini', '＋ لوحة');
        var ren = el('button', 'fwp-mini', '✎');
        var del = el('button', 'fwp-mini', '🗑');
        head.appendChild(sel); head.appendChild(ren); head.appendChild(add); head.appendChild(del);
        var sw = el('div', 'fwp-swatches');
        var addRow = el('div', 'fwp-addcolor');
        addRow.innerHTML = '<input type="color" value="#00a1ff"><input type="text" placeholder="#HEX أو كذا كود مفصول بفواصل" spellcheck="false"><button class="fwp-mini">إضافة</button>';
        s.appendChild(head); s.appendChild(sw); s.appendChild(addRow);

        function save() { store(PAL_KEY, data); }
        function cur() { return data.pals[data.cur] || data.pals[0]; }
        function render() {
            sel.innerHTML = '';
            data.pals.forEach(function (p, i) { var o = el('option', null); o.value = i; o.textContent = p.name; sel.appendChild(o); });
            sel.value = data.cur;
            sw.innerHTML = '';
            cur().colors.forEach(function (c, i) {
                var b = el('button', 'fwp-sw');
                b.style.background = c; b.title = c + ' — ضغطة = نسخ وتطبيق';
                b.addEventListener('click', function (e) { useColor(c, e.shiftKey); });
                b.addEventListener('contextmenu', function (e) { e.preventDefault(); cur().colors.splice(i, 1); save(); render(); });
                sw.appendChild(b);
            });
            if (!cur().colors.length) sw.appendChild(el('div', 'fwp-empty', 'اللوحة فاضية — أضف ألوان من تحت'));
        }
        sel.addEventListener('change', function () { data.cur = parseInt(sel.value, 10) || 0; save(); render(); });
        add.addEventListener('click', function () { data.pals.push({ name: 'لوحة ' + (data.pals.length + 1), colors: [] }); data.cur = data.pals.length - 1; save(); render(); });
        del.addEventListener('click', function () {
            if (data.pals.length < 2) return say('لازم تظل لوحة وحدة على الأقل', 'error');
            if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.textContent = 'متأكد؟'; setTimeout(function () { del.classList.remove('confirm'); del.textContent = '🗑'; }, 2500); return; }
            data.pals.splice(data.cur, 1); data.cur = 0; save(); render();
        });
        ren.addEventListener('click', function () {
            var inp = el('input', 'fwp-palname'); inp.type = 'text'; inp.value = cur().name;
            sel.replaceWith(inp); inp.focus(); inp.select();
            function done() { var v = inp.value.trim(); if (v) cur().name = v; save(); inp.replaceWith(sel); render(); }
            inp.addEventListener('blur', done);
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
        });
        var picker = addRow.querySelector('input[type=color]'), text = addRow.querySelector('input[type=text]');
        function addColors() {
            var raw = text.value.trim() ? text.value : picker.value;
            var found = raw.match(/#?[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || [];
            if (!found.length) return say('اكتب كود لون مثل #FF5500', 'error');
            found.forEach(function (h) {
                h = h.replace('#', '');
                if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
                cur().colors.push('#' + h.toUpperCase());
            });
            text.value = ''; save(); render();
        }
        addRow.querySelector('button').addEventListener('click', addColors);
        text.addEventListener('keydown', function (e) { if (e.key === 'Enter') addColors(); });
        render();
        return s;
    }
    function copyText(t) {
        var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
        try { document.execCommand('copy'); } catch (e) {}
        a.remove();
    }
    function useColor(hex, stroke) {
        copyText(hex);
        jsx('fwp_applyColor(' + q(hex) + ',' + !!stroke + ')', function (r) {
            r = String(r || '');
            var n = r.indexOf('ok:') === 0 ? parseInt(r.split(':')[1], 10) : 0;
            say(n ? hex + ' — نُسخ وطُبّق على ' + n + (stroke ? ' (Stroke)' : '') : hex + ' — نُسخ ✓', 'success');
        });
    }

    // ── Accordion ──────────────────────────────────────────────────────────
    function buildAccordion() {
        var s = section('sec-accordion', 'Accordion <span class="hint">(طي الطبقات بدون Precomp)</span>');
        var row = el('div', 'fwp-acc-new');
        row.innerHTML = '<input type="text" placeholder="اسم المجموعة" dir="auto"><button class="primary-btn">' + ICON.group + ' Group</button><button class="fwp-mini" title="تحديث">↻</button>';
        var list = el('div', 'fwp-acc-list');
        s.appendChild(row); s.appendChild(list);
        var name = row.querySelector('input'), btns = row.querySelectorAll('button');
        btns[0].addEventListener('click', function () {
            run('fwp_accGroup(' + q(name.value.trim() || 'Group') + ')', 'تم إنشاء المجموعة ✓', function () { name.value = ''; refresh(); });
        });
        name.addEventListener('keydown', function (e) { if (e.key === 'Enter') btns[0].click(); });
        btns[1].addEventListener('click', refresh);
        function refresh() {
            jsx('fwp_accList()', function (r) {
                var groups = [];
                try { groups = JSON.parse(r) || []; } catch (e) {}
                var sig = JSON.stringify(groups);
                if (sig === list.dataset.sig) return;
                list.dataset.sig = sig;
                list.innerHTML = '';
                if (!groups.length) { list.appendChild(el('div', 'fwp-empty', 'حدّد طبقات واضغط Group')); return; }
                groups.forEach(function (g) {
                    var it = el('div', 'fwp-acc-item' + (g.open ? '' : ' closed'));
                    it.innerHTML = '<button class="fwp-acc-fold"></button><span class="fwp-acc-name" dir="auto"></span>' +
                        '<button class="fwp-mini fwp-acc-count" title="حدّد طبقات المجموعة"></button><button class="fwp-mini" title="فك المجموعة">✕</button>';
                    it.querySelector('.fwp-acc-fold').textContent = g.open ? '▼' : '▶';
                    it.querySelector('.fwp-acc-name').textContent = g.name;
                    it.querySelector('.fwp-acc-count').textContent = g.count;
                    var b = it.querySelectorAll('button');
                    function fold() { run('fwp_accToggle(' + q(g.id) + ',' + !g.open + ')', null, refresh); }
                    b[0].addEventListener('click', fold);
                    it.querySelector('.fwp-acc-name').addEventListener('click', fold);
                    it.querySelector('.fwp-acc-name').addEventListener('dblclick', function (e) {
                        e.stopPropagation();
                        var n = it.querySelector('.fwp-acc-name'), inp = el('input'); inp.type = 'text'; inp.value = g.name; inp.dir = 'auto';
                        n.replaceWith(inp); inp.focus(); inp.select();
                        inp.addEventListener('blur', function () { run('fwp_accRename(' + q(g.id) + ',' + q(inp.value.trim() || g.name) + ')', null, function () { list.dataset.sig = ''; refresh(); }); });
                        inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); });
                    });
                    b[1].addEventListener('click', function () { run('fwp_accSelect(' + q(g.id) + ')'); });
                    b[2].addEventListener('click', function () { run('fwp_accUngroup(' + q(g.id) + ')', 'تم فك المجموعة', refresh); });
                    list.appendChild(it);
                });
            });
        }
        // Ask After Effects only when it matters: when the section appears, when the panel
        // gets focus (you come back from the timeline), and at most every 12 s while focused.
        whenNeeded(s, refresh, 12000);
        s._refresh = refresh;
        return s;
    }

    window.addEventListener('DOMContentLoaded', function () {
        if (window.__FWP_REDIRECT) return;
        var host = byId('tools-list'); if (!host) return;
        [buildMasks(), buildSplit(), buildSelect(), buildPalette(), buildAccordion()].forEach(function (s) { host.appendChild(s); });
    });
})();
