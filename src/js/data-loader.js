/**
 * データ取得の抽象化レイヤー
 */
import yaml from 'js-yaml';
import { marked } from 'marked';

/**
 * 共通のハイライト・分岐処理
 */
function processContent(rawText, state) {
    const match = rawText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`Invalid Markdown format`);

    const frontmatter = yaml.load(match[1]);
    const body = match[2].trim();
    const parts = body.split(/^###\s+/gm);
    const imgRegex = /!\[\[(.*?)(?:\|.*?)?\]\]|!\[.*?\]\((.*?)\)/;
    const imgGlobalRegex = /!\[\[.*?\]\]|!\[.*?\]\(.*?\)/g;

    // メインテキスト処理
    let mainBranches = [];
    if (parts[0].trim().includes('@')) {
        const bParts = parts[0].trim().split(/^@\s+/gm);
        const commonTextRaw = bParts[0].trim();
        const commonImgMatch = commonTextRaw.match(imgRegex);
        const commonImg = commonImgMatch ? (commonImgMatch[1] || commonImgMatch[2]) : null;
        const commonTextClean = commonTextRaw.replace(imgGlobalRegex, '').trim();

        bParts.slice(1).forEach(bP => {
            const bLines = bP.split('\n');
            const bCond = bLines[0].trim();
            const bRest = bLines.slice(1).join('\n').trim();
            const bImgMatch = bRest.match(imgRegex);
            const bRestClean = bRest.replace(imgGlobalRegex, '').trim();
            let html = marked.parse((commonTextClean ? commonTextClean + '\n\n' : '') + bRestClean);
            mainBranches.push({
                condition: bCond,
                text: processHighlights(html, state),
                image: (bImgMatch ? (bImgMatch[1] || bImgMatch[2]) : null) || commonImg
            });
        });
    } else {
        const raw = parts[0].trim();
        const imgMatch = raw.match(imgRegex);
        const clean = raw.replace(imgGlobalRegex, '').trim();
        mainBranches.push({
            condition: null,
            text: processHighlights(marked.parse(clean), state),
            image: imgMatch ? (imgMatch[1] || imgMatch[2]) : null
        });
    }

    // 選択肢処理
    const choices = parts.slice(1).map(block => {
        const lines = block.split('\n');
        const header = lines[0].trim();
        const rest = lines.slice(1).join('\n').trim();
        let choice = { label: header, condition: null, itemImage: null, sfx: null, branches: [], action: 'none' };

        const ifMatch = header.match(/\(if:(.*?)\)/);
        if (ifMatch) { choice.condition = ifMatch[1]; choice.label = header.replace(/\(if:.*?\)/, '').trim(); }

        const sfxMatch = choice.label.match(/\(sfx:(.*?)\)/);
        if (sfxMatch) { choice.sfx = sfxMatch[1]; choice.label = choice.label.replace(/\(sfx:.*?\)/, '').trim(); }

        const moveMatch = choice.label.match(/\[\[(.*?)\|(.*?)\]\]/);
        if (moveMatch) { choice.action = 'move'; choice.target = moveMatch[1]; choice.label = moveMatch[2]; }

        const eventMatch = choice.label.match(/\((.*?):(.*?)\|(.*?)\)/);
        if (eventMatch) { choice.action = eventMatch[1]; choice.id = eventMatch[2]; choice.label = eventMatch[3]; }

        const itemImgMatch = rest.match(imgRegex);
        if (itemImgMatch) choice.itemImage = itemImgMatch[1] || itemImgMatch[2];

        const cleanRest = rest.replace(imgGlobalRegex, '').trim();
        if (cleanRest.includes('@')) {
            const bParts = cleanRest.split(/^@\s+/gm);
            const commonClean = bParts[0].trim().replace(imgGlobalRegex, '');
            bParts.slice(1).forEach(bP => {
                const bLines = bP.split('\n');
                const effects = []; const cleanLines = [];
                bLines.slice(1).join('\n').split('\n').forEach(l => {
                    if (l.trim().startsWith('+')) effects.push(l.trim().substring(1).trim());
                    else cleanLines.push(l);
                });
                choice.branches.push({
                    condition: bLines[0].trim(),
                    text: processHighlights(marked.parse((commonClean ? commonClean + '\n\n' : '') + cleanLines.join('\n').trim()), state),
                    effects: effects
                });
            });
        } else {
            const effects = []; const cleanLines = [];
            cleanRest.split('\n').forEach(l => {
                if (l.trim().startsWith('+')) effects.push(l.trim().substring(1).trim());
                else cleanLines.push(l);
            });
            choice.branches.push({ condition: null, text: processHighlights(marked.parse(cleanLines.join('\n').trim()), state), effects: effects });
        }
        return choice;
    });

    return { ...frontmatter, mainBranches, choices };
}

