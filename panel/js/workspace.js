/* fast workflow pro - fully customizable tabs
   • Tabs: add (from a ready template or empty), rename, reorder, delete — via the ⚙ in the top bar.
   • Each tab holds boxes. A box is either a whole section (Graph, Expression Library, …)
     or a group of single buttons the user picks (one align button, one colour, one
     expression, one ease preset…). Boxes and buttons are dragged freely, boxes are
     half/full width, buttons small/medium/large.
   • A section (Graph, Align…) can be placed in several tabs: the one real section is moved
     into whichever tab is on screen, so it keeps its own bindings. Single buttons are
     proxies that click the original, so they can repeat anywhere.
   • Drag & drop uses mouse events + elementFromPoint only (no rect maths), so it works in
     AE's CEF even with the panel's CSS zoom (fitUI in main.js).
   • Layout is saved to the user's data folder (survives CEP storage clears and updates),
     with localStorage as the fallback. */
(function () {
    var STORE_KEY = 'fwp_tabs_v2', OLD_KEY = 'fwp_workspace_v1';

    // ── what can go in a tab ─────────────────────────────────────────────────
    var SECTIONS = {
        'sec-anchor':        'Anchor Point',
        'sec-align':         'Align',
        'sec-create':        'Create',
        'sec-inout':         'In / Out',
        'sec-color':         'Layer Color',
        'sec-cappre':        'Captions · Pre-comp',
        'sec-graph-main':    'Graph',
        'sec-graph-actions': 'Graph Actions',
        'sec-graph-presets': 'Graph Presets',
        'sec-expr-add':      'Add Expression',
        'sec-expr-lib':      'Expression Library',
        'sec-masks':         'Masks',
        'sec-split':         'Split Text',
        'sec-select':        'Select Layers',
        'sec-palette':       'Colors',
        'sec-accordion':     'Accordion',
        'sec-notes':         'Notes'
    };
    // extra words the add-window search understands (Arabic + English)
    var SEC_WORDS = {
        'sec-anchor': 'انكر نقطة الارتكاز anchor', 'sec-align': 'محاذاة align', 'sec-create': 'نل سوليد ادجستمنت null solid create',
        'sec-inout': 'قص بداية نهاية trim in out split', 'sec-color': 'لون الطبقة label', 'sec-cappre': 'ترجمة srt بريكومب تنظيم',
        'sec-graph-main': 'جراف منحنى ايز ease graph curve', 'sec-graph-actions': 'جراف نسخ لصق عكس', 'sec-graph-presets': 'بريسيت جراف ease',
        'sec-expr-add': 'اكسبريشن تعبير expression', 'sec-expr-lib': 'مكتبة اكسبريشن expression',
        'sec-masks': 'ماسك تفجير explode mask', 'sec-split': 'تقسيم نص كلمات اسطر احرف حروف split words lines letters', 'sec-select': 'تحديد طبقات نوع select',
        'sec-palette': 'الوان لوحة باليت palette color hex', 'sec-accordion': 'طي مجموعات جروب group fold', 'sec-notes': 'ملاحظات نوت notes نوشن'
    };
    var SEC_ORDER = Object.keys(SECTIONS);

    // single buttons that proxy a click to an existing control
    var CLICK_GROUPS = [
        { name: 'Align', items: [
            ['.align-btn[data-align="left"]', 'Left'], ['.align-btn[data-align="hcenter"]', 'H-Center'],
            ['.align-btn[data-align="right"]', 'Right'], ['.align-btn[data-align="top"]', 'Top'],
            ['.align-btn[data-align="vcenter"]', 'V-Center'], ['.align-btn[data-align="bottom"]', 'Bottom']] },
        { name: 'Anchor', items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
            return ['#anchor-grid > .anchor-btn:nth-child(' + n + ')', 'Anchor ' + ['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'][n - 1]];
        }) },
        { name: 'Create', items: [['[data-create="null"]', 'Null'], ['[data-create="adjustment"]', 'Adjust'], ['[data-create="solid"]', 'Solid']] },
        { name: 'In / Out', items: [['[data-trim="in"]', 'Set In'], ['[data-trim="out"]', 'Set Out'], ['[data-trim="inm"]', 'Move In'],
            ['#btn-reverse-keys', 'Reverse Keys'], ['[data-trim="split"]', 'Split']] },
        { name: 'Captions · Pre-comp', items: [['#btn-import-srt', 'Import SRT'], ['#btn-precomp', 'Pre-compose'], ['#btn-organize', 'Organize']] },
        { name: 'Graph', items: [['#gc-apply', 'Apply Ease'], ['#gc-reverse', 'Reverse Ease'], ['#gc-copy', 'Copy Ease'], ['#gc-paste', 'Paste Ease']] },
        { name: 'Masks · Text', items: [['#fwp-explode', 'Explode Masks'], ['#fwp-split-words', 'Split Words'], ['#fwp-split-lines', 'Split Lines'], ['#fwp-split-letters', 'Split Letters']] },
        { name: 'Select', items: [['text', 'Text'], ['shape', 'Shape'], ['solid', 'Solid'], ['null', 'Null'], ['adjust', 'Adjust'],
            ['precomp', 'Precomp'], ['footage', 'Footage'], ['audio', 'Audio'], ['camera', 'Camera'], ['light', 'Light']]
            .map(function (t) { return ['[data-seltype="' + t[0] + '"]', 'Select ' + t[1]]; }) }
    ];
    var LABEL_NAMES = ['None', 'Red', 'Yellow', 'Aqua', 'Pink', 'Lavender', 'Peach', 'Sea Foam', 'Blue',
        'Green', 'Purple', 'Orange', 'Brown', 'Fuchsia', 'Cyan', 'Sandstone', 'Dark Green'];

    function clickItem(sel) {
        for (var g = 0; g < CLICK_GROUPS.length; g++)
            for (var i = 0; i < CLICK_GROUPS[g].items.length; i++)
                if (CLICK_GROUPS[g].items[i][0] === sel) return { k: 'click', sel: sel, label: CLICK_GROUPS[g].items[i][1] };
        return null;
    }

    // ── ready-made tabs ──────────────────────────────────────────────────────
    function exprByWord(words) {
        var list = (typeof exprPresets !== 'undefined' && exprPresets.length) ? exprPresets
            : (typeof EXPR_DEFAULTS !== 'undefined' ? EXPR_DEFAULTS : []);
        return list.filter(function (p) {
            var l = (p.label || '').toLowerCase();
            return words.some(function (w) { return l.indexOf(w) >= 0; });
        }).map(function (p) { return { k: 'expr', label: p.label, code: p.code }; });
    }
    function btns(sels) { return sels.map(clickItem).filter(Boolean); }

    function groupSels(name) {
        for (var g = 0; g < CLICK_GROUPS.length; g++) if (CLICK_GROUPS[g].name === name) return CLICK_GROUPS[g].items.map(function (x) { return x[0]; });
        return [];
    }
    // the same tools as a section, but as single buttons the user can edit one by one
    function sectionAsButtons(sec) {
        var gp = (typeof gcPresets !== 'undefined' && gcPresets.length) ? gcPresets : (typeof GC_DEFS !== 'undefined' ? GC_DEFS : []);
        var map = {
            'sec-anchor':        ['s', btns(groupSels('Anchor'))],
            'sec-align':         ['m', btns(groupSels('Align'))],
            'sec-create':        ['l', btns(groupSels('Create'))],
            'sec-inout':         ['m', btns(groupSels('In / Out'))],
            'sec-color':         ['s', LABEL_NAMES.map(function (_, i) { return { k: 'label', idx: i }; })],
            'sec-cappre':        ['l', btns(groupSels('Captions · Pre-comp'))],
            'sec-graph-actions': ['m', btns(['#gc-reverse', '#gc-copy', '#gc-paste'])],
            'sec-graph-presets': ['m', gp.map(function (p) { return { k: 'ease', i: p.i, o: p.o }; })],
            'sec-expr-lib':      ['l', exprByWord([''])],
            'sec-masks':         ['l', btns(['#fwp-explode'])],
            'sec-split':         ['l', btns(['#fwp-split-words', '#fwp-split-lines', '#fwp-split-letters'])],
            'sec-select':        ['m', btns(groupSels('Select'))]
        }[sec];
        return map ? { type: 'buttons', title: SECTIONS[sec], size: 'full', bsize: map[0], items: map[1] } : null;
    }
    function copyBox(b) {
        var c = JSON.parse(JSON.stringify(b)); c.id = uid();
        return c;
    }

    var TEMPLATES = [
        { id: 'animation', name: 'أنيميشن', desc: 'Graph + بريسيتات + حركة', build: function () {
            return [
                { type: 'section', sec: 'sec-graph-main', size: 'full' },
                { type: 'section', sec: 'sec-graph-presets', size: 'full' },
                { type: 'buttons', title: 'Keys', size: 'full', bsize: 'm', items: btns(['#gc-reverse', '#gc-copy', '#gc-paste', '[data-trim="in"]', '[data-trim="out"]', '#btn-reverse-keys']) },
                { type: 'buttons', title: 'Motion', size: 'full', bsize: 'l', items: exprByWord(['wiggle', 'loop', 'bounce', 'smooth', 'ping']) }
            ];
        } },
        { id: 'text', name: 'نصوص وترجمة', desc: 'SRT + Pre-comp + ألوان', build: function () {
            return [
                { type: 'buttons', title: 'Captions', size: 'full', bsize: 'l', items: btns(['#btn-import-srt', '#btn-precomp', '[data-trim="split"]']) },
                { type: 'buttons', title: 'Align', size: 'full', bsize: 'm', items: btns(['.align-btn[data-align="hcenter"]', '.align-btn[data-align="vcenter"]', '.align-btn[data-align="bottom"]']) },
                { type: 'buttons', title: 'Colors', size: 'full', bsize: 's', items: [1, 2, 8, 9, 11].map(function (i) { return { k: 'label', idx: i }; }) }
            ];
        } },
        { id: 'organize', name: 'تنظيم', desc: 'Organize + Create + ألوان', build: function () {
            return [
                { type: 'buttons', title: 'Project', size: 'full', bsize: 'l', items: btns(['#btn-organize', '#btn-precomp']) },
                { type: 'buttons', title: 'Create', size: 'full', bsize: 'l', items: btns(['[data-create="null"]', '[data-create="adjustment"]', '[data-create="solid"]']) },
                { type: 'buttons', title: 'Colors', size: 'full', bsize: 's', items: LABEL_NAMES.map(function (_, i) { return { k: 'label', idx: i }; }) }
            ];
        } },
        { id: 'expr', name: 'إكسبريشن', desc: 'كل الإكسبريشنات كأزرار', build: function () {
            return [{ type: 'buttons', title: 'Expressions', size: 'full', bsize: 'l', items: exprByWord(['']) }];
        } },
        { id: 'empty', name: 'فاضي', desc: 'ابنه من الصفر', build: function () { return []; } }
    ];

    function defaultTabs() {
        var tools = null;
        try { tools = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) {}
        if (!tools || !tools.length) tools = [
            { id: 'sec-anchor', size: 'half' }, { id: 'sec-align', size: 'half' }, { id: 'sec-create', size: 'full' },
            { id: 'sec-inout', size: 'full' }, { id: 'sec-color', size: 'full' }, { id: 'sec-cappre', size: 'full' }];
        var placed = {};
        tools = tools.filter(function (b) { return SECTIONS[b.id]; });
        tools.forEach(function (b) { placed[b.id] = 1; });
        function rest(ids) { return ids.filter(function (id) { return !placed[id]; }).map(function (id) { return { type: 'section', sec: id, size: 'full' }; }); }
        var tabs = [
            { id: uid(), name: 'Tools', boxes: tools.map(function (b) { return { type: 'section', sec: b.id, size: b.size || 'full' }; }) },
            { id: uid(), name: 'Graph', boxes: rest(['sec-graph-main', 'sec-graph-actions', 'sec-graph-presets']) },
            { id: uid(), name: 'Expr', boxes: rest(['sec-expr-add', 'sec-expr-lib']) }
        ].map(withIds);
        addV4(tabs);
        return tabs;
    }

    // 4.0: Masks + Split Text join Tools; new "Layers" and "Notes" tabs (added once)
    function addV4(tabs) {
        var tools = null;
        tabs.forEach(function (t) { if (!tools && /tools/i.test(t.name)) tools = t; });
        tools = tools || tabs[0];
        function has(sec) { return tabs.some(function (t) { return t.boxes.some(function (b) { return b.sec === sec; }); }); }
        ['sec-masks', 'sec-split'].forEach(function (sec) { if (!has(sec)) tools.boxes.push({ id: uid(), type: 'section', sec: sec, w: 12 }); });
        var layers = ['sec-accordion', 'sec-select', 'sec-palette'].filter(function (sec) { return !has(sec); });
        if (layers.length) tabs.push(withIds({ id: uid(), name: 'Layers', boxes: layers.map(function (sec) { return { type: 'section', sec: sec, w: 12 }; }) }));
        if (!has('sec-notes')) tabs.push(withIds({ id: uid(), name: 'Notes', boxes: [{ type: 'section', sec: 'sec-notes', w: 12 }] }));
    }
    // width in 12ths of the row: 0 = natural size, 'fill' = take what's left
    function migrateWidth(box, next) {
        if (box.w !== undefined) return;
        if (box.size === 'half') {
            if (box.sec === 'sec-anchor') box.w = 0;
            else box.w = 6;
        } else box.w = 12;
    }

    // ── state + persistence ─────────────────────────────────────────────────
    var model = null, editing = false, stash, panels = {}, tabBar, lastBox = {};
    var openGroups = { 'أقسام كاملة': true };
    var nodeFs = null, layoutFile = null;
    try {
        if (typeof require === 'function' && window.FWP_UPDATE_ROOT) {
            nodeFs = require('fs');
            layoutFile = require('path').join(window.FWP_UPDATE_ROOT, 'layout.json');
        }
    } catch (e) {}

    function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }
    function withIds(tab) { tab.boxes.forEach(function (b) { b.id = b.id || uid(); if (b.items) b.items = b.items.slice(); }); return tab; }
    function byId(id) { return document.getElementById(id); }

    function load() {
        var data = null;
        try { if (nodeFs && nodeFs.existsSync(layoutFile)) data = JSON.parse(nodeFs.readFileSync(layoutFile, 'utf8')); } catch (e) {}
        if (!data) { try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {} }
        if (!data || !data.tabs || !data.tabs.length) data = { tabs: defaultTabs() };
        // a section may appear once per tab (in as many tabs as you like)
        data.tabs.forEach(function (t) {
            var seen = {};
            t.boxes = (t.boxes || []).filter(function (b) {
                if (b.type !== 'section') return b.type === 'buttons';
                if (!SECTIONS[b.sec] || seen[b.sec]) return false;
                return (seen[b.sec] = true);
            });
            withIds(t);
            t.boxes.forEach(function (b, i) {
                migrateWidth(b);
                // the classic Anchor + Align row: Align fills what Anchor leaves
                if (b.sec === 'sec-align' && b.w === 6 && t.boxes[i - 1] && t.boxes[i - 1].sec === 'sec-anchor' && t.boxes[i - 1].w === 0) b.w = 'fill';
            });
        });
        if (!data.v || data.v < 4) { addV4(data.tabs); data.v = 4; }
        return data;
    }
    // Undo: every layout change made while customizing can be stepped back (Cmd/Ctrl+Z or ↶)
    var history = [], lastJson = null;
    function undo() {
        if (!history.length) { if (typeof toast === 'function') toast('ما فيه شي تتراجع عنه'); return; }
        var cur = currentTab(), curId = cur && cur.id;
        model = JSON.parse(history.pop());
        lastJson = JSON.stringify(model);
        persist(lastJson);
        Object.keys(panels).forEach(function (id) { var t = findTab(id); if (t) renderTab({ id: id, name: '', boxes: [] }); panels[id].remove(); delete panels[id]; });
        renderTabBar(); model.tabs.forEach(renderTab);
        var back = (curId && findTab(curId)) ? curId : (model.tabs[0] && model.tabs[0].id);
        if (back) openTab(back);
        setEditing(true);
        updateUndo();
    }
    function updateUndo() {
        Object.keys(panels).forEach(function (id) { var b = panels[id].querySelector('.wsx-undo'); if (b) b.disabled = !history.length; });
    }

    function save() {
        var json = JSON.stringify(model);
        if (lastJson !== null && json !== lastJson && editing) { history.push(lastJson); if (history.length > 40) history.shift(); }
        lastJson = json;
        persist(json);
        updateUndo();
    }
    function persist(json) {
        try { localStorage.setItem(STORE_KEY, json); } catch (e) {}
        try {
            if (nodeFs) {
                var dir = require('path').dirname(layoutFile);
                if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir);
                nodeFs.writeFileSync(layoutFile, json);
            }
        } catch (e) {}
    }

    function findTab(id) { for (var i = 0; i < model.tabs.length; i++) if (model.tabs[i].id === id) return model.tabs[i]; return null; }
    function findBox(id) {
        for (var i = 0; i < model.tabs.length; i++)
            for (var j = 0; j < model.tabs[i].boxes.length; j++)
                if (model.tabs[i].boxes[j].id === id) return { tab: model.tabs[i], box: model.tabs[i].boxes[j], index: j };
        return null;
    }
    function sectionHome(sec) {
        for (var i = 0; i < model.tabs.length; i++)
            for (var j = 0; j < model.tabs[i].boxes.length; j++)
                if (model.tabs[i].boxes[j].sec === sec) return model.tabs[i];
        return null;
    }
    function currentTab() { return (typeof activeTab === 'string' && activeTab.indexOf('ct_') === 0) ? findTab(activeTab.slice(3)) : null; }

    // ── actions of single buttons ────────────────────────────────────────────
    function runItem(item, ev) {
        if (item.k === 'click') {
            if (typeof buildAnchorGrid === 'function') buildAnchorGrid();
            var orig = document.querySelector(item.sel);
            if (orig) orig.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true,
                shiftKey: !!(ev && ev.shiftKey), altKey: !!(ev && ev.altKey), ctrlKey: !!(ev && ev.ctrlKey), metaKey: !!(ev && ev.metaKey) }));
        } else if (item.k === 'label') {
            if (typeof runQuick === 'function') runQuick('ezw_setLabelColor(' + item.idx + ')');
        } else if (item.k === 'expr') {
            var code = byId('expr-code'); if (code) code.value = item.code;
            if (typeof applyExpr === 'function') applyExpr(item.code);
        } else if (item.k === 'ease') {
            if (typeof cs === 'undefined' || !cs) return;
            var aff = typeof gcAffect === 'function' ? gcAffect() : 'false';
            cs.evalScript('applyEasePreset(' + Math.max(item.i, .1) + ',' + Math.max(item.o, .1) + ',' + aff + ')', function () {
                if (typeof toast === 'function') toast('Ease In ' + item.i + '% · Out ' + item.o + '%');
            });
        }
    }

    function itemLabel(item) {
        if (item.name) return item.name;
        if (item.k === 'click') return item.label;
        if (item.k === 'label') return LABEL_NAMES[item.idx] || 'Color';
        if (item.k === 'expr') return item.label;
        if (item.k === 'ease') return 'In ' + item.i + ' · Out ' + item.o;
        return '';
    }

    function renderItemFace(el, item) {
        el.title = itemLabel(item);
        el.dataset.k = item.k;
        if (item.k === 'click') {
            if (typeof buildAnchorGrid === 'function') buildAnchorGrid();
            var orig = document.querySelector(item.sel);
            var svg = orig ? orig.querySelector('svg') : null;
            var tag = orig ? orig.querySelector('.srt-icon') : null;
            el.innerHTML = '<span class="wsx-ico"></span><span class="wsx-lbl"></span>';
            if (svg) el.firstChild.appendChild(svg.cloneNode(true));
            else if (tag) el.firstChild.textContent = tag.textContent;
            else el.firstChild.textContent = '•';
            el.lastChild.textContent = item.label;
        } else if (item.k === 'label') {
            el.innerHTML = '<span class="wsx-ico"><span class="wsx-swatch"></span></span><span class="wsx-lbl"></span>';
            var sw = el.querySelector('.wsx-swatch');
            if (item.idx === 0) sw.classList.add('none');
            else if (typeof LABEL_COLORS !== 'undefined') sw.style.background = LABEL_COLORS[item.idx];
            el.lastChild.textContent = LABEL_NAMES[item.idx];
        } else if (item.k === 'expr') {
            el.innerHTML = '<span class="wsx-ico">ƒ</span><span class="wsx-lbl"></span>';
            el.lastChild.textContent = item.label;
            el.title = item.code;
        } else if (item.k === 'ease') {
            el.innerHTML = '<span class="wsx-ico"></span><span class="wsx-lbl"></span>';
            el.lastChild.textContent = itemLabel(item);
            try {
                var c = document.createElement('canvas');
                c.width = GC_MW * 2; c.height = GC_MH * 2; c.style.width = GC_MW + 'px'; c.style.height = GC_MH + 'px';
                gcDrawMini(c, item.o / 100, item.i / 100, typeof gcPresetMode !== 'undefined' ? gcPresetMode : 'speed');
                el.firstChild.appendChild(c);
            } catch (e) { el.firstChild.textContent = '∿'; }
        }
        var lbl = el.querySelector('.wsx-lbl'); if (lbl) lbl.textContent = itemLabel(item);
    }

    // ── rendering ────────────────────────────────────────────────────────────
    function renderTabBar() {
        tabBar.querySelectorAll('.tab-btn.wsx-tab').forEach(function (b) { b.remove(); });
        var tpl = tabBar.querySelector('[data-tab="templates"]');
        if (tpl) tpl.classList.toggle('hidden', !!model.hideTemplates);
        model.tabs.forEach(function (t) {
            if (t.hidden) return;
            var b = document.createElement('button');
            b.className = 'tab-btn wsx-tab';
            b.dataset.tab = 'ct_' + t.id;
            b.textContent = t.name;
            if (activeTab === b.dataset.tab) b.classList.add('active');
            b.addEventListener('click', function () { openTab(t.id); });
            tabBar.appendChild(b);
        });
    }

    function openTab(id) {
        document.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
        var b = tabBar.querySelector('[data-tab="ct_' + id + '"]'); if (b) b.classList.add('active');
        activeTab = 'ct_' + id;
        switchTab();
    }

    function renderTab(tab) {
        var panel = panels[tab.id];
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'wsx-panel hidden';
            panel.innerHTML =
                '<div class="panel-head"><span class="panel-head-title"></span>' +
                '<span class="wsx-headbtns"><button class="wsx-undo hidden" title="تراجع (Cmd/Ctrl+Z)">↶ تراجع</button>' +
                '<button class="ws-edit-btn">✎ <span>تخصيص</span></button></span></div>' +
                '<div class="wsx-palette hidden"></div>' +
                '<div class="wsx-grid"></div>' +
                '<button class="wsx-addbox hidden">＋ مربع جديد</button>';
            panel.querySelector('.ws-edit-btn').addEventListener('click', function () { setEditing(!editing); });
            panel.querySelector('.wsx-undo').addEventListener('click', undo);
            panel.querySelector('.wsx-addbox').addEventListener('click', function () {
                var box = { id: uid(), type: 'buttons', title: 'مجموعة جديدة', size: 'full', bsize: 'm', items: [] };
                tab.boxes.push(box); lastBox[tab.id] = box.id; save(); renderTab(tab);
            });
            byId('wsx-host').appendChild(panel);
            panels[tab.id] = panel;
        }
        panel.dataset.tab = tab.id;
        panel.querySelector('.panel-head-title').textContent = tab.name;
        var grid = panel.querySelector('.wsx-grid');

        // park every section currently in this grid; the ones still wanted come back below
        grid.querySelectorAll('.psec').forEach(function (s) { parkSection(s); });
        grid.innerHTML = '';
        grid.dataset.empty = 'التاب فاضي — اضغط «تخصيص» وأضف اللي تبيه';
        grid.classList.toggle('wsx-empty', tab.boxes.length === 0);

        tab.boxes.forEach(function (box) {
            var el = document.createElement('div');
            if (box.w === undefined) migrateWidth(box);
            el.className = 'wsx-box wsx-' + box.type + (box.w !== 12 && box.w !== 'fill' ? ' ws-half' : '');
            el.style.flex = widthCss(box.w);
            el.dataset.box = box.id;
            if (box.sec) el.dataset.sec = box.sec;
            el.appendChild(boxBar(tab, box));
            if (box.type === 'section') {
                var slot = document.createElement('div');
                slot.className = 'wsx-slot'; slot.dataset.sec = box.sec;
                if (box.z && box.z !== 1) slot.style.zoom = box.z;
                el.appendChild(slot);
            } else {
                if (box.title) {
                    var t = document.createElement('div');
                    t.className = 'tools-section-label wsx-title';
                    t.textContent = box.title;
                    el.appendChild(t);
                }
                var wrap = document.createElement('div');
                wrap.className = 'wsx-items bs-' + (box.bsize || 'm');
                if (box.bpx) wrap.style.setProperty('--bpx', box.bpx + 'px');
                wrap.dataset.empty = 'اسحب أزرار هنا';
                box.items.forEach(function (item, i) { wrap.appendChild(itemEl(tab, box, item, i)); });
                el.appendChild(wrap);
                el.addEventListener('mousedown', function () { lastBox[tab.id] = box.id; markTarget(panel); });
            }
            var rh = document.createElement('div'); rh.className = 'wsx-rh'; rh.title = 'اسحب لتغيير العرض — دبل كليك = يملأ السطر';
            var ch = document.createElement('div'); ch.className = 'wsx-ch'; ch.title = box.type === 'buttons' ? 'اسحب لتكبير / تصغير الأزرار' : 'اسحب لتكبير / تصغير القسم';
            rh.addEventListener('mousedown', function (e) { resizeStart(e, tab, box, el, 'w'); });
            rh.addEventListener('dblclick', function () { box.w = box.w === 'fill' ? 12 : 'fill'; save(); renderTab(tab); });
            ch.addEventListener('mousedown', function (e) { resizeStart(e, tab, box, el, 'z'); });
            ch.addEventListener('dblclick', function () { delete box.z; delete box.bpx; save(); renderTab(tab); refreshLive(); });
            el.appendChild(rh); el.appendChild(ch);
            grid.appendChild(el);
        });
        markTarget(panel);
        if (currentTab() === tab) mountSections(tab);
        if (editing && currentTab() === tab) renderPalette(tab);
    }

    // move the real sections into the slots of the tab on screen
    function mountSections(tab) {
        var panel = panels[tab.id]; if (!panel) return;
        panel.querySelectorAll('.wsx-slot').forEach(function (slot) {
            var sec = byId(slot.dataset.sec);
            if (sec && sec.parentNode !== slot) { sec.classList.remove('hidden'); slot.appendChild(sec); }
        });
    }

    function parkSection(s) { s.classList.remove('ws-block', 'ws-half', 'ws-full'); stash.appendChild(s); }

    function boxBar(tab, box) {
        var bar = document.createElement('div');
        bar.className = 'ws-bar';
        var isBtn = box.type === 'buttons';
        bar.innerHTML =
            '<span class="ws-handle" title="اسحب لتغيير المكان">⠿</span>' +
            (isBtn ? '<input type="text" class="wsx-name" placeholder="اسم المربع">' : '<span class="ws-name"></span>') +
            (isBtn ? '<button class="wsx-bs" title="حجم الأزرار"></button>' : '') +
            (isBtn ? '<button class="wsx-dup" title="نسخ المربع">⧉</button>'
                   : (sectionAsButtons(box.sec) ? '<button class="wsx-split" title="فكّه لأزرار تقدر تعدلها وحدة وحدة">⇢ أزرار</button>' : '')) +
            '<button class="ws-size" title="العرض — ضغطة تبدّل، أو اسحب الحافة اليمين">' + widthLabel(box.w) + '</button>' +
            '<button class="ws-x" title="حذف">✕</button>';
        if (isBtn) {
            var inp = bar.querySelector('.wsx-name');
            inp.value = box.title || '';
            inp.addEventListener('change', function () { box.title = inp.value.trim(); save(); renderTab(tab); });
            inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
            var bs = bar.querySelector('.wsx-bs');
            bs.textContent = { s: 'S', m: 'M', l: 'L' }[box.bsize || 'm'];
            bs.addEventListener('click', function () {
                box.bsize = { s: 'm', m: 'l', l: 's' }[box.bsize || 'm']; save(); renderTab(tab);
            });
        } else {
            bar.querySelector('.ws-name').textContent = SECTIONS[box.sec];
        }
        bar.querySelector('.ws-size').addEventListener('click', function () {
            var cycle = [12, 6, 4, 3, 'fill', 0], k = cycle.indexOf(box.w);
            box.w = cycle[(k + 1) % cycle.length]; save(); renderTab(tab); refreshLive();
        });
        var dup = bar.querySelector('.wsx-dup');
        if (dup) dup.addEventListener('click', function () {
            var c = copyBox(box); c.title = (box.title || '') + ' ٢';
            tab.boxes.splice(tab.boxes.indexOf(box) + 1, 0, c); save(); renderTab(tab);
        });
        var split = bar.querySelector('.wsx-split');
        if (split) split.addEventListener('click', function () {
            var nb = sectionAsButtons(box.sec); nb.id = uid(); nb.w = box.w;
            tab.boxes.splice(tab.boxes.indexOf(box), 1, nb); lastBox[tab.id] = nb.id;
            save(); renderTab(tab);
        });
        bar.querySelector('.ws-x').addEventListener('click', function () {
            tab.boxes.splice(tab.boxes.indexOf(box), 1); save(); renderTab(tab);
        });
        bar.querySelector('.ws-handle').addEventListener('mousedown', function (e) {
            dragStart(e, { type: 'box', el: bar.parentNode, tab: tab });
        });
        return bar;
    }

    function widthCss(w) {
        if (w === 0) return '0 0 auto';
        if (w === 'fill') return '1 1 0';
        w = Math.max(1, Math.min(12, w || 12));
        return '0 0 calc((100% - 88px) * ' + (w / 12) + ' + ' + ((w - 1) * 8) + 'px)';
    }
    function widthLabel(w) { return w === 0 ? 'Auto' : w === 'fill' ? '↔' : (w || 12) + '/12'; }

    // Resizing uses an invisible 12-column overlay + elementFromPoint, so it is exact even
    // with the panel's CSS zoom in AE's browser engine.
    function resizeStart(e, tab, box, el, kind) {
        if (e.button !== 0 || !editing) return;
        e.preventDefault(); e.stopPropagation();
        var grid = el.parentNode, sx = e.clientX, sy = e.clientY, val, overlay, startCol = 1;
        document.body.classList.add('ws-is-resizing');
        if (kind === 'w') {
            overlay = document.createElement('div'); overlay.className = 'wsx-cols';
            for (var c = 1; c <= 12; c++) { var d = document.createElement('div'); d.dataset.c = c; overlay.appendChild(d); }
            grid.appendChild(overlay);
            startCol = Math.max(1, Math.min(12, Math.round(el.offsetLeft / ((grid.clientWidth + 8) / 12)) + 1));
            val = box.w;
        } else val = box.type === 'buttons' ? (box.bpx || 32) : (box.z || 1);
        var span = Math.max(80, (el.offsetWidth || 200) + (el.offsetHeight || 100));
        var live = val, tip = document.createElement('div'); tip.className = 'wsx-tip'; el.appendChild(tip);
        function show() { tip.textContent = kind === 'w' ? widthLabel(live) : (box.type === 'buttons' ? Math.round(live) + 'px' : Math.round(live * 100) + '%'); }
        show();
        function move(ev) {
            ev.preventDefault();
            if (kind === 'w') {
                var hit = document.elementFromPoint(ev.clientX, ev.clientY);
                var col = hit && hit.dataset && hit.dataset.c ? parseInt(hit.dataset.c, 10) : 0;
                if (!col) return;
                live = Math.max(1, Math.min(12, col - startCol + 1));
                el.style.flex = widthCss(live);
            } else {
                var dlt = (ev.clientX - sx) + (ev.clientY - sy);
                if (box.type === 'buttons') {
                    live = Math.max(20, Math.min(72, val + dlt * 0.25));
                    var wrap = el.querySelector('.wsx-items'); if (wrap) wrap.style.setProperty('--bpx', Math.round(live) + 'px');
                } else {
                    live = Math.max(0.6, Math.min(1.6, val * (1 + dlt / span)));
                    var slot = el.querySelector('.wsx-slot'); if (slot) slot.style.zoom = live;
                }
            }
            show();
        }
        function up() {
            document.removeEventListener('mousemove', move, true);
            document.removeEventListener('mouseup', up, true);
            document.body.classList.remove('ws-is-resizing');
            if (overlay) overlay.remove();
            tip.remove();
            if (kind === 'w') box.w = live;
            else if (box.type === 'buttons') box.bpx = Math.round(live);
            else box.z = Math.round(live * 100) / 100;
            save(); renderTab(tab); refreshLive();
        }
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mouseup', up, true);
    }

    function itemEl(tab, box, item, i) {
        var el = document.createElement('button');
        el.className = 'wsx-item';
        renderItemFace(el, item);
        var x = document.createElement('span');
        x.className = 'wsx-ix'; x.textContent = '✕'; x.title = 'إزالة';
        el.appendChild(x);
        el.addEventListener('mousedown', function (e) {
            if (!editing || e.target === x) return;
            dragStart(e, { type: 'item', el: el, tab: tab });
        });
        el.addEventListener('click', function (e) {
            if (editing) {
                if (e.target === x) { box.items.splice(box.items.indexOf(item), 1); save(); renderTab(tab); }
                return;
            }
            runItem(item, e);
        });
        el.addEventListener('dblclick', function (e) {
            if (!editing || !box) return;
            e.preventDefault();
            var inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'wsx-rename'; inp.value = itemLabel(item);
            var done = false;
            function commit(ok) {
                if (done) return; done = true;
                if (ok) { var v = inp.value.trim(); if (v && v !== itemLabel(Object.assign({}, item, { name: '' }))) item.name = v; else delete item.name; save(); }
                renderTab(tab);
            }
            inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') commit(true); if (ev.key === 'Escape') commit(false); });
            inp.addEventListener('blur', function () { commit(true); });
            inp.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
            el.parentNode.replaceChild(inp, el);
            inp.focus(); inp.select();
        });
        el._item = item;
        return el;
    }

    function markTarget(panel) {
        var tab = findTab(panel.dataset.tab); if (!tab) return;
        var target = lastBox[tab.id];
        panel.querySelectorAll('.wsx-box').forEach(function (b) { b.classList.toggle('wsx-target', editing && b.dataset.box === target); });
    }

    // ── palette (edit mode) ──────────────────────────────────────────────────
    function renderPalette(tab) {
        var pal = panels[tab.id].querySelector('.wsx-palette');
        pal.innerHTML = '';
        var hint = document.createElement('div');
        hint.className = 'ws-pal-title';
        hint.textContent = 'اضغط أي شي لإضافته، أو اسحبه للمكان اللي تبيه.';
        pal.appendChild(hint);
        var search = document.createElement('input');
        search.type = 'text'; search.className = 'wsx-search'; search.placeholder = '🔍 ابحث… (جراف، ألوان، ملاحظات، ماسك…)'; search.dir = 'auto';
        search.value = lastSearch;
        search.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        search.addEventListener('input', function () { lastSearch = search.value; filterPalette(pal, search.value); });
        pal.appendChild(search);
        sectionCards(pal, tab);

        CLICK_GROUPS.forEach(function (g) {
            group(pal, g.name, g.items.map(function (it) {
                var item = { k: 'click', sel: it[0], label: it[1] };
                return { item: item, add: function (at) { addItem(tab, item, at); } };
            }));
        });
        group(pal, 'Layer Color', LABEL_NAMES.map(function (_, i) {
            var item = { k: 'label', idx: i };
            return { item: item, add: function (at) { addItem(tab, item, at); } };
        }));
        var gp = (typeof gcPresets !== 'undefined' && gcPresets.length) ? gcPresets : (typeof GC_DEFS !== 'undefined' ? GC_DEFS : []);
        group(pal, 'Ease Presets', gp.map(function (p) {
            var item = { k: 'ease', i: p.i, o: p.o };
            return { item: item, add: function (at) { addItem(tab, item, at); } };
        }));
        group(pal, 'Expressions', exprByWord(['']).map(function (item) {
            return { item: item, add: function (at) { addItem(tab, item, at); } };
        }));

        var reset = document.createElement('button');
        reset.className = 'ws-reset';
        reset.textContent = 'إفراغ هالتاب';
        reset.addEventListener('click', function () { tab.boxes = []; save(); renderTab(tab); });
        pal.appendChild(reset);
        if (lastSearch) filterPalette(pal, lastSearch);
    }

    var lastSearch = '';
    var GROUP_WORDS = {
        'Align': 'محاذاة', 'Anchor': 'انكر نقطة الارتكاز', 'Create': 'نل سوليد ادجستمنت', 'In / Out': 'قص بداية نهاية عكس',
        'Captions · Pre-comp': 'ترجمة بريكومب تنظيم', 'Graph': 'جراف ايز منحنى', 'Masks · Text': 'ماسك تفجير تقسيم نص كلمات اسطر احرف حروف',
        'Select': 'تحديد طبقات', 'Layer Color': 'لون الطبقة', 'Ease Presets': 'بريسيت جراف ايز', 'Expressions': 'اكسبريشن تعبير'
    };
    function filterPalette(pal, q) {
        q = String(q || '').trim().toLowerCase();
        pal.querySelectorAll('[data-find]').forEach(function (n) {
            n.style.display = !q || n.dataset.find.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
        pal.querySelectorAll('.wsx-group').forEach(function (g) {
            var any = Array.prototype.some.call(g.querySelectorAll('[data-find]'), function (n) { return n.style.display !== 'none'; });
            g.style.display = any ? '' : 'none';
            if (q && any) g.open = true;
        });
    }

    // whole sections are shown as cards with a live miniature of the real thing
    function sectionCards(pal, tab) {
        if (typeof buildAnchorGrid === 'function') buildAnchorGrid();
        if (typeof buildLabelGrid === 'function') buildLabelGrid();
        var d = document.createElement('details');
        d.className = 'wsx-group'; d.open = openGroups['cards'] !== false;
        d.addEventListener('toggle', function () { openGroups['cards'] = d.open; });
        d.innerHTML = '<summary>أقسام كاملة (' + SEC_ORDER.length + ')</summary><div class="wsx-cards"></div>';
        var wrap = d.querySelector('.wsx-cards');
        SEC_ORDER.forEach(function (sec) {
            var here = tab.boxes.some(function (b) { return b.sec === sec; });
            var card = document.createElement('div');
            card.className = 'wsx-card' + (here ? ' wsx-here' : '');
            card.dataset.find = SECTIONS[sec] + ' ' + (SEC_WORDS[sec] || '');
            var th = document.createElement('div'); th.className = 'wsx-thumb';
            var src = byId(sec);
            if (src) {
                var clone = src.cloneNode(true);
                clone.removeAttribute('id');
                clone.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
                clone.classList.remove('hidden');
                var srcC = src.querySelectorAll('canvas'), dstC = clone.querySelectorAll('canvas');
                Array.prototype.forEach.call(dstC, function (c, i) {
                    try { c.width = srcC[i].width; c.height = srcC[i].height; c.getContext('2d').drawImage(srcC[i], 0, 0); } catch (e) {}
                });
                var inner = document.createElement('div'); inner.className = 'wsx-thumb-in';
                inner.appendChild(clone); th.appendChild(inner);
            }
            var name = document.createElement('div'); name.className = 'wsx-card-name';
            name.textContent = SECTIONS[sec] + (here ? ' ✓' : '');
            card.appendChild(th); card.appendChild(name);
            var en = { label: SECTIONS[sec], add: function (at) { addSection(tab, sec, at); } };
            card.addEventListener('mousedown', function (e) { if (!here) chipDown(e, en); });
            wrap.appendChild(card);
        });
        pal.appendChild(d);
    }

    function group(pal, name, entries) {
        if (!entries.length) return;
        var d = document.createElement('details');
        d.className = 'wsx-group';
        d.innerHTML = '<summary></summary><div class="ws-chips"></div>';
        d.querySelector('summary').textContent = name + ' (' + entries.length + ')';
        d.open = !!openGroups[name];
        d.addEventListener('toggle', function () { openGroups[name] = d.open; });
        var chips = d.querySelector('.ws-chips');
        entries.forEach(function (en) {
            var c = document.createElement('button');
            c.className = 'ws-chip' + (en.here ? ' wsx-here' : '');
            if (en.item) { renderItemFace(c, en.item); c.insertBefore(plus(), c.firstChild); }
            else {
                c.appendChild(plus());
                c.appendChild(document.createTextNode(en.label));
                if (en.note) { var n = document.createElement('span'); n.className = 'ws-from'; n.textContent = en.note; c.appendChild(n); }
            }
            c.dataset.find = (en.item ? itemLabel(en.item) + ' ' + name : en.label + ' ' + name) + ' ' + (GROUP_WORDS[name] || '');
            c.addEventListener('mousedown', function (e) { chipDown(e, en); });
            chips.appendChild(c);
        });
        pal.appendChild(d);
    }
    function plus() { var p = document.createElement('span'); p.className = 'ws-plus'; p.textContent = '+'; return p; }

    function targetBox(tab) {
        var id = lastBox[tab.id], f = id && findBox(id);
        if (f && f.tab === tab && f.box.type === 'buttons') return f.box;
        for (var i = tab.boxes.length - 1; i >= 0; i--) if (tab.boxes[i].type === 'buttons') return tab.boxes[i];
        var box = { id: uid(), type: 'buttons', title: 'مجموعة جديدة', size: 'full', bsize: 'm', items: [] };
        tab.boxes.push(box);
        return box;
    }

    // at = optional { box: boxId, index } (drop position)
    function addItem(tab, item, at) {
        var box = at && at.box ? findBox(at.box).box : targetBox(tab);
        var copy = JSON.parse(JSON.stringify(item));
        if (at && at.index != null) box.items.splice(at.index, 0, copy); else box.items.push(copy);
        lastBox[tab.id] = box.id;
        save(); renderTab(tab);
    }
    function addSection(tab, sec, at) {
        if (tab.boxes.some(function (b) { return b.sec === sec; })) return; // already in this tab
        var box = { id: uid(), type: 'section', sec: sec, w: 12 };
        if (at && at.index != null) tab.boxes.splice(at.index, 0, box); else tab.boxes.push(box);
        save(); renderTab(tab); refreshLive();
    }

    // ── drag & drop (mouse events + elementFromPoint: immune to CSS zoom) ────
    var drag = null;

    function dragStart(e, d) {
        if (e.button !== 0 || !editing) return;
        e.preventDefault();
        d.sx = e.clientX; d.sy = e.clientY; d.live = false;
        drag = d;
        document.addEventListener('mousemove', dragMove, true);
        document.addEventListener('mouseup', dragEnd, true);
    }

    function chipDown(e, en) {
        if (e.button !== 0) return;
        e.preventDefault();
        var tab = currentTab(); if (!tab) return;
        drag = { type: 'chip', en: en, tab: tab, sx: e.clientX, sy: e.clientY, live: false };
        document.addEventListener('mousemove', dragMove, true);
        document.addEventListener('mouseup', dragEnd, true);
    }

    function dragMove(e) {
        if (!drag) return;
        if (!drag.live) {
            if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 5) return;
            drag.live = true;
            if (drag.type === 'chip') {
                // turn the chip into a real element in the tab, then drag that
                var panel = panels[drag.tab.id];
                if (drag.en.item) {
                    drag.el = itemEl(drag.tab, null, drag.en.item, 0);
                    drag.el._new = drag.en;
                    var box = targetBox(drag.tab); renderTab(drag.tab);
                    panel.querySelector('.wsx-box[data-box="' + box.id + '"] .wsx-items').appendChild(drag.el);
                } else {
                    drag.el = document.createElement('div');
                    drag.el.className = 'wsx-box ws-full wsx-ghostbox';
                    drag.el.textContent = drag.en.label;
                    drag.el._new = drag.en;
                    panel.querySelector('.wsx-grid').appendChild(drag.el);
                }
                drag.kind = drag.en.item ? 'item' : 'box';
            } else drag.kind = drag.type;
            drag.el.classList.add('wsx-dragging');
            document.body.classList.add('ws-is-dragging');
        }
        e.preventDefault();
        autoScroll(e.clientY);

        var hit = document.elementFromPoint(e.clientX, e.clientY);
        if (!hit || drag.el.contains(hit)) return;
        var panel = panels[drag.tab.id];
        if (!panel.contains(hit)) return;

        // After a swap the neighbour slides under the pointer; swapping with it again would
        // make the two boxes jump back and forth. So a neighbour we just swapped with is
        // ignored until the pointer has left it.
        var target = drag.kind === 'box' ? hit.closest('.wsx-box') : hit.closest('.wsx-item');
        if (drag.lock) { if (target === drag.lock) return; drag.lock = null; }
        if (drag.kind === 'box') {
            var grid = panel.querySelector('.wsx-grid');
            var tb = target;
            if (tb && tb.parentNode === grid && tb !== drag.el) { placeBefore(grid, drag.el, tb); drag.lock = tb; }
            else if (!tb && grid.contains(hit) && grid.lastElementChild !== drag.el) grid.appendChild(drag.el);
        } else {
            var ti = target;
            var wrap = hit.closest('.wsx-items') || (hit.closest('.wsx-buttons') && hit.closest('.wsx-buttons').querySelector('.wsx-items'));
            if (ti && ti !== drag.el && ti.parentNode.classList.contains('wsx-items')) { placeBefore(ti.parentNode, drag.el, ti); drag.lock = ti; }
            else if (wrap && !ti && wrap.lastElementChild !== drag.el) wrap.appendChild(drag.el);
        }
    }

    // move `el` next to `target`: after it when coming from before, before it otherwise
    function placeBefore(parent, el, target) {
        if (el.parentNode === parent) {
            var kids = Array.prototype.slice.call(parent.children);
            if (kids.indexOf(el) < kids.indexOf(target)) { parent.insertBefore(el, target.nextSibling); return; }
        }
        parent.insertBefore(el, target);
    }

    function autoScroll(y) {
        var area = document.querySelector('.content-area'); if (!area) return;
        var h = window.innerHeight;
        if (y < 110) area.scrollTop -= 10;
        else if (y > h - 50) area.scrollTop += 10;
    }

    function dragEnd() {
        document.removeEventListener('mousemove', dragMove, true);
        document.removeEventListener('mouseup', dragEnd, true);
        var d = drag; drag = null;
        document.body.classList.remove('ws-is-dragging');
        if (!d) return;
        if (!d.live) { // a click
            if (d.type === 'chip') d.en.add();
            return;
        }
        var tab = d.tab, panel = panels[tab.id];
        if (d.el) d.el.classList.remove('wsx-dragging');

        if (d.kind === 'box') {
            var order = Array.prototype.slice.call(panel.querySelectorAll('.wsx-grid > .wsx-box'));
            var at = order.indexOf(d.el);
            if (d.el._new) { d.el.remove(); return d.el._new.add({ index: at }); }
            var byBox = {};
            tab.boxes.forEach(function (b) { byBox[b.id] = b; });
            tab.boxes = order.map(function (el) { return byBox[el.dataset.box]; }).filter(Boolean);
        } else {
            var wrap = d.el.parentNode, boxEl = wrap && wrap.closest('.wsx-box');
            var dest = boxEl && findBox(boxEl.dataset.box);
            if (!dest || dest.box.type !== 'buttons') { renderTab(tab); return; }
            var index = Array.prototype.indexOf.call(wrap.children, d.el);
            if (d.el._new) { d.el.remove(); return d.el._new.add({ box: dest.box.id, index: index }); }
            // remove the dragged item from its old box, then insert at the drop spot
            tab.boxes.forEach(function (b) {
                if (b.items) { var k = b.items.indexOf(d.el._item); if (k >= 0) b.items.splice(k, 1); }
            });
            dest.box.items.splice(index, 0, d.el._item);
            lastBox[tab.id] = dest.box.id;
        }
        save(); renderTab(tab); refreshLive();
    }

    // ── edit mode ────────────────────────────────────────────────────────────
    function setEditing(on) {
        editing = on;
        var tab = currentTab();
        Object.keys(panels).forEach(function (id) {
            var p = panels[id], here = tab && tab.id === id;
            p.classList.toggle('ws-editing', on && here);
            p.querySelector('.wsx-palette').classList.toggle('hidden', !(on && here));
            p.querySelector('.wsx-addbox').classList.toggle('hidden', !(on && here));
            p.querySelector('.wsx-undo').classList.toggle('hidden', !(on && here));
            var b = p.querySelector('.ws-edit-btn');
            b.classList.toggle('on', on && here);
            b.querySelector('span').textContent = on && here ? 'تم' : 'تخصيص';
            markTarget(p);
        });
        if (on && tab) renderPalette(tab);
        updateUndo();
    }

    // ── ⚙ tab manager ───────────────────────────────────────────────────────
    function openManager() {
        closeManager();
        var ov = document.createElement('div');
        ov.className = 'modal-overlay wsx-mgr-ov';
        ov.innerHTML = '<div class="modal-box wsx-mgr" dir="rtl">' +
            '<div class="client-modal-title">التابات</div>' +
            '<div class="wsx-mgr-list"></div>' +
            '<div class="wsx-mgr-sub">تاب جديد من قالب جاهز:</div>' +
            '<div class="wsx-tpls"></div>' +
            '<button class="ws-reset wsx-reset-all">إرجاع كل التابات للوضع الافتراضي</button>' +
            '<div class="modal-actions"><button class="primary-btn modal-btn wsx-mgr-done">تم</button></div></div>';
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeManager(); });
        ov.querySelector('.wsx-mgr-done').addEventListener('click', closeManager);
        var ra = ov.querySelector('.wsx-reset-all');
        ra.addEventListener('click', function () {
            if (!ra.classList.contains('confirm')) { ra.classList.add('confirm'); ra.textContent = 'متأكد؟ بيمسح كل تخصيصاتك — اضغط مرة ثانية'; return; }
            resetAll();
        });

        var list = ov.querySelector('.wsx-mgr-list');
        var trow = document.createElement('div');
        trow.className = 'wsx-mgr-row wsx-mgr-fixed' + (model.hideTemplates ? ' off' : '');
        trow.innerHTML = '<span class="wsx-mgr-fixedname">Templates</span><button class="wsx-eye" title="إظهار / إخفاء"></button>';
        trow.querySelector('button').textContent = model.hideTemplates ? '🚫' : '👁';
        trow.querySelector('button').addEventListener('click', function () { setHidden('templates', !model.hideTemplates); });
        list.appendChild(trow);
        model.tabs.forEach(function (t, i) {
            var row = document.createElement('div');
            row.className = 'wsx-mgr-row';
            row.innerHTML = '<input type="text" class="wsx-mgr-name"><button title="لفوق">▲</button><button title="لتحت">▼</button>' +
                '<button title="تخصيص">✎</button><button class="wsx-del" title="حذف">🗑</button>' +
                '<button class="wsx-eye" title="إظهار / إخفاء"></button><button title="نسخ التاب">⧉</button>';
            var b = row.querySelectorAll('button'), inp = row.querySelector('input');
            row.classList.toggle('off', !!t.hidden);
            b[4].textContent = t.hidden ? '🚫' : '👁';
            b[4].addEventListener('click', function () { setHidden(t, !t.hidden); });
            b[5].addEventListener('click', function () { duplicateTab(t); });
            inp.value = t.name;
            inp.addEventListener('change', function () { t.name = inp.value.trim() || t.name; save(); renderTabBar(); renderTab(t); });
            b[0].disabled = i === 0;
            b[1].disabled = i === model.tabs.length - 1;
            b[0].addEventListener('click', function () { move(i, -1); });
            b[1].addEventListener('click', function () { move(i, 1); });
            b[2].addEventListener('click', function () { closeManager(); openTab(t.id); setEditing(true); });
            b[3].addEventListener('click', function () {
                if (row.classList.contains('confirm')) { removeTab(t); openManager(); return; }
                row.classList.add('confirm'); b[3].textContent = 'متأكد؟';
            });
            list.appendChild(row);
        });

        var tpls = ov.querySelector('.wsx-tpls');
        TEMPLATES.forEach(function (tp) {
            var c = document.createElement('button');
            c.className = 'wsx-tpl';
            c.innerHTML = '<b></b><span></span>';
            c.querySelector('b').textContent = tp.name;
            c.querySelector('span').textContent = tp.desc;
            c.addEventListener('click', function () { addTab(tp); });
            tpls.appendChild(c);
        });
        document.querySelector('.screen').appendChild(ov);
    }
    function visibleCount() {
        return model.tabs.filter(function (t) { return !t.hidden; }).length + (model.hideTemplates ? 0 : 1);
    }
    function setHidden(t, hide) {
        if (hide && visibleCount() <= 1) return; // keep at least one tab on screen
        if (t === 'templates') model.hideTemplates = hide; else t.hidden = hide;
        save(); renderTabBar();
        var gone = t === 'templates' ? activeTab === 'templates' : activeTab === 'ct_' + t.id;
        if (hide && gone) { var first = tabBar.querySelector('.tab-btn:not(.hidden)'); if (first) first.click(); }
        openManager();
    }
    function duplicateTab(t) {
        var boxes = [];
        t.boxes.forEach(function (b) {
            boxes.push(copyBox(b));
        });
        var c = withIds({ id: uid(), name: t.name + ' ٢', boxes: boxes });
        model.tabs.splice(model.tabs.indexOf(t) + 1, 0, c);
        save(); renderTabBar(); renderTab(c); openManager();
    }
    function resetAll() {
        model.tabs.forEach(function (t) { t.boxes = []; if (panels[t.id]) { renderTab(t); panels[t.id].remove(); delete panels[t.id]; } });
        try { localStorage.removeItem(OLD_KEY); } catch (e) {}
        model = { tabs: defaultTabs() };
        save(); renderTabBar(); model.tabs.forEach(renderTab);
        closeManager(); openTab(model.tabs[0].id);
    }
    function closeManager() { var o = document.querySelector('.wsx-mgr-ov'); if (o) o.remove(); }
    function move(i, d) {
        var t = model.tabs.splice(i, 1)[0];
        model.tabs.splice(i + d, 0, t);
        save(); renderTabBar(); openManager();
    }
    function removeTab(t) {
        model.tabs.splice(model.tabs.indexOf(t), 1);
        t.boxes = [];
        if (panels[t.id]) { renderTab(t); panels[t.id].remove(); delete panels[t.id]; }
        save(); renderTabBar();
        if (activeTab === 'ct_' + t.id) {
            var first = tabBar.querySelector('.tab-btn'); if (first) first.click();
        }
    }
    function addTab(tp) {
        var skipped = {};
        var boxes = tp.build().filter(function (b) {
            // sections already living in another tab stay where they are
            return true;
        });
        if (skipped['sec-graph-main'] || skipped['sec-graph-presets']) {
            // the graph lives elsewhere → give this tab one-click ease buttons instead
            var gp = (typeof gcPresets !== 'undefined' && gcPresets.length) ? gcPresets : (typeof GC_DEFS !== 'undefined' ? GC_DEFS : []);
            boxes.unshift({ type: 'buttons', title: 'Ease', size: 'full', bsize: 'm',
                items: btns(['#gc-apply']).concat(gp.map(function (p) { return { k: 'ease', i: p.i, o: p.o }; })) });
        }
        var t = withIds({ id: uid(), name: tp.id === 'empty' ? 'تاب جديد' : tp.name, boxes: boxes });
        model.tabs.push(t);
        save(); renderTabBar(); renderTab(t);
        closeManager(); openTab(t.id);
        if (tp.id === 'empty') setEditing(true);
    }

    // ── first-run tips (and the «?» button) ─────────────────────────────────
    var TIPS = [
        ['✎', 'خصّص أي تاب', 'اضغط «تخصيص»، اسحب الأدوات من القائمة للمكان اللي تبيه، وكبّر أي مربع أو صغّره من حافته أو زاويته. غلطت؟ «↶ تراجع».'],
        ['⊞', 'تابات خاصة فيك', 'من الزر فوق (⊞) تسوي تاب جديد من قالب جاهز، تسميه، ترتبه، تخفيه أو تنسخه.'],
        ['⇧', 'Shift يسوي أكثر', 'Shift + Adjust أو Solid = بنفس مدة الطبقة · Shift + كلمات = أسطر · Shift + مقبض الجراف = In و Out مع بعض · Shift + لون = Stroke.'],
        ['📝', 'الملاحظات', 'اكتب / للقائمة، الصق صور بـ Cmd+V، وحدّد كلام واضغط «📍» عشان يرجعك لمكانك في المشروع. وتنحفظ داخل ملف المشروع.'],
        ['⟳', 'التحديثات', 'تجيك تلقائياً. لما يطلع «تحديث جاهز» تحت، اضغط «تطبيق الآن».']
    ];
    function showTips() {
        var o = document.querySelector('.wsx-tips-ov'); if (o) o.remove();
        var i = 0, ov = document.createElement('div');
        ov.className = 'modal-overlay wsx-tips-ov';
        ov.innerHTML = '<div class="modal-box wsx-tips" dir="rtl"><div class="wsx-tip-ico"></div><div class="wsx-tip-t"></div><div class="wsx-tip-d"></div>' +
            '<div class="wsx-tip-dots"></div><div class="modal-actions"><button class="secondary-btn modal-btn wsx-tip-skip">تخطي</button><button class="primary-btn modal-btn wsx-tip-next"></button></div></div>';
        function show() {
            var t = TIPS[i];
            ov.querySelector('.wsx-tip-ico').textContent = t[0];
            ov.querySelector('.wsx-tip-t').textContent = t[1];
            ov.querySelector('.wsx-tip-d').textContent = t[2];
            ov.querySelector('.wsx-tip-dots').innerHTML = TIPS.map(function (_, k) { return '<span class="' + (k === i ? 'on' : '') + '"></span>'; }).join('');
            ov.querySelector('.wsx-tip-next').textContent = i === TIPS.length - 1 ? 'يلا نبدأ' : 'التالي';
        }
        function done() { ov.remove(); model.tipsSeen = true; persist(JSON.stringify(model)); }
        ov.querySelector('.wsx-tip-next').addEventListener('click', function () { if (i < TIPS.length - 1) { i++; show(); } else done(); });
        ov.querySelector('.wsx-tip-skip').addEventListener('click', done);
        show();
        document.querySelector('.screen').appendChild(ov);
    }
    window.FWP_SHOW_TIPS = showTips;

    // ── live bits that need a nudge after moving ─────────────────────────────
    function refreshLive() {
        var tab = currentTab(); if (!tab) return;
        if (typeof buildAnchorGrid === 'function') buildAnchorGrid();
        if (typeof buildLabelGrid === 'function') buildLabelGrid();
        var hasGraph = tab.boxes.some(function (b) { return b.sec === 'sec-graph-main' || b.sec === 'sec-graph-presets'; });
        if (hasGraph && typeof gcInit === 'function') setTimeout(gcInit, 0);
    }

    // ── setup ────────────────────────────────────────────────────────────────
    function build() {
        tabBar = document.querySelector('.tab-bar');
        if (!tabBar || !byId('tools-list')) return;

        // the original Tools / Graph / Expr panels become a hidden source of sections
        stash = document.createElement('div');
        stash.className = 'hidden'; stash.id = 'wsx-stash';
        document.querySelector('.content-area').appendChild(stash);
        ['tools-list', 'graph-list', 'expr-list'].forEach(function (id) { byId(id).classList.add('wsx-src'); });
        // status lines travel with their section
        if (byId('gc-status') && byId('sec-graph-main')) byId('sec-graph-main').appendChild(byId('gc-status'));
        if (byId('expr-status') && byId('sec-expr-add')) byId('sec-expr-add').appendChild(byId('expr-status'));
        SEC_ORDER.forEach(function (id) { var s = byId(id); if (s) parkSection(s); });

        var host = document.createElement('div');
        host.id = 'wsx-host';
        document.querySelector('.content-area').appendChild(host);

        tabBar.querySelectorAll('.tab-btn:not([data-tab="templates"])').forEach(function (b) { b.remove(); });
        tabBar.classList.add('wsx-tabbar');

        // ⚙ in the top bar opens the tab manager
        var gear = document.createElement('button');
        gear.className = 'icon-btn wsx-gear';
        gear.title = 'التابات وترتيب الواجهة';
        gear.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/></svg>';
        gear.addEventListener('click', openManager);
        document.querySelector('.top-bar').appendChild(gear);
        var help = document.createElement('button');
        help.className = 'icon-btn wsx-help'; help.title = 'شرح سريع'; help.textContent = '?';
        help.addEventListener('click', showTips);
        document.querySelector('.top-bar').appendChild(help);

        model = load();
        save();
        // show the tips once, after the activation screen is out of the way
        if (!model.tipsSeen) setTimeout(function waitGate() {
            var g = document.getElementById('license-gate');
            if (g && g.classList.contains('show')) return setTimeout(waitGate, 1500);
            showTips();
        }, 2500);
        renderTabBar();
        model.tabs.forEach(renderTab);
    }

    window.addEventListener('DOMContentLoaded', function () {
        if (window.__FWP_REDIRECT) return;
        build();
        if (!model) return;

        // sections in custom tabs ignore the old per-tab "hide section" gear
        if (typeof applyVis === 'function') {
            var baseApplyVis = applyVis;
            applyVis = function () {
                baseApplyVis.apply(this, arguments);
                document.querySelectorAll('#wsx-host .psec').forEach(function (s) { s.classList.remove('hidden'); });
            };
        }
        // gcResize retries every 60ms while the canvas has no width; skip it while hidden
        if (typeof gcResize === 'function') {
            var baseResize = gcResize;
            gcResize = function () {
                var c = byId('gc-canvas');
                if (c && c.offsetParent === null) return;
                return baseResize.apply(this, arguments);
            };
        }
        if (typeof switchTab === 'function') {
            var baseSwitch = switchTab;
            switchTab = function () {
                baseSwitch.apply(this, arguments);
                var tab = currentTab();
                Object.keys(panels).forEach(function (id) { panels[id].classList.toggle('hidden', !tab || tab.id !== id); });
                if (tab) mountSections(tab);
                if (editing) setEditing(false);
                refreshLive();
            };
        }
        window.addEventListener('resize', function () {
            if (currentTab() && typeof gcResize === 'function') gcResize();
        });
        document.addEventListener('keydown', function (e) {
            if (!editing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
            var a = document.activeElement;
            if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
            e.preventDefault(); undo();
        });
    });

    window.FWP_WORKSPACE = { openManager: openManager, get model() { return model; } };
})();
