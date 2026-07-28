/**
 * ゲームのグローバルな状態管理
 */
export const state = {
    currentSceneId: 'entrance',
    previousSceneId: null,
    historyStack: [],
    visitedScenes: new Set(),
    unlockedMemories: new Set(),
    foundObjects: new Set(),
    flags: {}, // 汎用フラグ

    recordSceneTransition(newSceneId) {
        if (this.currentSceneId && this.currentSceneId !== newSceneId) {
            this.previousSceneId = this.currentSceneId;
            this.historyStack.push(this.currentSceneId);
        }
        this.currentSceneId = newSceneId;
    },

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
        this.currentSceneId = null;
        this.previousSceneId = null;
        this.historyStack = [];
        this.visitedScenes = new Set();
        this.unlockedMemories = new Set();
        this.foundObjects = new Set();
        this.flags = {};
        console.log('Progress Reset');
    },

    masterObjectsKeys: new Set(),
    masterMemoriesKeys: new Set(),

    setMasterData(masterData) {
        if (!masterData) return;
        this.masterObjectsKeys = new Set((masterData.allObjects || []).map(o => o.key));
        this.masterMemoriesKeys = new Set((masterData.allMemories || []).map(m => m.key));
    },

    // フラグの設定
    setFlag(name, value = true) {
        if (!name) return;
        const rawName = name.trim();
        if (rawName.startsWith('!')) {
            const key = rawName.substring(1).replace(/^(memory|item):/, '').trim();
            delete this.flags[key];
            delete this.flags[rawName.substring(1)];
            this.unlockedMemories.delete(key);
            this.foundObjects.delete(key);
        } else {
            const cleanKey = rawName.replace(/^(memory|item):/, '').trim();
            this.flags[cleanKey] = value;
            this.flags[rawName] = value;

            if (rawName.startsWith('memory:')) {
                this.unlockedMemories.add(cleanKey);
            } else if (rawName.startsWith('item:')) {
                this.foundObjects.add(cleanKey);
            } else {
                // マスター目録の定義を参照して確実に分離
                if (this.masterMemoriesKeys.has(cleanKey)) {
                    this.unlockedMemories.add(cleanKey);
                } else if (this.masterObjectsKeys.has(cleanKey)) {
                    this.foundObjects.add(cleanKey);
                } else {
                    // 定義がない場合は汎用フラグとして記録
                    this.flags[cleanKey] = value;
                }
            }
        }
        if (typeof this.onChange === 'function') {
            this.onChange();
        }
        console.log('Flags:', this.flags, 'FoundObjects:', Array.from(this.foundObjects), 'UnlockedMemories:', Array.from(this.unlockedMemories));
    },

    // 条件式の評価 (フラグ、記憶、オブジェクトのいずれかに存在すれば真)
    check(condition) {
        if (!condition) return true;
        const conds = condition.trim().split(/[,&]/).map(c => c.trim()).filter(Boolean);
        return conds.every(cond => {
            const isNegated = cond.startsWith('!');
            const rawKey = isNegated ? cond.substring(1) : cond;
            const cleanKey = rawKey.replace(/^#/, '').replace(/^(memory|item):/, '').trim();
            
            const hasIt = !!this.flags[cleanKey] ||
                !!this.flags[rawKey] ||
                this.unlockedMemories.has(cleanKey) ||
                this.foundObjects.has(cleanKey);

            return isNegated ? !hasIt : hasIt;
        });
    },

    update(updates) {
        Object.assign(this, updates);
    }
};