function processHighlights(html, state) {
    return html.replace(/==([^|]+)\|([^=]+)==/g, (match, cond, txt) => {
        const isUnlocked = state.check(cond);
        return `<span class="${isUnlocked ? 'unlocked' : 'blurred'}" title="${isUnlocked ? '' : '記憶が不足しています'}">${txt}</span>`;
    });
}

/**
 * 抽象ドライバークラス
 */
class BaseDriver {
    async getFile(path) { throw "Not implemented"; }
    resolveAsset(path) { return path; }
}

/**
 * ローカルフォルダ読み込み用 (File System Access API)
 */
export class LocalDriver extends BaseDriver {
    constructor(handle) {
        super();
        this.handle = handle;
    }
    async getFile(filePath) {
        // 例: "data/entrance.md" -> ["data", "entrance.md"]
        const parts = filePath.split('/');
        let current = this.handle;
        for (let i = 0; i < parts.length - 1; i++) {
            current = await current.getDirectoryHandle(parts[i]);
        }
        const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
        const file = await fileHandle.getFile();
        return await file.text();
    }
    async resolveAsset(assetPath) {
        // assets/audio/rain.wav などを Blob URLに変換
        try {
            const parts = assetPath.split('/');
            let current = this.handle;
            for (let i = 0; i < parts.length - 1; i++) {
                current = await current.getDirectoryHandle(parts[i]);
            }
            const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);
        } catch (e) {
            console.error("Asset resolve failed", assetPath, e);
            return assetPath;
        }
    }
}

/**
 * GitHub等リモート読み込み用
 */
export class HttpDriver extends BaseDriver {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    }
    async getFile(path) {
        const res = await fetch(this.baseUrl + path);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${path}`);
        return await res.text();
    }
    resolveAsset(path) {
        return this.baseUrl + path;
    }
}

export class DataLoader {
    constructor(driver, state) {
        this.driver = driver;
        this.state = state;
    }

    async loadScene(sceneId) {
        const raw = await this.driver.getFile(`data/${sceneId}.md`);
        const scene = processContent(raw, this.state);

        // アセットパスを解決
        if (scene.image) scene.image = await this.driver.resolveAsset(scene.image);
        if (scene.bgm) scene.bgm = await this.driver.resolveAsset(`assets/audio/${scene.bgm}`);

        for (const mainB of scene.mainBranches) {
            if (mainB.image) mainB.image = await this.driver.resolveAsset(mainB.image);
        }
        for (const choice of scene.choices) {
            if (choice.itemImage) choice.itemImage = await this.driver.resolveAsset(choice.itemImage);
            if (choice.sfx) choice.sfx = await this.driver.resolveAsset(`assets/audio/${choice.sfx}`);
        }
        return scene;
    }

    async loadMasterData() {
        const text = await this.driver.getFile('data/master.md');
        const data = { allObjects: [], allMemories: [] };
        let category = null;
        text.split('\n').forEach(line => {
            const t = line.trim();
            if (t.startsWith('# Objects')) category = 'allObjects';
            else if (t.startsWith('# Memories')) category = 'allMemories';
            else if (t.startsWith('-') && category) {
                const m = t.match(/^-\s*(.*?):\s*(.*)$/);
                if (m) data[category].push({ id: m[1].trim(), label: m[2].trim() });
            }
        });
        return data;
    }
}
