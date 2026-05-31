/**
 * エントリーポイント
 */
import { Engine } from './engine.js';
import { state } from './state.js';
import { DataLoader, LocalDriver, HttpDriver } from './data-loader.js';

let engine = null;

document.addEventListener('DOMContentLoaded', () => {
    // 起動時にアイコンを初期化（ソース選択画面など）
    if (window.lucide) window.lucide.createIcons();

    // 初期状態ではエンジンは作らない（ソース選択を待つ）

    // 1. ローカルフォルダを選択して読み込む
    window.loadLocalFolder = async () => {
        try {
            const directoryHandle = await window.showDirectoryPicker();
            const driver = new LocalDriver(directoryHandle);
            const loader = new DataLoader(driver, state);
            engine = new Engine(loader);
            await engine.init();
            setupAudioUnlock();
        } catch (e) {
            console.error("Local load failed", e);
            alert("フォルダの選択がキャンセルされたか、アクセス権限がありません。");
        }
    };

    // 2. GitHub (またはHTTP) から読み込む
    window.loadRemoteRepo = async (targetRepo = null) => {
        let repo = targetRepo || document.getElementById('github-url').value.trim();
        if (!repo) return alert("ユーザー名/リポジトリ名を入力してください");

        // URL形式 (https://github.com/user/repo...) の場合は抽出する
        if (repo.startsWith('http')) {
            const url = new URL(repo);
            const paths = url.pathname.split('/').filter(p => p);
            if (paths.length >= 2) {
                // .git を除去
                repo = `${paths[0]}/${paths[1].replace('.git', '')}`;
            }
        }

        // raw.githubusercontent.com 形式に変換
        const baseUrl = `https://raw.githubusercontent.com/${repo}/main/`;
        const driver = new HttpDriver(baseUrl);
        const loader = new DataLoader(driver, state);
        try {
            engine = new Engine(loader);
            await engine.init();
            setupAudioUnlock();
        } catch (e) {
            console.error("Remote load failed", e);
            alert(`読み込みに失敗しました。\n・リポジトリ名: ${repo}\n・公開設定が「Public」であることを確認してください。\n\nエラー詳細: ${e.message}`);
        }

        // URLパラメータの更新（リロードしても維持できるように）
        if (!targetRepo) {
            const url = new URL(window.location);
            url.searchParams.set('repo', repo);
            window.history.pushState({}, '', url);
        }
    };

    // 3. 自動読み込み（URLパラメータがある場合）
    const params = new URLSearchParams(window.location.search);
    const initialRepo = params.get('repo');
    if (initialRepo) {
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
            // 初期シーン（entrance）に強制的に戻して再描画
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

            // URLパラメータをクリア
            const url = new URL(window.location);
            url.searchParams.delete('repo');
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
