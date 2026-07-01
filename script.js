let editor;
let currentActivePanel = 'explorer';
let openFilesMemory = {}; // { "index.html": { handle: ..., textData: "..." } }
let activeFileHandleName = null; // Aktiv faylning nomi (String)
let currentDirHandle = null; // Ochilgan bosh papka xotirasi
let isPreviewOpen = false;

// Dastlabki yuklanadigan kod
const initialCode = `<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AuraAI Test</title>
</head>
<body>
    <h1>AuraAI Studio Tayyor! 🔥</h1>
    <p>Chap tomondan papka oching yoki yangi fayl yaratib sinab ko'ring.</p>
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
    const isDark = document.body.getAttribute("data-theme") === "dark";
    document.body.setAttribute("data-theme", isDark ? "light" : "dark");
    if (editor) {
        monaco.editor.setTheme(isDark ? "vs" : "auraTheme");
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
    setTimeout(() => { if (window.editor) window.editor.layout(); }, 350);
}

// --- 🔥 PREMIUM TABS TIZIMI (Sizda yo'q edi, qo'shildi) ---
function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    
    const fileNames = Object.keys(openFilesMemory);
    if (fileNames.length === 0) {
        container.innerHTML = `<div class="text-[11px] opacity-40 px-3 font-mono italic">Fayl ochilmagan</div>`;
        return;
    }

    fileNames.forEach(name => {
        const isActive = (name === activeFileHandleName);
        const tab = document.createElement('div');
        
        // Premium klasslar dinamik almashadi
        tab.className = `px-4 h-full text-[12px] font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 border-r border-[var(--border-color)] ${
            isActive ? 'tab-active bg-[var(--tab-active-bg)]' : 'tab-inactive text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
        }`;
        
        let icon = "insert_drive_file";
        if(name.endsWith('.html')) icon = "html";
        if(name.endsWith('.css')) icon = "css";
        if(name.endsWith('.js')) icon = "javascript";

        tab.innerHTML = `
            <span class="material-icons-outlined text-[14px]">${icon}</span>
            <span>${name}</span>
            <span onclick="closeTab(event, '${name}')" class="material-icons-outlined text-[12px] hover:text-red-500 ml-1 p-0.5 rounded transition-colors">close</span>
        `;
        
        tab.onclick = () => switchToFile(name);
        container.appendChild(tab);
    });
}

function switchToFile(name) {
    if (!openFilesMemory[name]) return;
    activeFileHandleName = name;
    
    editor.setValue(openFilesMemory[name].textData);
    const lang = getLangFromExt(name);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
    document.getElementById('editor-language').innerText = lang;
    
    renderTabs();
    updateLivePreview();
}

function closeTab(event, name) {
    event.stopPropagation(); // Tab almashib ketmasligi uchun
    delete openFilesMemory[name];
    
    if (activeFileHandleName === name) {
        const remaining = Object.keys(openFilesMemory);
        if (remaining.length > 0) {
            switchToFile(remaining[remaining.length - 1]);
        } else {
            activeFileHandleName = null;
            editor.setValue("");
            document.getElementById('editor-language').innerText = "plaintext";
        }
    }
    renderTabs();
    updateLivePreview();
}

// --- FILE SYSTEM API (Ochish, Yaratish, Saqlash) ---
async function openLocalFile() {
    try {
        const [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();
        const text = await file.text();
        
        openFilesMemory[fileHandle.name] = { handle: fileHandle, textData: text };
        switchToFile(fileHandle.name);
    } catch (e) {
        console.log("Fayl ochish bekor qilindi", e);
    }
}

async function openLocalFolder() {
    try {
        currentDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        document.getElementById('sidebar-title').innerText = currentDirHandle.name;
        const treeContainer = document.getElementById('file-tree');
        treeContainer.innerHTML = '';
        
        await listAllFiles(currentDirHandle, treeContainer, "8px");
    } catch (e) { 
        console.log("Papka ochish bekor qilindi", e); 
    }
}

// Rekursiv qatlamli o'quvchi
async function listAllFiles(dirHandle, parentElement, paddingLeft) {
    for await (const entry of dirHandle.values()) {
        const el = document.createElement('div');
        el.className = `py-1 cursor-pointer hover:bg-white/5 rounded flex items-center gap-2 text-[12px] transition-colors`;
        el.style.paddingLeft = paddingLeft;
        
        if (entry.kind === 'file') {
            let fileIcon = "insert_drive_file";
            if(entry.name.endsWith('.html')) fileIcon = "html";
            if(entry.name.endsWith('.css')) fileIcon = "css";
            if(entry.name.endsWith('.js')) fileIcon = "javascript";
            
            el.innerHTML = `<span class="material-icons-outlined text-[14px] text-cyan-500">${fileIcon}</span> <span class="truncate">${entry.name}</span>`;
            el.onclick = async () => {
                const file = await entry.getFile();
                const text = await file.text();
                
                openFilesMemory[entry.name] = { handle: entry, textData: text };
                switchToFile(entry.name);
            };
            parentElement.appendChild(el);
        } else if (entry.kind === 'directory') {
            el.innerHTML = `<span class="material-icons-outlined text-[14px] text-amber-500">folder</span> <span class="font-medium truncate">${entry.name}</span>`;
            parentElement.appendChild(el);
            
            const subContainer = document.createElement('div');
            subContainer.className = "hidden border-l border-white/10 ml-3";
            parentElement.appendChild(subContainer);
            
            el.onclick = async (e) => {
                e.stopPropagation();
                subContainer.classList.toggle('hidden');
                const icon = el.querySelector('.material-icons-outlined');
                icon.innerText = subContainer.classList.contains('hidden') ? "folder" : "folder_open";
            };
            
            await listAllFiles(entry, subContainer, "12px");
        }
    }
}

async function createNewFile() {
    if (!currentDirHandle) {
        alert("Yangi fayl yaratish uchun avval biron loyiha papkasini oching (Fayl > Papkani ochish).");
        return;
    }
    
    const fileName = prompt("Yangi fayl nomini kiriting (masalan: style.css, script.js):");
    if (!fileName || fileName.trim() === "") return;

    try {
        const newFileHandle = await currentDirHandle.getFileHandle(fileName, { create: true });
        openFilesMemory[fileName] = { handle: newFileHandle, textData: "" };
        
        const treeContainer = document.getElementById('file-tree');
        treeContainer.innerHTML = '';
        await listAllFiles(currentDirHandle, treeContainer, "8px");
        
        switchToFile(fileName);
    } catch (err) {
        console.error("Fayl yaratishda xatolik:", err);
        alert("Fayl yaratishda xatolik yuz berdi.");
    }
}

async function saveCurrentFile() {
    if (!activeFileHandleName || !openFilesMemory[activeFileHandleName].handle) {
        alert("Saqlash uchun local xotiradan fayl ochilgan bo'lishi kerak.");
        return;
    }
    try {
        const fileObj = openFilesMemory[activeFileHandleName];
        const writable = await fileObj.handle.createWritable();
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

// --- LIVE PREVIEW CONTROL ---
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
    
    let htmlContent = "";
    if (activeFileHandleName && activeFileHandleName.endsWith('.html')) {
        htmlContent = editor.getValue();
    } else if (openFilesMemory['index.html']) {
        htmlContent = openFilesMemory['index.html'].textData;
    } else {
        const remaining = Object.keys(openFilesMemory);
        const htmlFile = remaining.find(name => name.endsWith('.html'));
        if (htmlFile) htmlContent = openFilesMemory[htmlFile].textData;
    }

    if (!htmlContent) {
        frame.srcdoc = `<html><body style="background:#0a0a0a;color:#888;font-family:sans-serif;text-align:center;padding:30px;">
            <h3>Jonli natija uchun kamida bitta HTML faylini tabda oching!</h3>
            <p style="font-size:12px;color:#555;">CSS va JS natijasini ko'rish uchun ularni ham tabda ochib qo'ying.</p>
        </body></html>`;
        return;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // CSS Inyeksiya (Faqat tabda ochiq fayllardan tekshiradi)
        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && openFilesMemory[href]) {
                const styleTag = doc.createElement('style');
                styleTag.textContent = openFilesMemory[href].textData;
                link.parentNode.replaceChild(styleTag, link);
            }
        });

        // JS Inyeksiya (Faqat tabda ochiq fayllardan tekshiradi)
        const scripts = doc.querySelectorAll('script[src]');
        scripts.forEach(script => {
            const src = script.getAttribute('src');
            if (src && openFilesMemory[src]) {
                const scriptTag = doc.createElement('script');
                scriptTag.textContent = openFilesMemory[src].textData;
                script.parentNode.replaceChild(scriptTag, script);
            }
        });

        frame.srcdoc = new XMLSerializer().serializeToString(doc);
    } catch (error) {
        console.error("Preview Error:", error);
    }
}

// --- UTIL FONKSIYALAR ---
function getLangFromExt(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.py')) return 'python';
    return 'html';
}

// --- MONACO EDITOR INITIALIZATION ---
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
            value: initialCode,
            language: 'html',
            theme: document.body.getAttribute("data-theme") === "dark" ? "auraTheme" : "vs",
            automaticLayout: true,
            fontSize: 15,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: true, scale: 0.7 },
            wordWrap: 'off',
            padding: { top: 20 },
            cursorBlinking: 'smooth'
        });

        // Harf yozilganda xotirani real vaqtda yangilash (Debounce olib tashlandi - srazi o'zgaradi!)
        editor.onDidChangeModelContent(() => {
            const syncStatus = document.getElementById('sync-status');
            syncStatus.innerHTML = `<span class="material-icons-outlined text-[14px]">edit</span> O'zgartirildi...`;
            syncStatus.className = "flex items-center gap-1.5 text-amber-400";
            
            if (activeFileHandleName && openFilesMemory[activeFileHandleName]) {
                openFilesMemory[activeFileHandleName].textData = editor.getValue();
            }
            updateLivePreview();
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveCurrentFile();
        });
        
        window.editor = editor;
        
        // Dastlabki bo'sh holat tabini render qilish
        renderTabs();
    });
}

initEditor();

function updateEditorSettings() {
    if (!editor) return;
    const size = parseInt(document.getElementById('setting-fontsize').value);
    const wrap = document.getElementById('setting-wordwrap').checked ? 'on' : 'off';
    editor.updateOptions({ fontSize: size, wordWrap: wrap });
}