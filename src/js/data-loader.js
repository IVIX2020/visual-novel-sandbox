/**
 * データ取得の抽象化レイヤー
 */
import yaml from 'js-yaml';
import { marked } from 'marked';

/**
 * ターゲットパスの正規化（例: "vaults/cafe/river.md" -> "river"）
 */
function normalizeTarget(rawPath) {
    if (!rawPath) return '';
    let filename = rawPath.split('/').pop();
    filename = filename.replace(/\.md$/i, '');
    return filename.trim();
}

/**
 * 共通のハイライト・分岐処理
 */
function processContent(rawText, state) {
    let frontmatter = {};
    let body = rawText;

    // Frontmatterのパース（オプショナル）
    const match = rawText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
        try {
            frontmatter = yaml.load(match[1]) || {};
        } catch (e) {
            console.warn("Frontmatter parse warning:", e);
        }
        body = match[2];
    }

    body = body.trim();

    // セクション (## や ### の見出しブロック) の辞書化（^##+\s+ で分割）
    const sections = {};
    const sectionBlocks = body.split(/^##+\s+/gm);
    sectionBlocks.slice(1).forEach(block => {
        const lines = block.split('\n');
        const secTitle = lines[0].trim().replace(/\(.*\)/, '').replace(/^#+\s*/, '').trim();
        const secBody = lines.slice(1).join('\n').trim();

        // セクション内部のWikiLink抽出
        const secChoices = [];
        const secWikiRegex = /(?:^|[^\!])\[\[([^|]+?)(?:\|([^\]]+?))?\]\]/g;
        let secMatch;
        while ((secMatch = secWikiRegex.exec(secBody)) !== null) {
            const rawTarget = secMatch[1].trim();
            const rawLabel = secMatch[2] ? secMatch[2].trim() : null;
            let action = 'move';
            let target = rawTarget;
            if (rawTarget.startsWith('#')) {
                action = 'section';
                target = rawTarget.replace(/^#+\s*/, '').trim();
            } else {
                target = normalizeTarget(rawTarget);
            }
            secChoices.push({
                label: rawLabel || target,
                action: action,
                target: target,
                condition: null,
                itemImage: null,
                sfx: null,
                branches: []
            });
        }

        // セクション内部の --- によるページ分割
        const secPagesRaw = secBody.split(/^\s*(?:---|\*\*\*|___)\s*$/gm).map(s => s.trim()).filter(Boolean);
        const parsedSecPages = secPagesRaw.map(pText => {
            const cleanSecBody = pText.replace(/(?:^|[^\!])\[\[([^|]+?)(?:\|([^\]]+?))?\]\]/g, '').trim();
            return processHighlights(marked.parse(cleanSecBody), state);
        });

        sections[secTitle] = {
            pages: parsedSecPages,
            choices: secChoices
        };
    });

    // H2以上の見出し (^##+\s+) で本編とサブ見出しブロックを切り分け
    const parts = body.split(/^##+\s+/gm);
    const imgRegex = /!\[\[(.*?)(?:\|.*?)?\]\]|!\[.*?\]\((.*?)\)/;
    const imgGlobalRegex = /!\[\[.*?\]\]|!\[.*?\]\(.*?\)/g;

    // 先頭の # メインタイトル行を除去して純粋なメイン本文を取得
    let mainContentPart = parts[0].replace(/^#\s+.*$/m, '').trim();

    // 水平線 (--- や ***) による自然なページ送りの分割チェック
    const pagesRaw = mainContentPart.split(/^\s*(?:---|\*\*\*|___)\s*$/gm).map(s => s.trim()).filter(Boolean);

    // 本文中のWikiLink ([[...]]) を自動抽出して選択肢に変換
    const inlineChoices = [];
    const wikiLinkRegex = /(?:^|[^\!])\[\[([^|]+?)(?:\|([^\]]+?))?\]\]/g;
    
    let wMatch;
    while ((wMatch = wikiLinkRegex.exec(mainContentPart)) !== null) {
        const rawTarget = wMatch[1].trim();
        const rawLabel = wMatch[2] ? wMatch[2].trim() : null;
        
        let action = 'move';
        let target = rawTarget;
        if (rawTarget.startsWith('#')) {
            action = 'section';
            target = rawTarget.replace(/^#+\s*/, '').trim();
        } else {
            target = normalizeTarget(rawTarget);
        }

        const label = rawLabel || target;

        inlineChoices.push({
            label: label,
            action: action,
            target: target,
            condition: null,
            itemImage: null,
            sfx: null,
            branches: []
        });
    }

    // 選択肢処理（### 見出しからの抽出）
    const headerChoices = [];
    parts.slice(1).forEach(block => {
        const lines = block.split('\n');
        const header = lines[0].trim();
        const rest = lines.slice(1).join('\n').trim();

        const secName = header.replace(/\(.*\)/, '').replace(/^#+\s*/, '').trim();
        if (sections[secName] && !header.includes('[[')) {
            return;
        }

        let choice = { label: header, condition: null, itemImage: null, sfx: null, branches: [], action: 'none' };

        const ifMatch = header.match(/\(if:(.*?)\)/);
        if (ifMatch) { choice.condition = ifMatch[1]; choice.label = header.replace(/\(if:.*?\)/, '').trim(); }

        const sfxMatch = choice.label.match(/\(sfx:(.*?)\)/);
        if (sfxMatch) { choice.sfx = sfxMatch[1]; choice.label = choice.label.replace(/\(sfx:.*?\)/, '').trim(); }

        const moveMatch = choice.label.match(/\[\[(.*?)\|(.*?)\]\]/);
        if (moveMatch) {
            const rawTarget = moveMatch[1].trim();
            if (rawTarget.startsWith('#')) {
                choice.action = 'section';
                choice.target = rawTarget.replace(/^#+\s*/, '').trim();
            } else {
                choice.action = 'move';
                choice.target = normalizeTarget(rawTarget);
            }
            choice.label = moveMatch[2];
        }

        const simpleMoveMatch = choice.label.match(/\[\[(.*?)\]\]/);
        if (!moveMatch && simpleMoveMatch) {
            const rawTarget = simpleMoveMatch[1].trim();
            if (rawTarget.startsWith('#')) {
                choice.action = 'section';
                choice.target = rawTarget.replace(/^#+\s*/, '').trim();
            } else {
                choice.action = 'move';
                choice.target = normalizeTarget(simpleMoveMatch[1]);
            }
            choice.label = choice.target;
        }

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
        
        if (choice.action !== 'none') {
            headerChoices.push(choice);
        }
    });

    // 重複選択肢のデデュープ
    const choicesMap = new Map();
    [...inlineChoices, ...headerChoices].forEach(c => {
        const key = `${c.action}:${c.target}:${c.label}`;
        if (!choicesMap.has(key)) {
            choicesMap.set(key, c);
        }
    });
    const choices = Array.from(choicesMap.values());

    // ページのビルド処理
    const parsedPages = pagesRaw.map((pageText) => {
        const cleanedPageText = pageText.replace(/(?:^|[^\!])\[\[([^|]+?)(?:\|([^\]]+?))?\]\]/g, '').trim();
        
        let pageBranches = [];
        if (cleanedPageText.includes('@')) {
            const bParts = cleanedPageText.split(/^@\s+/gm);
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
                pageBranches.push({
                    condition: bCond,
                    text: processHighlights(html, state),
                    image: (bImgMatch ? (bImgMatch[1] || bImgMatch[2]) : null) || commonImg
                });
            });
        } else {
            const imgMatch = cleanedPageText.match(imgRegex);
            const clean = cleanedPageText.replace(imgGlobalRegex, '').trim();
            pageBranches.push({
                condition: null,
                text: processHighlights(marked.parse(clean), state),
                image: imgMatch ? (imgMatch[1] || imgMatch[2]) : null
            });
        }
        return pageBranches;
    });

    return {
        title: frontmatter.title || '無題',
        isStart: !!(frontmatter.start || frontmatter.initial),
        sections,
        ...frontmatter,
        pages: parsedPages,
        mainBranches: parsedPages[0] || [],
        choices
    };
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
    async listMarkdownFiles() { return []; }
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
        const parts = filePath.split('/');
        let current = this.handle;
        for (let i = 0; i < parts.length - 1; i++) {
            current = await current.getDirectoryHandle(parts[i]);
        }
        const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
        const file = await fileHandle.getFile();
        return await file.text();
    }
    async listMarkdownFiles() {
        const files = [];
        try {
            for await (const entry of this.handle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                    files.push(entry.name);
                }
            }
        } catch (e) {
            console.warn("Directory handle list failed", e);
        }
        return files.sort();
    }
    async resolveAsset(assetPath) {
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
 * リモート/HTTP用ドライバー
 */
export class HttpDriver extends BaseDriver {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    }
    async getFile(path) {
        const fullUrl = encodeURI(this.baseUrl + path);
        const res = await fetch(fullUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${fullUrl}`);
        const buffer = await res.arrayBuffer();
        const text = new TextDecoder('utf-8').decode(buffer);
        if (text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html')) {
            throw new Error(`File not found (returned SPA HTML fallback): ${path}`);
        }
        return text;
    }
    async listMarkdownFiles() {
        try {
            const fullUrl = encodeURI(this.baseUrl + 'files.json');
            const res = await fetch(fullUrl);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {}
        return [];
    }
    resolveAsset(path) {
        return encodeURI(this.baseUrl + path);
    }
}

export class DataLoader {
    constructor(driver, state) {
        this.driver = driver;
        this.state = state;
    }

    async getFileWithFallback(targetName) {
        const cleanName = targetName.replace(/^data\//, '');
        const candidates = [cleanName, `data/${cleanName}`];

        let lastErr = null;
        for (const path of candidates) {
            try {
                return await this.driver.getFile(path);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error(`File not found: ${targetName}`);
    }

    async getInitialSceneId() {
        const master = await this.loadMasterData();
        if (master && master.startScene) {
            return master.startScene;
        }

        const files = await this.driver.listMarkdownFiles();
        const validFiles = files
            .filter(f => f.toLowerCase() !== 'master.md' && f.toLowerCase() !== 'readme.md')
            .map(f => normalizeTarget(f));

        if (validFiles.length > 0) {
            for (const sceneId of validFiles) {
                try {
                    const scene = await this.loadScene(sceneId);
                    if (scene && scene.isStart) return sceneId;
                } catch (e) {}
            }
            return validFiles[0];
        }

        return 'entrance';
    }

    async loadScene(sceneId) {
        try {
            const raw = await this.getFileWithFallback(`${sceneId}.md`);
            if (!raw) return null;

            const scene = processContent(raw, this.state);
            if (!scene) return null;

            if (scene.image) scene.image = await this.driver.resolveAsset(scene.image);
            if (scene.bgm) scene.bgm = await this.driver.resolveAsset(`assets/audio/${scene.bgm}`);

            if (Array.isArray(scene.pages)) {
                for (const pageBranches of scene.pages) {
                    if (Array.isArray(pageBranches)) {
                        for (const b of pageBranches) {
                            if (b && b.image) b.image = await this.driver.resolveAsset(b.image);
                        }
                    }
                }
            }
            if (Array.isArray(scene.choices)) {
                for (const choice of scene.choices) {
                    if (choice) {
                        if (choice.itemImage) choice.itemImage = await this.driver.resolveAsset(choice.itemImage);
                        if (choice.sfx) choice.sfx = await this.driver.resolveAsset(`assets/audio/${choice.sfx}`);
                    }
                }
            }
            return scene;
        } catch (e) {
            console.warn(`Failed to load scene "${sceneId}":`, e);
            return null;
        }
    }

    async loadMasterData() {
        try {
            const text = await this.getFileWithFallback('master.md');
            const data = { allObjects: [], allMemories: [], startScene: null };
            let category = null;
            text.split('\n').forEach(line => {
                const t = line.trim();
                const startMatch = t.match(/^start(?:_scene)?:\s*(.*)$/i);
                if (startMatch) {
                    data.startScene = normalizeTarget(startMatch[1]);
                }
                if (t.startsWith('# Objects') || t.startsWith('## Objects')) category = 'allObjects';
                else if (t.startsWith('# Memories') || t.startsWith('## Memories')) category = 'allMemories';
                else if (t.startsWith('-') && category) {
                    const m = t.match(/^-\s*(.*?):\s*(.*)$/);
                    if (m) data[category].push({ id: m[1].trim(), label: m[2].trim() });
                }
            });
            return data;
        } catch (e) {
            console.warn("master.md load skipped/not found:", e);
            return { allObjects: [], allMemories: [], startScene: null };
        }
    }
}
