/**
 * エントリーポイント
 */
import { Engine } from './engine.js';
import { state } from './state.js';
import { DataLoader, LocalDriver, HttpDriver } from './data-loader.js';

let engine = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 起動時にアイコンを初期化（ソース選択画面など）
    if (window.lucide) window.lucide.createIcons();

    // Vault一覧マニフェストを読み込んで動的にドロップダウン生成
    await initVaultSelector();

    // 1. プロジェクト内 Vault プリセットの読み込み
    window.loadPresetVault = async (targetVault = null) => {
        const selectEl = document.getElementById('preset-vault-select');
        const vault = targetVault || (selectEl ? selectEl.value : 'the_house');
        if (!vault) return alert("Vaultが選択されていません");

        const baseUrl = `./vaults/${vault}/`;
        const driver = new HttpDriver(baseUrl);
        const loader = new DataLoader(driver, state);
        try {
            state.reset(); // シナリオ切り替え時はステートリセット
            engine = new Engine(loader);
            engine.audio.unlock();
            engine.audio.playConfirmSound();
            await engine.init();
            setupAudioUnlock();
        } catch (e) {
            console.error("Preset vault load failed", e);
            alert(`Vaultの読み込みに失敗しました (${vault}): ${e.message}`);
        }

        if (!targetVault) {
            const url = new URL(window.location);
            url.searchParams.set('vault', vault);
            url.searchParams.delete('repo');
            window.history.pushState({}, '', url);
        }
    };

    // 2. ローカルフォルダを選択して読み込む (File System Access API)
    window.loadLocalFolder = async () => {
        try {
            const directoryHandle = await window.showDirectoryPicker();
            const driver = new LocalDriver(directoryHandle);
            const loader = new DataLoader(driver, state);
            state.reset();
            engine = new Engine(loader);
            await engine.init();
            setupAudioUnlock();
        } catch (e) {
            console.error("Local load failed", e);
            alert("フォルダの選択がキャンセルされたか、アクセス権限がありません。");
        }
    };

    // 3. GitHub (またはHTTP) から読み込む
    window.loadRemoteRepo = async (targetRepo = null) => {
        let repo = targetRepo || document.getElementById('github-url').value.trim();
        if (!repo) return alert("ユーザー名/リポジトリ名を入力してください");

        if (repo.startsWith('http')) {
            const url = new URL(repo);
            const paths = url.pathname.split('/').filter(p => p);
            if (paths.length >= 2) {
                repo = `${paths[0]}/${paths[1].replace('.git', '')}`;
            }
        }

        const baseUrl = `https://raw.githubusercontent.com/${repo}/main/`;
        const driver = new HttpDriver(baseUrl);
        const loader = new DataLoader(driver, state);
        try {
            state.reset();
            engine = new Engine(loader);
            await engine.init();
            setupAudioUnlock();
        } catch (e) {
            console.error("Remote load failed", e);
            alert(`読み込みに失敗しました。\n・リポジトリ名: ${repo}\n\nエラー詳細: ${e.message}`);
        }

        if (!targetRepo) {
            const url = new URL(window.location);
            url.searchParams.set('repo', repo);
            url.searchParams.delete('vault');
            window.history.pushState({}, '', url);
        }
    };

    // 4. 自動読み込み（URLパラメータがある場合）
    const params = new URLSearchParams(window.location.search);
    const initialVault = params.get('vault');
    const initialRepo = params.get('repo');
    
    if (initialVault) {
        window.loadPresetVault(initialVault);
    } else if (initialRepo) {
        window.loadRemoteRepo(initialRepo);
    }

    const setupAudioUnlock = () => {
        const triggerUnlock = async () => {
            if (engine) await engine.audio.unlock();
        };
        window.addEventListener('click', triggerUnlock);
        window.addEventListener('touchstart', triggerUnlock);
        window.addEventListener('keydown', triggerUnlock);
    };

    // グローバル関数
    window.gameReset = () => {
        if (confirm('すべての進捗をリセットして最初から始めますか？')) {
            state.reset();
            if (engine) engine.render('entrance');
        }
    };
    window.showMap = () => engine.renderMapView();
    window.setVolume = (type, val) => engine.audio.setVolume(type, val);

    window.returnToLoader = () => {
        if (confirm('ソース選択画面に戻りますか？（現在の進捗は保存されます）')) {
            const app = document.getElementById('app');
            const selector = document.getElementById('source-selector');
            app.classList.add('hidden');
            selector.classList.remove('hidden');

            const url = new URL(window.location);
            url.searchParams.delete('repo');
            url.searchParams.delete('vault');
            window.history.pushState({}, '', url);

            if (window.lucide) window.lucide.createIcons();
        }
    };

    window.exportSave = () => {
        const data = state.getExportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `the_house_save_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const uploadInput = document.getElementById('save-upload');
    if (uploadInput) {
        uploadInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re) => {
                if (state.importData(re.target.result)) location.reload();
            };
            reader.readAsText(file);
        };
    }
});

async function initVaultSelector() {
    const selectEl = document.getElementById('preset-vault-select');
    if (!selectEl) return;

    try {
        const res = await fetch('./vaults/manifest.json');
        if (res.ok) {
            const vaults = await res.json();
            selectEl.innerHTML = '';
            vaults.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.name;
                selectEl.appendChild(opt);
            });
            return;
        }
    } catch (e) {
        console.warn("Failed to load vault manifest", e);
    }

    // フォールバック
    selectEl.innerHTML = `
        <option value="the_house">🏠 The House [祖父の記憶と家]</option>
        <option value="cyber_tokyo">🌆 Cyber Tokyo 2099 [電脳街の路地裏]</option>
        <option value="the_morning_cafe">☕ The Morning Cafe [朝のカフェ]</option>
    `;
}
