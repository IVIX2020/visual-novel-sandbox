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
 * Callout ( > [!item] key や > [!memory] key ) の自動処理とHTML置換
 * ※ 注意: ファイルパース時にはフラグをセットせず、data-flag 属性を埋め込み、画面表示時にのみ発動させる！
 */
function processCalloutsAndMarkup(text, state) {
    if (!text) return '';

    let processed = text.replace(/^>\s*\[\!(item|memory|info|note|warning)\]\s*(.*?)\n((?:^>.*(?:\n|$))*)/gmi, (match, type, title, contentLines) => {
        const key = title.trim();
        const cleanContent = contentLines.replace(/^>\s?/gm, '').trim();
        const typeLower = type.toLowerCase();
        const isItem = typeLower === 'item';
        const isMemory = typeLower === 'memory';
        const icon = isItem ? '📦' : (isMemory ? '🧠' : '💬');
        const badgeLabel = isItem ? 'ITEM GET' : (isMemory ? 'MEMORY UNLOCKED' : 'NOTE');
        const flagAttr = (isItem ? 'item:' : (isMemory ? 'memory:' : '')) + key;

        const parsedContent = cleanContent ? marked.parse(cleanContent) : '';

        return `<div class="callout callout-${typeLower}" data-flag="${flagAttr}">
            <div class="callout-header">
                <span class="callout-icon">${icon}</span>
                <span class="callout-badge">${badgeLabel}</span>
                <strong class="callout-title">${key}</strong>
            </div>
            ${parsedContent ? `<div class="callout-content">${parsedContent}</div>` : ''}
        </div>\n`;
    });

    return processed;
}

/**
 * 共通のハイライト・伏字・ブラー処理
 */
