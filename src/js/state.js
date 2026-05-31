/**
 * ゲームのグローバルな状態管理
 */
export const state = {
    currentSceneId: 'entrance',
    visitedScenes: new Set(),
    unlockedMemories: new Set(),
    foundObjects: new Set(),
    flags: {}, // 汎用フラグ

    // ストレージに保存
    save() {
        const data = {
            currentSceneId: this.currentSceneId,
            visitedScenes: Array.from(this.visitedScenes),
            unlockedMemories: Array.from(this.unlockedMemories),
            foundObjects: Array.from(this.foundObjects),
            flags: this.flags
        };
        localStorage.setItem('the_house_save', JSON.stringify(data));
        console.log('Game Saved');
    },

    // ストレージから復元
    load() {
        const raw = localStorage.getItem('the_house_save');
        if (!raw) return false;
        try {
            const data = JSON.parse(raw);
            this.currentSceneId = data.currentSceneId || 'entrance';
            this.visitedScenes = new Set(data.visitedScenes || []);
            this.unlockedMemories = new Set(data.unlockedMemories || []);
            this.foundObjects = new Set(data.foundObjects || []);
            this.flags = data.flags || {};
            return true;
        } catch (e) {
            console.error('Save data corrupted', e);
            return false;
        }
    },

    // データのエクスポート（JSON文字列を取得）
    getExportData() {
        const data = {
            currentSceneId: this.currentSceneId,
            visitedScenes: Array.from(this.visitedScenes),
            unlockedMemories: Array.from(this.unlockedMemories),
            foundObjects: Array.from(this.foundObjects),
            flags: this.flags,
            savedAt: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    // データのインポート（JSON文字列から復元）
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this.currentSceneId = data.currentSceneId || 'entrance';
            this.visitedScenes = new Set(data.visitedScenes || []);
            this.unlockedMemories = new Set(data.unlockedMemories || []);
            this.foundObjects = new Set(data.foundObjects || []);
            this.flags = data.flags || {};
            this.save(); // LocalStorageにも反映
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    },

    // 初期化
    reset() {
        localStorage.removeItem('the_house_save');
        this.currentSceneId = 'entrance';
        this.visitedScenes = new Set();
        this.unlockedMemories = new Set();
        this.foundObjects = new Set();
        this.flags = {};
        console.log('Progress Reset');
    },

    // フラグの設定
    setFlag(name, value = true) {
        if (name.startsWith('!')) {
            delete this.flags[name.substring(1)];
        } else {
            this.flags[name] = value;
        }
        console.log('Flags:', this.flags);
    },

    // 条件式の評価 (フラグ、記憶、オブジェクトのいずれかに存在すれば真)
    check(condition) {
        if (!condition) return true;
        condition = condition.trim();
        const isNegated = condition.startsWith('!');
        const key = isNegated ? condition.substring(1) : condition;

        // フラグ、解放済みの記憶、発見済みのオブジェクトのいずれかをチェック
        const hasIt = !!this.flags[key] ||
            this.unlockedMemories.has(key) ||
            this.foundObjects.has(key);

        return isNegated ? !hasIt : hasIt;
    },

    update(updates) {
        Object.assign(this, updates);
    }
};
