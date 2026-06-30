let editor;
let currentActivePanel = 'explorer';
let openFilesMemory = {}; 
let activeFileHandle = null; // null bo'lsa default holatda turadi
let isPreviewOpen = false;

// Dastlabki yuklanadigan kod (bo'sh qora ekran bo'lmasligi uchun)
const initialCode = `<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AuraAI Test</title>
    <style>
        body { background-color: #111; color: #fff; font-family: sans-serif; text-align: center; padding-top: 20%; }
        h1 { color: #22d3ee; }
    </style>
</head>
<body>
    <h1>AuraAI Studio Tayyor!</h1>
    <p>O'zgarishlarni real vaqtda ko'ring.</p>
</body>
</html>`;

// --- UI MANAGE ---
function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
    document.getElementById('fullscreen-icon').innerText = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
});

function toggleTheme() {

    const isDark =
        document.body.getAttribute("data-theme") === "dark";

    document.body.setAttribute(
        "data-theme",
        isDark ? "light" : "dark"
    );

    if (editor) {
        monaco.editor.setTheme(
            isDark ? "vs" : "auraTheme"
        );
    }
}

function toggleFileMenu(event) {
    event.stopPropagation();
    const drop = document.getElementById('file-dropdown');
    drop.classList.toggle('hidden');
    setTimeout(() => {
        drop.classList.toggle('opacity-0');
        drop.classList.toggle('scale-95');
    }, 10);
}
document.addEventListener('click', () => {
    const drop = document.getElementById('file-dropdown');
    if(drop && !drop.classList.contains('hidden')){
        drop.classList.add('opacity-0', 'scale-95');
        setTimeout(() => drop.classList.add('hidden'), 200);
    }
});

function toggleActivityPanel(panelName) {
    const sidebar = document.getElementById('slidebar_panel');
    const title = document.getElementById('sidebar-title');
    document.querySelectorAll('.activity-icon').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.add('hidden'));

    if (currentActivePanel === panelName && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        currentActivePanel = null;
    } else {
        sidebar.classList.remove('collapsed');
        document.getElementById('btn-' + panelName).classList.add('active');
        document.getElementById('panel-' + panelName).classList.remove('hidden');
        currentActivePanel = panelName;
        const titles = { 'explorer': 'Loyiha Fayllari', 'plugins': 'AuraAI Backend API', 'settings': 'IDE Sozlamalari' };
        title.innerText = titles[panelName];
    }
    // Ekranni to'g'rilash
    setTimeout(() => { if (window.editor) window.editor.layout(); }, 350);
}

// --- FILE SYSTEM API (To'liq ishlashi uchun) ---
async function openLocalFile() {
    try {
        const [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();
        const text = await file.text();
        
        activeFileHandle = fileHandle; // Obyekt saqlanadi
        openFilesMemory[fileHandle.name] = { handle: fileHandle, textData: text };
        
        // Tabni yangilash
        document.getElementById('tabs-container').innerHTML = `
            <div class="tab-active px-4 py-2 text-[12px] font-medium flex items-center gap-2 cursor-pointer transition-colors">
                <span class="material-icons-outlined text-[14px] text-cyan-400">description</span> ${fileHandle.name}
            </div>
        `;
        
        editor.setValue(text);
        const lang = detectLanguage(text) || getLangFromExt(fileHandle.name);
        monaco.editor.setModelLanguage(editor.getModel(), lang);
        document.getElementById('editor-language').innerText = lang;
        
        updateLivePreview();
    } catch (e) {
        console.log("Fayl ochish bekor qilindi", e);
    }
}

async function openLocalFolder() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        openFilesMemory = {}; // Xotirani tozalash
        document.getElementById('sidebar-title').innerText = dirHandle.name;
        
        const treeContainer = document.getElementById('file-tree');
        treeContainer.innerHTML = '';
        
        // Papka ichini o'qish (faqat birinchi qavat MVP uchun)
        for await (const entry of dirHandle.values()) {
            const el = document.createElement('div');
            el.className = 'py-1.5 cursor-pointer hover:bg-white/10 px-2 rounded flex items-center gap-2 text-[12px] transition-colors';
            
            if (entry.kind === 'file') {
                el.innerHTML = `<span class="material-icons-outlined text-[14px] text-gray-400">insert_drive_file</span> ${entry.name}`;
                el.onclick = async () => {
                    const file = await entry.getFile();
                    const text = await file.text();
                    activeFileHandle = entry;
                    openFilesMemory[entry.name] = { handle: entry, textData: text };
                    
                    document.getElementById('tabs-container').innerHTML = `
                        <div class="tab-active px-4 py-2 text-[12px] font-medium flex items-center gap-2 cursor-pointer transition-colors">
                            <span class="material-icons-outlined text-[14px] text-cyan-400">description</span> ${entry.name}
                        </div>
                    `;
                    editor.setValue(text);
                    const lang = detectLanguage(text) || getLangFromExt(entry.name);
                    monaco.editor.setModelLanguage(editor.getModel(), lang);
                    document.getElementById('editor-language').innerText = lang;
                    updateLivePreview();
                };
            } else {
                el.innerHTML = `<span class="material-icons-outlined text-[14px] text-amber-500">folder</span> ${entry.name}`;
            }
            treeContainer.appendChild(el);
        }
    } catch (e) {
        console.log("Papka ochish bekor qilindi", e);
    }
}