function processHighlights(html, state) {
    if (!html) return '';
    return html.replace(/==(#?\w+)[|:\s]?([\s\S]*?)==/g, (match, rawCond, txt) => {
        const cond = rawCond.replace(/^#/, '').trim();
        const isUnlocked = state ? state.check(cond) : false;
        return `<span class="${isUnlocked ? 'unlocked' : 'blurred'}" title="${isUnlocked ? '' : '記憶またはアイテムが必要です'}">${txt.trim()}</span>`;
    });
}

/**
 * 共通テキストパース
 */
function parseTextToHtml(rawText, state) {
    const textWithCallouts = processCalloutsAndMarkup(rawText, state);
    const html = marked.parse(textWithCallouts);
    return processHighlights(html, state);
}

/**
 * 1行の文字列からWikiLink・タスク条件・タグ条件・(if:)条件をパースする確定関数
 */
function parseChoiceFromLine(line) {
    let working = line.trim();

    // 画像埋め込み (![[...]]) は選択肢から完全除外
    if (/!\[\[|!\[.*?\]\(.*?\)/.test(working)) {
        return { label: '', action: 'none', target: null, id: null, condition: null, sfx: null };
    }

    // 文頭のリスト記号 (- , * , + ) を除去
    working = working.replace(/^[-*+]\s*/, '').trim();

    let condition = null;
    let sfx = null;
    let action = 'none';
    let target = null;
    let label = '';
    let id = null;

    const conditionsList = [];

    // 1. タスクリスト形式の条件 [!key] または [key]
    working = working.replace(/^\[([^\[\]\s]+)\]/i, (match, taskCond) => {
        if (taskCond && taskCond !== ' ' && taskCond !== 'x') {
            conditionsList.push(taskCond.trim());
        }
        return '';
    }).trim();

    // 2. タグ形式の条件 #if/!key や #if/key
    working = working.replace(/#if\/([^\s]+)/gi, (match, tagCond) => {
        if (tagCond) conditionsList.push(tagCond.trim());
        return '';
    }).trim();

    // 3. (if:...) 条件の抽出
    working = working.replace(/\(if:\s*(.*?)\)/gi, (match, ifCond) => {
        if (ifCond) conditionsList.push(ifCond.trim());
        return '';
    }).trim();

    if (conditionsList.length > 0) {
        condition = conditionsList.join(',');
    }

    // 4. (sfx:...) 効果音
    const sfxMatch = working.match(/\(sfx:\s*(.*?)\)/i);
    if (sfxMatch) {
        sfx = sfxMatch[1].trim();
        working = working.replace(/\(sfx:\s*.*?\)/i, '').trim();
    }

    // 5. 旧イベント記法 (item:id|label) / (memory:id|label)
    const eventMatch = working.match(/\((item|memory|event):\s*([^|]+)\|([^)]+)\)/i);
    if (eventMatch) {
        action = eventMatch[1].toLowerCase();
        id = eventMatch[2].trim();
        label = eventMatch[3].trim();
    } else {
        // 6. WikiLink [[target|label]] または [[target]]
        const wikiMatch = working.match(/\[\[([^\]]+)\]\]/);
        if (wikiMatch) {
            const fullInner = wikiMatch[1].trim();
            if (fullInner.includes('|')) {
                const parts = fullInner.split('|');
                const rawTarget = parts[0].trim();
                label = parts[1].trim();
                if (rawTarget.startsWith('#')) {
                    action = 'section';
                    target = rawTarget.replace(/^#+\s*/, '').trim();
                } else {
                    action = 'move';
                    target = normalizeTarget(rawTarget);
                }
            } else {
                const rawTarget = fullInner;
                if (rawTarget.startsWith('#')) {
                    action = 'section';
                    target = rawTarget.replace(/^#+\s*/, '').trim();
                } else {
                    action = 'move';
                    target = normalizeTarget(rawTarget);
                }
                label = target;
            }
        }
    }

    if (!label) {
        label = working.replace(/^#+\s*/, '').trim();
    }

    return { label, action, target, id, condition, sfx };
}

function processContent(rawText, state) {
    let frontmatter = {};
    let body = rawText;

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

    const sections = {};
    const sectionBlocks = body.split(/^##+\s+/gm);
    sectionBlocks.slice(1).forEach(block => {
        const lines = block.split('\n');
        const secTitle = lines[0].trim().replace(/\(.*\)/g, '').replace(/^#+\s*/, '').trim();
        const secBody = lines.slice(1).join('\n').trim();

        const secChoices = [];
        const secLines = secBody.split('\n');
        secLines.forEach(line => {
            if (/(?:^|[^\!])\[\[/.test(line)) {
                const parsed = parseChoiceFromLine(line);
                if (parsed.action !== 'none') {
                    secChoices.push({
                        ...parsed,
                        itemImage: null,
                        branches: []
                    });
                }
            }
        });

        const secPagesRaw = secBody.split(/^\s*(?:---|\*\*\*|___)\s*$/gm).map(s => s.trim()).filter(Boolean);
        const parsedSecPages = secPagesRaw.map(pText => {
            const textWithoutChoices = pText.split('\n').filter(l => !/(?:^|[^\!])\[\[/.test(l)).join('\n').trim();
            return parseTextToHtml(textWithoutChoices, state);
        });

        sections[secTitle] = {
            pages: parsedSecPages,
            choices: secChoices
        };
    });

    const parts = body.split(/^##+\s+/gm);
    const imgRegex = /!\[\[(.*?)(?:\|.*?)?\]\]|!\[.*?\]\((.*?)\)/;
    const imgGlobalRegex = /!\[\[.*?\]\]|!\[.*?\]\(.*?\)/g;

    let mainContentPart = parts[0].replace(/^#\s+.*$/m, '').trim();
    const pagesRaw = mainContentPart.split(/^\s*(?:---|\*\*\*|___)\s*$/gm).map(s => s.trim()).filter(Boolean);

    const inlineChoices = [];
    const mainLines = mainContentPart.split('\n');
    mainLines.forEach(line => {
        if (/(?:^|[^\!])\[\[/.test(line)) {
            const parsed = parseChoiceFromLine(line);
            if (parsed.action !== 'none') {
                inlineChoices.push({
                    ...parsed,
                    itemImage: null,
                    branches: []
                });
            }
        }
    });

    const headerChoices = [];
    parts.slice(1).forEach(block => {
        const lines = block.split('\n');
        const header = lines[0].trim();
        const rest = lines.slice(1).join('\n').trim();

        const secName = header.replace(/\(.*\)/g, '').replace(/^#+\s*/, '').trim();
        if (sections[secName] && !header.includes('[[')) {
            return;
        }

        const parsedHeader = parseChoiceFromLine(header);
        const itemImgMatch = rest.match(imgRegex);
        const itemImage = itemImgMatch ? (itemImgMatch[1] || itemImgMatch[2]) : null;

        const branches = [];
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
                branches.push({
                    condition: bLines[0].trim(),
                    text: parseTextToHtml((commonClean ? commonClean + '\n\n' : '') + cleanLines.join('\n').trim(), state),
                    effects: effects
                });
            });
        } else {
            const effects = []; const cleanLines = [];
            cleanRest.split('\n').forEach(l => {
                if (l.trim().startsWith('+')) effects.push(l.trim().substring(1).trim());
                else cleanLines.push(l);
            });
            branches.push({ condition: null, text: parseTextToHtml(cleanRest, state), effects: effects });
        }

        let choice = { ...parsedHeader, itemImage, branches };
        if (choice.action !== 'none') {
            headerChoices.push(choice);
        }
    });

    const choicesMap = new Map();
    [...inlineChoices, ...headerChoices].forEach(c => {
        const key = `${c.action}:${c.target}:${c.label}`;
        if (!choicesMap.has(key)) {
            choicesMap.set(key, c);
        }
    });
    const choices = Array.from(choicesMap.values());

    const parsedPages = pagesRaw.map((pageText) => {
        const textWithoutChoices = pageText.split('\n').filter(l => !/(?:^|[^\!])\[\[/.test(l)).join('\n').trim();
        
        let pageBranches = [];
        if (textWithoutChoices.includes('@')) {
            const bParts = textWithoutChoices.split(/^@\s+/gm);
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
                let html = parseTextToHtml((commonTextClean ? commonTextClean + '\n\n' : '') + bRestClean, state);
                pageBranches.push({
                    condition: bCond,
                    text: html,
                    image: (bImgMatch ? (bImgMatch[1] || bImgMatch[2]) : null) || commonImg
                });
            });
        } else {
            const imgMatch = textWithoutChoices.match(imgRegex);
            const clean = textWithoutChoices.replace(imgGlobalRegex, '').trim();
            pageBranches.push({
                condition: null,
                text: parseTextToHtml(clean, state),
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

class BaseDriver {
    async getFile(path) { throw "Not implemented"; }
    async listMarkdownFiles() { return []; }
    resolveAsset(path) { return path; }
}

export class DirectoryHandleDriver extends BaseDriver {
    constructor(handle) {
        super();
        this.handle = handle;
    }
    async getFile(path) {
        const parts = path.split('/');
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

export class LocalDriver extends DirectoryHandleDriver {}

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

    async loadMasterData() {
        try {
            const text = await this.driver.getFile('master.md');
            const allObjects = [];
            const allMemories = [];

            let currentSection = null;
            text.split('\n').forEach(line => {
                line = line.trim();
                if (line.startsWith('## Objects')) {
                    currentSection = 'objects';
                } else if (line.startsWith('## Memories')) {
                    currentSection = 'memories';
                } else if (line.startsWith('- ')) {
                    const itemStr = line.substring(2).trim();
                    const colonIdx = itemStr.lastIndexOf(':');
                    if (colonIdx !== -1) {
                        let rawKey = itemStr.substring(0, colonIdx).trim();
                        const label = itemStr.substring(colonIdx + 1).trim();
                        
                        // プレフィックス (memory: や item:) を綺麗に除去して正規化キーにする
                        const cleanKey = rawKey.replace(/^(memory|item):/, '').trim();
                        
                        if (currentSection === 'objects') allObjects.push({ key: cleanKey, label });
                        if (currentSection === 'memories') allMemories.push({ key: cleanKey, label });
                    }
                }
            });

            return { allObjects, allMemories };
        } catch (e) {
            console.warn("Master index (master.md) load failed", e);
            return { allObjects: [], allMemories: [] };
        }
    }

    async loadMasterIndex() {
        return this.loadMasterData();
    }

    async getInitialSceneId() {
        return this.findStartSceneId();
    }

    async findStartSceneId() {
        const mdFiles = await this.driver.listMarkdownFiles();
        for (const file of mdFiles) {
            try {
                const text = await this.driver.getFile(file);
                if (text.match(/start:\s*true/i) || text.match(/initial:\s*true/i)) {
                    return file.replace(/\.md$/i, '');
                }
            } catch (e) {}
        }
        return mdFiles.length > 0 ? mdFiles[0].replace(/\.md$/i, '') : 'entrance';
    }

    async loadScene(sceneId) {
        const path = `${sceneId}.md`;
        const text = await this.driver.getFile(path);
        const scene = processContent(text, this.state);
        scene.id = sceneId;

        if (scene.image) scene.image = await this.driver.resolveAsset(scene.image);
        if (scene.bgm) scene.bgm = await this.driver.resolveAsset(`assets/audio/${scene.bgm}`);
        
        if (scene.pages) {
            for (const page of scene.pages) {
                if (Array.isArray(page)) {
                    for (const branch of page) {
                        if (branch && branch.image) {
                            branch.image = await this.driver.resolveAsset(branch.image);
                        }
                    }
                }
            }
        }
        if (scene.mainBranches) {
            for (const branch of scene.mainBranches) {
                if (branch && branch.image) {
                    branch.image = await this.driver.resolveAsset(branch.image);
                }
            }
        }

        for (const choice of scene.choices) {
            if (choice.itemImage) choice.itemImage = await this.driver.resolveAsset(choice.itemImage);
            if (choice.sfx) choice.sfx = await this.driver.resolveAsset(`assets/audio/${choice.sfx}`);
        }

        return scene;
    }
}
