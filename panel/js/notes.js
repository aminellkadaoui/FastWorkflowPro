/* fast workflow pro - Notes (Notion-style block editor)
   • Type "/" for the block menu: headings, lists, to-do, quote, code, divider, image,
     timestamp, today's log entry, and a 📍 bookmark that jumps back to a comp + time.
   • Markdown shortcuts: "# ", "## ", "### ", "- ", "1. ", "[] ", "> ", "```".
   • Paste (Cmd+V) or drop images; several at once become a grid.
   • Arabic and English mix freely: every block picks its own direction (dir=auto).
   • Two scopes: notes of the open project (keyed by its .aep path) and general notes.
     Saved as JSON (+ image files) in the user's data folder. */
(function () {
    var nd = null;
    try { if (typeof require === 'function') nd = { fs: require('fs'), path: require('path'), os: require('os'), crypto: require('crypto') }; } catch (e) {}

    var root = null, projectPath = '', scope = 'project', book = null, note = null, saveTimer = null;
    var host, listSel, editor, menu, scopeBtns, selBar;
    function syncBlock() { var a = document.activeElement; if (a && a.classList.contains('nb-text')) { var b = blockOf(a.closest('.nb-block')); if (b) { b.html = a.innerHTML; save(); } } }

    function byId(id) { return document.getElementById(id); }
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function say(m, t) { if (typeof toast === 'function') toast(m, t); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── storage ─────────────────────────────────────────────────────────────
    function dataRoot() {
        if (root) return root;
        if (!nd) return null;
        var base = window.FWP_UPDATE_ROOT || nd.path.join(nd.os.homedir(), process.platform === 'win32' ? 'AppData/Roaming' : 'Library/Application Support', 'fastworkflowpro');
        root = nd.path.join(base, 'notes');
        mkdirp(nd.path.join(root, 'img'));
        return root;
    }
    function mkdirp(d) { if (nd.fs.existsSync(d)) return; mkdirp(nd.path.dirname(d)); nd.fs.mkdirSync(d); }
    function bookKey() {
        if (scope === 'general') return 'general';
        if (!projectPath) return 'unsaved';
        return 'p_' + (nd ? nd.crypto.createHash('md5').update(projectPath.toLowerCase()).digest('hex').slice(0, 16) : projectPath.replace(/\W+/g, '_'));
    }
    function loadBook() {
        var key = bookKey(), data = null;
        try {
            if (nd) { var f = nd.path.join(dataRoot(), key + '.json'); if (nd.fs.existsSync(f)) data = JSON.parse(nd.fs.readFileSync(f, 'utf8')); }
            else data = JSON.parse(localStorage.getItem('fwp_notes_' + key));
        } catch (e) {}
        book = data && data.notes ? data : { project: projectPath, notes: [] };
        if (!book.notes.length) book.notes.push(newNote());
        note = book.notes[0];
    }
    // project notes are also written into the .aep itself (XMP), a moment after you stop typing
    var xmpTimer = null;
    function saveToProject() {
        if (scope !== 'project' || !window.FWP_JSX || !book) return;
        clearTimeout(xmpTimer);
        xmpTimer = setTimeout(function () {
            window.FWP_JSX('fwp_notesWrite("' + encodeURIComponent(JSON.stringify(book)) + '")', function () {});
        }, 1500);
    }
    function loadFromProject(done) {
        if (scope !== 'project' || !window.FWP_JSX) return done && done();
        window.FWP_JSX('fwp_notesRead()', function (r) {
            r = String(r || '');
            if (r && r.indexOf('EZW_ERROR') !== 0) {
                try {
                    var b = JSON.parse(decodeURIComponent(r));
                    // the copy inside the project wins unless this machine has newer edits
                    if (b && b.notes && b.notes.length && (!book || !book.saved || (b.saved || 0) >= book.saved)) { book = b; note = book.notes[0]; }
                } catch (e) {}
            }
            done && done();
        });
    }

    function saveNow() {
        if (!book) return;
        book.project = projectPath;
        book.saved = Date.now();
        note.updated = Date.now();
        saveToProject();
        var json = JSON.stringify(book);
        try {
            if (nd) nd.fs.writeFileSync(nd.path.join(dataRoot(), bookKey() + '.json'), json);
            else localStorage.setItem('fwp_notes_' + bookKey(), json);
        } catch (e) { say('ما قدرت أحفظ الملاحظة', 'error'); }
    }
    function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }
    function newNote() {
        return { id: uid(), title: 'ملاحظة ' + new Date().toLocaleDateString('ar', { day: 'numeric', month: 'long' }), created: Date.now(), updated: Date.now(),
            blocks: [{ id: uid(), t: 'p', html: '' }] };
    }
    function saveImage(dataUrl) {
        if (!nd) return dataUrl;
        var m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl); if (!m) return dataUrl;
        var f = nd.path.join(dataRoot(), 'img', uid() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
        nd.fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
        return f;
    }
    function imgUrl(src) {
        if (/^data:/.test(src)) return src;
        return window.FWP_FILE_URL ? window.FWP_FILE_URL(src) : 'file://' + encodeURI(src.replace(/\\/g, '/'));
    }

    // ── slash menu ──────────────────────────────────────────────────────────
    var ITEMS = [
        { t: 'p', ico: '¶', name: 'نص', en: 'text paragraph' },
        { t: 'h1', ico: 'H1', name: 'عنوان كبير', en: 'heading 1 title' },
        { t: 'h2', ico: 'H2', name: 'عنوان متوسط', en: 'heading 2' },
        { t: 'h3', ico: 'H3', name: 'عنوان صغير', en: 'heading 3' },
        { t: 'ul', ico: '•', name: 'قائمة نقاط', en: 'bullet list' },
        { t: 'ol', ico: '1.', name: 'قائمة أرقام', en: 'numbered list' },
        { t: 'todo', ico: '☐', name: 'مهام', en: 'todo task checkbox' },
        { t: 'quote', ico: '❝', name: 'اقتباس', en: 'quote' },
        { t: 'code', ico: '</>', name: 'كود', en: 'code expression' },
        { t: 'hr', ico: '—', name: 'خط فاصل', en: 'divider line' },
        { t: 'img', ico: '🖼', name: 'صورة', en: 'image picture' },
        { t: 'time', ico: '🕒', name: 'الوقت الحين', en: 'time timestamp now' },
        { t: 'log', ico: '📅', name: 'سجل اليوم', en: 'log today date entry' },
        { t: 'mark', ico: '📍', name: 'مكاني في المشروع', en: 'bookmark comp location marker' }
    ];
    var menuState = null;

    function openMenu(blockEl, query) {
        var hits = ITEMS.filter(function (it) { var s = (it.name + ' ' + it.en + ' ' + it.t).toLowerCase(); return !query || s.indexOf(query.toLowerCase()) >= 0; });
        if (!hits.length) return closeMenu();
        menuState = menuState && menuState.block === blockEl ? menuState : { block: blockEl, i: 0 };
        menuState.hits = hits; menuState.i = Math.min(menuState.i, hits.length - 1);
        menu.innerHTML = '';
        hits.forEach(function (it, i) {
            var r = el('div', 'nb-mi' + (i === menuState.i ? ' on' : ''), '<span class="nb-mico">' + esc(it.ico) + '</span><span>' + esc(it.name) + '</span>');
            r.addEventListener('mousedown', function (e) { e.preventDefault(); pick(it); });
            menu.appendChild(r);
        });
        menu.classList.remove('hidden');
        // under the block, inside the notes panel
        var top = blockEl.offsetTop + blockEl.offsetHeight + 2;
        menu.style.top = top + 'px';
        var on = menu.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function closeMenu() { menuState = null; if (menu) menu.classList.add('hidden'); }
    function pick(it) {
        var bEl = menuState.block, b = blockOf(bEl);
        // drop the "/query" the user typed
        b.html = String(textEl(bEl).innerHTML).replace(/\/[^\/\s<]*$/, '').replace(/<br>$/, '');
        closeMenu();
        transform(b, it.t);
    }

    // ── blocks ──────────────────────────────────────────────────────────────
    function idx(b) { return note.blocks.indexOf(b); }
    function blockOf(bEl) { var id = bEl.dataset.id; for (var i = 0; i < note.blocks.length; i++) if (note.blocks[i].id === id) return note.blocks[i]; return null; }
    function textEl(bEl) { return bEl.querySelector('.nb-text'); }
    function insertAfter(b, nb) { note.blocks.splice(idx(b) + 1, 0, nb); return nb; }

    function transform(b, t) {
        if (t === 'hr') {
            var line = b;
            if (!b.html && b.t === 'p') b.t = 'hr'; else line = insertAfter(b, { id: uid(), t: 'hr' });
            focusNew(insertAfter(line, { id: uid(), t: 'p', html: '' }));
            save(); return render();
        }
        if (t === 'img') return pickImages(b);
        if (t === 'time') { b.html = (b.html ? b.html + ' ' : '') + '<span class="nb-time" contenteditable="false">🕒 ' + esc(nowText()) + '</span>&nbsp;'; save(); render(); return focusEnd(b); }
        if (t === 'log') {
            // never overwrite a line that already has something in it
            if (b.html || b.t !== 'p') b = insertAfter(b, { id: uid(), t: 'p', html: '' });
            b.t = 'h3'; b.html = '📅 ' + esc(dateText()); b.ts = Date.now();
            focusNew(insertAfter(b, { id: uid(), t: 'p', html: '<span class="nb-time" contenteditable="false">🕒 ' + esc(timeText()) + '</span>&nbsp;' }));
            save(); return render();
        }
        if (t === 'mark') {
            var info = selInText();
            if (!info) {
                focusEnd(b);
                info = selInText();
            }
            if (info) return linkHere({ r: info.r.cloneRange(), t: info.t });
            return addBookmark(b);
        }
        b.t = t;
        if (t === 'todo') b.done = false;
        save(); render(); focusEnd(b);
    }

    function nowText() { return dateText() + ' — ' + timeText(); }
    function dateText() { return new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    function timeText() { return new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
    function tc(t, fps) {
        fps = fps || 30; var f = Math.round(t * fps), fr = Math.round(fps);
        var hh = Math.floor(f / (3600 * fr)), mm = Math.floor(f / (60 * fr)) % 60, ss = Math.floor(f / fr) % 60, ff = f % fr;
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(hh) + ':' + p(mm) + ':' + p(ss) + ':' + p(ff);
    }

    function addBookmark(b) {
        if (!window.FWP_JSX) return say('After Effects غير متصل', 'error');
        window.FWP_JSX('fwp_bookmark()', function (r) {
            r = String(r || '');
            if (r.indexOf('EZW_ERROR') === 0) return say(r.replace('EZW_ERROR: ', ''), 'error');
            var m; try { m = JSON.parse(r); } catch (e) { return; }
            var nb = { id: uid(), t: 'mark', mark: m, html: '' };
            if (!b.html && b.t === 'p') { note.blocks.splice(idx(b), 1, nb); } else insertAfter(b, nb);
            focusNew(insertAfter(nb, { id: uid(), t: 'p', html: '' }));
            save(); render();
        });
    }

    function pickImages(b) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.addEventListener('change', function () { readFiles(inp.files, b); });
        inp.click();
    }
    function readFiles(files, b) {
        var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
        if (!list.length) return false;
        var srcs = [], left = list.length;
        list.forEach(function (f, i) {
            var r = new FileReader();
            r.onload = function () {
                srcs[i] = saveImage(r.result);
                if (--left === 0) {
                    var nb = { id: uid(), t: 'img', src: srcs };
                    if (b && !b.html && b.t === 'p') note.blocks.splice(idx(b), 1, nb); else insertAfter(b || note.blocks[note.blocks.length - 1], nb);
                    focusNew(insertAfter(nb, { id: uid(), t: 'p', html: '' }));
                    save(); render();
                }
            };
            r.readAsDataURL(f);
        });
        return true;
    }

    function imgResize(e, b, g) {
        e.preventDefault(); e.stopPropagation();
        var sx = e.clientX, start = b.wp || 100, full = editor.getBoundingClientRect().width || 300;
        var rtl = g.parentNode.dir === 'rtl';
        function move(ev) {
            var dx = (ev.clientX - sx) * (rtl ? -1 : 1);
            b.wp = Math.round(Math.max(15, Math.min(100, start + dx / full * 100)));
            g.style.width = b.wp + '%';
        }
        function up() { document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); save(); }
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mouseup', up, true);
    }

    // ── inline links: 📍 comp + time, or a web address ──────────────────────
    var savedRange = null;
    function selInText() {
        var s = window.getSelection(); if (!s.rangeCount) return null;
        var r = s.getRangeAt(0), n = r.commonAncestorContainer;
        n = n.nodeType === 1 ? n : n.parentNode;
        var t = n && n.closest ? n.closest('.nb-text') : null;
        return t && editor.contains(t) ? { r: r, t: t } : null;
    }
    function linkHTML(a, label) {
        // label + "(timecode)" for comp links
        a.textContent = '';
        a.appendChild(document.createTextNode(label));
        if (a.dataset.comp) {
            var tcEl = el('span', 'nb-tc'); tcEl.contentEditable = 'false'; tcEl.dir = 'ltr';
            tcEl.textContent = ' (' + tc(parseFloat(a.dataset.time), parseFloat(a.dataset.fps)) + ')';
            a.appendChild(tcEl);
        }
    }
    function wrapLink(info, attrs, fallbackLabel) {
        var r = info.r;
        var a = document.createElement('a');
        a.className = 'nb-link' + (attrs.url ? ' web' : '');
        if (attrs.url) a.dataset.url = attrs.url;
        else { a.dataset.comp = attrs.id; a.dataset.name = attrs.name; a.dataset.time = attrs.time; a.dataset.fps = attrs.fps; }
        var label = r.collapsed ? fallbackLabel : r.toString();
        if (!r.collapsed) r.deleteContents();
        linkHTML(a, label);
        r.insertNode(a);
        // caret after the link, with a space so typing continues outside it
        var nx = a.nextSibling, sp;
        if (nx && nx.nodeType === 3 && /^[\s\u00a0]/.test(nx.nodeValue)) sp = nx;   // a space is already there
        else { sp = document.createTextNode('\u00a0'); a.parentNode.insertBefore(sp, a.nextSibling); }
        var s = window.getSelection(), nr = document.createRange();
        if (sp === nx) nr.setStart(sp, 1); else nr.setStartAfter(sp);
        nr.collapse(true); s.removeAllRanges(); s.addRange(nr);
        var b = blockOf(info.t.closest('.nb-block')); b.html = info.t.innerHTML; save();
    }
    // 📍: selected words become a link to the current comp + time; nothing selected → "📍 Comp" at the caret
    function linkHere(info) {
        if (!window.FWP_JSX) return say('After Effects غير متصل', 'error');
        window.FWP_JSX('fwp_bookmark()', function (r) {
            r = String(r || '');
            if (r.indexOf('EZW_ERROR') === 0) return say(r.replace('EZW_ERROR: ', ''), 'error');
            var m; try { m = JSON.parse(r); } catch (e) { return; }
            if (info.t.isConnected === false) return;
            info.t.focus();
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(info.r);
            wrapLink(info, m, '📍 ' + m.name);
        });
    }
    function gotoLink(a) {
        if (a.dataset.url) {
            var u = a.dataset.url; if (!/^[a-z]+:/i.test(u)) u = 'https://' + u;
            try { (window.cs || new CSInterface()).openURLInDefaultBrowser(u); } catch (e) { window.open(u); }
            return;
        }
        window.FWP_JSX && window.FWP_JSX('fwp_gotoBookmark(' + parseInt(a.dataset.comp, 10) + ',' + parseFloat(a.dataset.time) + ')', function (r) {
            if (String(r).indexOf('EZW_ERROR') === 0) say(String(r).replace('EZW_ERROR: ', ''), 'error');
        });
    }
    function linkSaved(a) { var t = a.closest('.nb-text'); var b = blockOf(t.closest('.nb-block')); if (b) { b.html = t.innerHTML; save(); } }

    // selection toolbar (shown above the editor while some text is selected)
    function updateSelBar() {
        var info = selInText();
        var show = info && !info.r.collapsed;
        selBar.classList.toggle('hidden', !show);
        if (show) savedRange = { r: info.r.cloneRange(), t: info.t };
    }
    function urlPrompt(done) {
        var row = selBar.querySelector('.nb-urlrow');
        row.classList.remove('hidden');
        var inp = row.querySelector('input'); inp.value = ''; inp.focus();
        function finish(ok) {
            row.classList.add('hidden');
            inp.onkeydown = null; row.querySelector('button').onclick = null;
            if (ok && inp.value.trim()) done(inp.value.trim());
        }
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); };
        row.querySelector('button').onclick = function () { finish(true); };
    }

    // right-click menu on a link
    function linkMenu(e, a) {
        e.preventDefault();
        closeCtx();
        var z = parseFloat(document.body.style.zoom) || 1;
        var m = el('div', 'nb-ctx'); m.dir = 'rtl';
        m.style.left = (e.clientX / z) + 'px'; m.style.top = (e.clientY / z) + 'px';
        var items = a.dataset.url
            ? [['🔗 افتح الرابط', function () { gotoLink(a); }], ['✎ عدّل الرابط', function () { editUrl(a); }], ['⨯ إزالة الرابط', function () { unlink(a); }]]
            : [['📍 روح للمكان', function () { gotoLink(a); }], ['↻ حدّث للمكان الحالي', function () { relink(a); }],
               ['⧉ انسخ الوقت', function () { copy(tc(parseFloat(a.dataset.time), parseFloat(a.dataset.fps))); say('تم نسخ الوقت'); }],
               ['⨯ إزالة الرابط', function () { unlink(a); }]];
        items.forEach(function (it) {
            var r = el('div', 'nb-ctx-i'); r.textContent = it[0];
            r.addEventListener('mousedown', function (ev) { ev.preventDefault(); closeCtx(); it[1](); });
            m.appendChild(r);
        });
        document.body.appendChild(m);
        setTimeout(function () { document.addEventListener('mousedown', closeCtx, { once: true }); }, 0);
    }
    function closeCtx() { var o = document.querySelector('.nb-ctx'); if (o) o.remove(); }
    function copy(t) { var x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); }
    function unlink(a) {
        var t = a.closest('.nb-text');
        var tcEl = a.querySelector('.nb-tc'); if (tcEl) tcEl.remove();
        while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
        a.remove(); var b = blockOf(t.closest('.nb-block')); b.html = t.innerHTML; save();
    }
    function relink(a) {
        window.FWP_JSX && window.FWP_JSX('fwp_bookmark()', function (r) {
            r = String(r || '');
            if (r.indexOf('EZW_ERROR') === 0) return say(r.replace('EZW_ERROR: ', ''), 'error');
            var m; try { m = JSON.parse(r); } catch (e) { return; }
            var label = a.firstChild && a.firstChild.nodeType === 3 ? a.firstChild.nodeValue : m.name;
            a.dataset.comp = m.id; a.dataset.name = m.name; a.dataset.time = m.time; a.dataset.fps = m.fps;
            linkHTML(a, label); linkSaved(a); say('تم تحديث المكان ✓', 'success');
        });
    }
    function editUrl(a) {
        selBar.classList.remove('hidden');
        urlPrompt(function (u) { a.dataset.url = u; linkSaved(a); selBar.classList.add('hidden'); });
        selBar.querySelector('.nb-urlrow input').value = a.dataset.url;
    }

    var pendingFocus = null;
    function focusNew(b) { pendingFocus = { id: b.id, end: false }; }
    function focusEnd(b) {
        var bEl = editor.querySelector('[data-id="' + b.id + '"]'); if (!bEl) { pendingFocus = { id: b.id, end: true }; return; }
        var t = textEl(bEl); if (!t) return;
        t.focus();
        var r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }

    function render() {
        editor.innerHTML = '';
        var n = 0;
        note.blocks.forEach(function (b) {
            n = b.t === 'ol' ? n + 1 : 0;
            editor.appendChild(blockEl(b, n));
        });
        if (pendingFocus) { var f = pendingFocus; pendingFocus = null; var b = null; note.blocks.forEach(function (x) { if (x.id === f.id) b = x; }); if (b) focusEnd(b); }
    }

    // the first strong letter decides the side (Arabic → right). Empty lines follow the
    // previous line, so a new task under Arabic text starts on the right too.
    var lastDir = 'rtl';
    function dirOf(html) {
        var txt = String(html || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ');
        var m = /[A-Za-z\u00C0-\u024F]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.exec(txt);
        if (!m) return lastDir;
        return (lastDir = /[A-Za-z\u00C0-\u024F]/.test(m[0]) ? 'ltr' : 'rtl');
    }

    function blockEl(b, num) {
        var w = el('div', 'nb-block nb-' + b.t + (b.done ? ' done' : ''));
        w.dataset.id = b.id;
        w.dir = b.t === 'code' ? 'ltr' : dirOf(b.html);
        var del = el('button', 'nb-del', '✕'); del.title = 'حذف';
        del.addEventListener('mousedown', function (e) { e.preventDefault(); note.blocks.splice(idx(b), 1); if (!note.blocks.length) note.blocks.push({ id: uid(), t: 'p', html: '' }); save(); render(); });

        if (b.t === 'hr') { w.appendChild(el('hr')); w.appendChild(del); return w; }
        if (b.t === 'img') {
            var g = el('div', 'nb-imgs c' + Math.min(b.src.length, 3));
            b.src.forEach(function (s) {
                var im = el('img'); im.src = imgUrl(s);
                // notes opened on another machine: the picture file isn't there
                im.onerror = function () { var ph = el('div', 'nb-imgmiss', '🖼 الصورة مو موجودة على هذا الجهاز'); if (im.parentNode) im.parentNode.replaceChild(ph, im); };
                g.appendChild(im);
            });
            g.style.width = (b.wp || 100) + '%';
            var hd = el('span', 'nb-imgh'); hd.title = 'اسحب لتكبير / تصغير الصورة — دبل كليك = الحجم الكامل';
            hd.addEventListener('mousedown', function (e) { imgResize(e, b, g); });
            hd.addEventListener('dblclick', function () { delete b.wp; save(); render(); });
            g.appendChild(hd);
            w.appendChild(g); w.appendChild(del); return w;
        }
        if (b.t === 'mark') {
            var m = b.mark, chip = el('button', 'nb-mark', '📍 <b></b> <span dir="ltr"></span>');
            chip.querySelector('b').textContent = m.name;
            chip.querySelector('span').textContent = tc(m.time, m.fps);
            chip.title = 'ارجع لهالمكان';
            chip.addEventListener('click', function () {
                window.FWP_JSX && window.FWP_JSX('fwp_gotoBookmark(' + m.id + ',' + m.time + ')', function (r) {
                    if (String(r).indexOf('EZW_ERROR') === 0) say(String(r).replace('EZW_ERROR: ', ''), 'error');
                });
            });
            w.appendChild(chip); w.appendChild(del); return w;
        }
        if (b.t === 'ul') w.appendChild(el('span', 'nb-bullet', '•'));
        if (b.t === 'ol') w.appendChild(el('span', 'nb-bullet', num + '.'));
        if (b.t === 'todo') {
            var cb = el('input'); cb.type = 'checkbox'; cb.className = 'nb-check'; cb.checked = !!b.done;
            cb.addEventListener('change', function () { b.done = cb.checked; w.classList.toggle('done', b.done); save(); });
            w.appendChild(cb);
        }
        var t = el('div', 'nb-text');
        t.contentEditable = 'true';
        t.dir = w.dir;
        t.spellcheck = false;
        t.innerHTML = b.html || '';
        t.dataset.ph = { h1: 'عنوان', h2: 'عنوان', h3: 'عنوان', code: 'كود…', quote: 'اقتباس…', todo: 'مهمة…' }[b.t] || 'اكتب، أو اضغط / للقائمة';
        t.addEventListener('input', function () {
            b.html = t.innerHTML; save();
            if (b.t !== 'code') { var d = dirOf(b.html); if (d !== w.dir) { w.dir = d; t.dir = d; } }
            slashCheck(w, t); shortcuts(b, t);
        });
        t.addEventListener('keydown', function (e) { keys(e, b, w, t); });
        t.addEventListener('blur', function () { setTimeout(function () { if (menuState && menuState.block === w && document.activeElement !== t) closeMenu(); }, 150); });
        w.appendChild(t);
        w.appendChild(del);
        return w;
    }

    function caretText(t) {
        var s = window.getSelection(); if (!s.rangeCount) return '';
        var r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(t); r.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
        return r.toString();
    }
    function slashCheck(w, t) {
        var before = caretText(t);
        var m = /(?:^|\s)\/([^\s\/]*)$/.exec(before);
        if (m) openMenu(w, m[1]); else if (menuState && menuState.block === w) closeMenu();
    }
    function shortcuts(b, t) {
        if (b.t !== 'p') return;
        var txt = t.textContent.replace(/\u00a0/g, ' ');
        var map = [['### ', 'h3'], ['## ', 'h2'], ['# ', 'h1'], ['- ', 'ul'], ['* ', 'ul'], ['1. ', 'ol'], ['[] ', 'todo'], ['> ', 'quote'], ['```', 'code']];
        for (var i = 0; i < map.length; i++) {
            if (txt.indexOf(map[i][0]) !== 0) continue;
            // keep whatever was typed after the shortcut
            b.t = map[i][1]; b.html = esc(txt.slice(map[i][0].length));
            if (b.t === 'todo') b.done = false;
            save(); render(); return focusEnd(b);
        }
    }
    function atStart(t) { return caretText(t).length === 0; }

    function keys(e, b, w, t) {
        if (menuState && menuState.block === w) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                menuState.i = (menuState.i + (e.key === 'ArrowDown' ? 1 : -1) + menuState.hits.length) % menuState.hits.length;
                var q = /\/([^\s\/]*)$/.exec(caretText(t)); return openMenu(w, q ? q[1] : '');
            }
            if (e.key === 'Enter') { e.preventDefault(); return pick(menuState.hits[menuState.i]); }
            if (e.key === 'Escape') { e.preventDefault(); return closeMenu(); }
        }
        if (e.key === 'Enter' && !e.shiftKey && b.t !== 'code') {
            e.preventDefault();
            var list = b.t === 'ul' || b.t === 'ol' || b.t === 'todo';
            if (list && !t.textContent.trim()) { b.t = 'p'; save(); render(); return focusEnd(b); }
            // split at the caret: the rest of the line goes to the new block
            var s = window.getSelection(), r = s.getRangeAt(0), tail = document.createRange();
            tail.setStart(r.endContainer, r.endOffset); tail.setEnd(t, t.childNodes.length);
            var frag = tail.extractContents(), tmp = el('div'); tmp.appendChild(frag);
            b.html = t.innerHTML;
            var nb = insertAfter(b, { id: uid(), t: list ? b.t : 'p', html: tmp.innerHTML });
            save(); render();
            var nEl = editor.querySelector('[data-id="' + nb.id + '"] .nb-text'); if (nEl) { nEl.focus(); var rr = document.createRange(); rr.setStart(nEl, 0); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); }
            return;
        }
        if (e.key === 'Backspace' && atStart(t) && window.getSelection().isCollapsed) {
            if (b.t !== 'p') { e.preventDefault(); b.t = 'p'; save(); render(); return focusStart(b); }
            var i = idx(b), prev = note.blocks[i - 1];
            if (prev && prev.html != null && prev.t !== 'mark' && prev.t !== 'img' && prev.t !== 'hr') {
                e.preventDefault();
                var join = (prev.html || '').length;
                prev.html = (prev.html || '') + (b.html || '');
                note.blocks.splice(i, 1); save(); render(); focusEnd(prev);
            } else if (prev && !b.html) { e.preventDefault(); note.blocks.splice(i, 1); save(); render(); if (note.blocks[i - 1]) focusEnd(note.blocks[i - 1]); }
        }
        if (e.key === 'ArrowUp' && atStart(t)) { var p = editor.querySelectorAll('.nb-text'), k = Array.prototype.indexOf.call(p, t); if (k > 0) { e.preventDefault(); focusEnd(blockOf(p[k - 1].parentNode)); } }
    }
    function focusStart(b) {
        var t = editor.querySelector('[data-id="' + b.id + '"] .nb-text'); if (!t) return;
        t.focus(); var r = document.createRange(); r.setStart(t, 0); r.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }

    // ── paste / drop ────────────────────────────────────────────────────────
    function currentBlock() {
        var a = document.activeElement; if (!a || !editor.contains(a)) return null;
        return blockOf(a.closest('.nb-block'));
    }
    function onPaste(e) {
        var cd = e.clipboardData; if (!cd) return;
        var files = [];
        Array.prototype.forEach.call(cd.items || [], function (it) { if (it.kind === 'file' && /^image\//.test(it.type)) files.push(it.getAsFile()); });
        if (files.length) { e.preventDefault(); readFiles(files, currentBlock()); return; }
        // plain text only, so styles from other apps don't leak in
        var txt = cd.getData('text/plain');
        if (txt != null) { e.preventDefault(); document.execCommand('insertText', false, txt); }
    }

    // ── notes list / scope ──────────────────────────────────────────────────
    function renderList() {
        listSel.innerHTML = '';
        book.notes.forEach(function (n, i) { var o = el('option'); o.value = n.id; o.textContent = n.title; listSel.appendChild(o); });
        listSel.value = note.id;
        scopeBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.scope === scope); });
        host.querySelector('.nb-proj').textContent = scope === 'general' ? 'ملاحظات عامة — تظهر في كل المشاريع'
            : (projectPath ? '📁 ' + projectPath.split(/[\\\/]/).pop() : 'المشروع غير محفوظ — احفظه عشان تنربط الملاحظات فيه');
    }
    function open() { loadBook(); renderList(); render(); loadFromProject(function () { renderList(); render(); }); }

    function watchProject() {
        if (!window.FWP_JSX || !host || host.offsetParent === null) return;
        window.FWP_JSX('fwp_projectInfo()', function (p) {
            p = String(p || '');
            if (p.indexOf('EZW_ERROR') === 0 || p === projectPath) return;
            saveNow(); projectPath = p;
            if (scope === 'project') open();
        });
    }

    function build() {
        host = el('div', 'psec fwp-tool'); host.id = 'sec-notes';
        host.innerHTML =
            '<div class="nb-top">' +
                '<div class="nb-scope"><button data-scope="project">المشروع</button><button data-scope="general">عامة</button></div>' +
                '<select class="nb-list"></select>' +
                '<button class="fwp-mini nb-new" title="ملاحظة جديدة">＋</button>' +
                '<button class="fwp-mini nb-ren" title="إعادة تسمية">✎</button>' +
                '<button class="fwp-mini nb-rm" title="حذف الملاحظة">🗑</button>' +
            '</div>' +
            '<div class="nb-proj"></div>' +
            '<div class="nb-quick"><button data-q="log">📅 سجل اليوم</button><button data-q="time">🕒 الوقت</button><button data-q="mark">📍 مكاني</button><button data-q="todo">☐ مهمة</button><button data-q="img">🖼 صورة</button></div>' +
            '<div class="nb-selbar hidden" dir="rtl"><button data-a="here">📍 اربطه بمكاني</button><button data-a="url">🔗 رابط</button><button data-a="bold"><b>B</b></button>' +
                '<div class="nb-urlrow hidden"><input type="text" dir="ltr" placeholder="https://…"><button>تم</button></div></div>' +
            '<div class="nb-wrap"><div class="nb-editor"></div><div class="nb-menu hidden"></div></div>';
        listSel = host.querySelector('.nb-list');
        editor = host.querySelector('.nb-editor');
        menu = host.querySelector('.nb-menu');
        selBar = host.querySelector('.nb-selbar');
        scopeBtns = Array.prototype.slice.call(host.querySelectorAll('.nb-scope button'));
        scopeBtns.forEach(function (b) { b.addEventListener('click', function () { saveNow(); scope = b.dataset.scope; open(); }); });
        listSel.addEventListener('change', function () { saveNow(); book.notes.forEach(function (n) { if (n.id === listSel.value) note = n; }); render(); });
        host.querySelector('.nb-new').addEventListener('click', function () { saveNow(); note = newNote(); book.notes.unshift(note); saveNow(); renderList(); render(); focusEnd(note.blocks[0]); });
        host.querySelector('.nb-ren').addEventListener('click', function () {
            var inp = el('input', 'nb-title'); inp.type = 'text'; inp.value = note.title; inp.dir = 'auto';
            listSel.replaceWith(inp); inp.focus(); inp.select();
            function done() { note.title = inp.value.trim() || note.title; saveNow(); inp.replaceWith(listSel); renderList(); }
            inp.addEventListener('blur', done); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
        });
        var rm = host.querySelector('.nb-rm');
        rm.addEventListener('click', function () {
            if (!rm.classList.contains('confirm')) { rm.classList.add('confirm'); rm.textContent = 'متأكد؟'; setTimeout(function () { rm.classList.remove('confirm'); rm.textContent = '🗑'; }, 2500); return; }
            book.notes.splice(book.notes.indexOf(note), 1);
            if (!book.notes.length) book.notes.push(newNote());
            note = book.notes[0]; saveNow(); renderList(); render();
        });
        host.querySelectorAll('.nb-quick button').forEach(function (b) {
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () {
                var cur = currentBlock();
                if (!cur) { cur = note.blocks[note.blocks.length - 1]; if (cur.html || cur.t !== 'p') cur = insertAfter(cur, { id: uid(), t: 'p', html: '' }); }
                transform(cur, b.dataset.q);
            });
        });
        editor.addEventListener('paste', onPaste);
        editor.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('.nb-link');
            if (a && editor.contains(a)) { e.preventDefault(); gotoLink(a); }
        });
        editor.addEventListener('contextmenu', function (e) {
            var a = e.target.closest && e.target.closest('.nb-link');
            if (a && editor.contains(a)) linkMenu(e, a);
        });
        document.addEventListener('selectionchange', function () { if (host.offsetParent !== null) updateSelBar(); });
        selBar.querySelector('[data-a=here]').addEventListener('click', function () { if (savedRange) linkHere(savedRange); selBar.classList.add('hidden'); });
        selBar.querySelector('[data-a=url]').addEventListener('click', function () {
            var keep = savedRange; if (!keep) return;
            urlPrompt(function (u) { keep.t.focus(); var s = window.getSelection(); s.removeAllRanges(); s.addRange(keep.r); wrapLink(keep, { url: u }, u); selBar.classList.add('hidden'); });
        });
        selBar.querySelector('[data-a=bold]').addEventListener('click', function () { document.execCommand('bold'); syncBlock(); });
        selBar.querySelectorAll('button').forEach(function (b) { b.addEventListener('mousedown', function (e) { if (!b.closest('.nb-urlrow')) e.preventDefault(); }); });
        editor.addEventListener('dragover', function (e) { e.preventDefault(); });
        editor.addEventListener('drop', function (e) { if (e.dataTransfer && readFiles(e.dataTransfer.files, currentBlock() || note.blocks[note.blocks.length - 1])) e.preventDefault(); });
        // clicking under the last block starts writing there
        editor.addEventListener('mousedown', function (e) {
            if (e.target !== editor) return;
            e.preventDefault();
            var last = note.blocks[note.blocks.length - 1];
            if (last.t !== 'p' || last.html) last = insertAfter(last, { id: uid(), t: 'p', html: '' });
            save(); render(); focusEnd(last);
        });
        open();
        // the open project is checked when Notes appears / the panel gets focus, not every 3 s
        if (window.FWP_WHEN_NEEDED) window.FWP_WHEN_NEEDED(host, watchProject, 15000);
        else setInterval(watchProject, 15000);
        window.addEventListener('beforeunload', saveNow);
        return host;
    }

    window.addEventListener('DOMContentLoaded', function () {
        if (window.__FWP_REDIRECT) return;
        var h = byId('tools-list'); if (!h) return;
        h.appendChild(build());
    });
})();