async function saveCurrentFile() {
    if (!activeFileHandle) {
        alert("Fayl ochilmagan! Avval Fayl > Faylni ochish orqali biron faylni oching.");
        return;
    }
    try {
        const writable = await activeFileHandle.createWritable();
        await writable.write(editor.getValue());
        await writable.close();
        
        const syncStatus = document.getElementById('sync-status');
        syncStatus.innerHTML = `<span class="material-icons-outlined text-[14px]">cloud_done</span> Saqlandi`;
        syncStatus.className = "flex items-center gap-1.5 text-emerald-400";
        
        const alertBox = document.getElementById('save-alert');
        alertBox.classList.remove('translate-y-[200%]', 'opacity-0');
        setTimeout(() => alertBox.classList.add('translate-y-[200%]', 'opacity-0'), 2500);
    } catch (err) {
        console.error("Saqlashda xato:", err);
    }
}

// --- LIVE PREVIEW ---
function toggleLivePreview() {
    const previewContainer = document.getElementById('preview-container');
    const btn = document.getElementById('btn-live-preview');
    isPreviewOpen = !isPreviewOpen;

    if (isPreviewOpen) {
        previewContainer.classList.remove('hidden', 'w-0');
        previewContainer.classList.add('w-1/2'); 
        btn.classList.add('bg-emerald-500', 'text-white');
        btn.classList.remove('bg-emerald-500/10', 'text-emerald-500');
        updateLivePreview();
    } else {
        previewContainer.classList.add('w-0');
        setTimeout(() => previewContainer.classList.add('hidden'), 300);
        btn.classList.remove('bg-emerald-500', 'text-white');
        btn.classList.add('bg-emerald-500/10', 'text-emerald-500');
    }
    setTimeout(() => { if (window.editor) window.editor.layout(); }, 300);
}

function updateLivePreview() {
    if (!isPreviewOpen) return;
    const frame = document.getElementById('live-preview-frame');
    
    // Hozirgi kodni olish (MVP uchun hozircha aktiv oynadagini o'qiydi)
    const currentCode = editor.getValue();
    const currentLang = editor.getModel().getLanguageId();
    
    let doc = "";
    if (currentLang === 'html') {
        doc = currentCode;
    } else {
        doc = `<html><body><pre style="color:white;background:#111;padding:20px;">Faqat HTML/CSS ko'rsatiladi.<br>Hozirgi til: ${currentLang}</pre></body></html>`;
    }
    
    frame.srcdoc = doc;
}

// --- UTIL FONKSIYALAR ---
function getLangFromExt(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.py')) return 'python';
    return 'html';
}

function detectLanguage(code) {
    if (/<html>|<head>|<body|<div|<span/i.test(code)) return 'html';
    if (/def |import |print\(/i.test(code)) return 'python';
    if (/const |let |=>|document\./i.test(code)) return 'javascript';
    if (/[{}]\s*[\w-]+\s*:/i.test(code) || /@media|margin:/i.test(code)) return 'css';
    return null;
}

// --- MONACO EDITOR INITSILIZATSIYASI ---
async function initEditor() {
    await document.fonts.load('15px "JetBrains Mono"');
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        
        monaco.editor.defineTheme('auraTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '737373', fontStyle: 'italic' },
                { token: 'keyword', foreground: '22d3ee' }
            ],
            colors: { 
                'editor.background': '#0a0a0a',
                'editorLineNumber.foreground': '#404040',
                'editorCursor.foreground': '#22d3ee'
            }
        });

        editor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: initialCode, // O'lik qora ekran o'rniga HTML template tushadi!
            language: 'html',
            theme: document.body.getAttribute("data-theme") === "dark"
                ? "auraTheme"
                : "vs",
            automaticLayout: true, // Konteyner o'zgarsa o'zi moslashadi
            fontSize: 15,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: true, scale: 0.7 },
            wordWrap: 'off',
            padding: { top: 20 },
            cursorBlinking: 'smooth'
        });

        let autoLangTimeout;
        let livePreviewTimeout;

        editor.onDidChangeModelContent(() => {
            const syncStatus = document.getElementById('sync-status');
            syncStatus.innerHTML = `<span class="material-icons-outlined text-[14px]">edit</span> O'zgartirildi...`;
            syncStatus.className = "flex items-center gap-1.5 text-amber-400";
            
            // Xotirani yangilash
            if (activeFileHandle && openFilesMemory[activeFileHandle.name]) {
                openFilesMemory[activeFileHandle.name].textData = editor.getValue();
            }

            // Live Preview yangilash
            clearTimeout(livePreviewTimeout);
            livePreviewTimeout = setTimeout(() => {
                updateLivePreview();
            }, 600);
        });

        // CTRL+S bosilganda saqlash
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveCurrentFile();
        });
        
        window.editor = editor; // layout() ishlashi uchun globalga chiqarish
    });
}

initEditor();

function updateEditorSettings() {
    if (!editor) return;
    const size = parseInt(document.getElementById('setting-fontsize').value);
    const wrap = document.getElementById('setting-wordwrap').checked ? 'on' : 'off';
    editor.updateOptions({ fontSize: size, wordWrap: wrap });
}