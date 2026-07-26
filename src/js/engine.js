/**
 * シーン描画と8bit UI制御を担当
 */
import { state } from './state.js';
import { AudioManager } from './audio-manager.js';

export class Engine {
    constructor(loader) {
        this.loader = loader;
        this.currentScene = null;
        this.currentPageIndex = 0;
        this.masterData = { allObjects: [], allMemories: [] };
        this.audio = new AudioManager();
        this.typewriterTimer = null;
        this.isTyping = false;
        this.currentFullHtml = '';
        this.isSubViewActive = false;
        this.currentSubChoices = [];
        this.currentSecPages = [];
        this.currentSecPageIndex = 0;
        
        this.ui = {
            app: document.getElementById('app'),
            selector: document.getElementById('source-selector'),
            title: document.getElementById('scene-title'),
            text: document.getElementById('scene-text'),
            choices: document.getElementById('choices'),
            objects: document.getElementById('object-list'),
            memories: document.getElementById('memory-list'),
            image: document.getElementById('image-pane'),
            overlay: document.getElementById('inspection-overlay'),
            overlayImg: document.getElementById('inspection-image'),
            closeOverlay: document.getElementById('close-overlay')
        };

        if (this.ui.closeOverlay) this.ui.closeOverlay.onclick = () => this.hideOverlay();
        if (this.ui.overlay) {
            this.ui.overlay.onclick = (e) => {
                if (e.target === this.ui.overlay) this.hideOverlay();
            };
        }

        // テキスト枠クリックでタイピングスキップ＆選択肢即表示
        if (this.ui.text) {
            this.ui.text.onclick = () => {
                if (this.isTyping) this.skipTypewriter();
            };
        }
    }

    async init() {
        this.ui.selector.classList.add('hidden');
        this.ui.app.classList.remove('hidden');

        document.body.addEventListener('click', () => this.audio.unlock(), { once: true });

        this.masterData = await this.loader.loadMasterData();
        state.load();
        
        let startId = state.currentSceneId;
        if (startId) {
            try {
                const check = await this.loader.loadScene(startId);
                if (!check) startId = await this.loader.getInitialSceneId();
            } catch (e) {
                startId = await this.loader.getInitialSceneId();
            }
        } else {
            startId = await this.loader.getInitialSceneId();
        }

        await this.render(startId);
        this.refreshIcons();
    }

    refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    showOverlay(src) {
        if (this.ui.overlay && this.ui.overlayImg) {
            this.ui.overlayImg.src = src;
            this.ui.overlay.classList.remove('hidden');
            this.audio.playConfirmSound();
        }
    }

    hideOverlay() {
        if (this.ui.overlay) this.ui.overlay.classList.add('hidden');
    }

    async render(sceneId) {
        this.hideOverlay();
        let scene = null;
        try {
            scene = await this.loader.loadScene(sceneId);
        } catch (e) {
            console.warn(`Scene load failed for ${sceneId}, searching fallback scenes...`, e);
            const fallbacks = ['entrance', 'start', 'station', 'main', 'index', 'intro', 'beginning', 'room1'];
            for (const fb of fallbacks) {
                if (fb === sceneId) continue;
                try {
                    scene = await this.loader.loadScene(fb);
                    sceneId = fb;
                    break;
                } catch (err) {}
            }
        }

        if (!scene) {
            this.ui.title.textContent = "📄 シーンがまだありません";
            this.ui.text.innerHTML = "<p>このVaultにはまだ Markdown シーンファイルが存在しないか、初期シーンが見つかりません。</p><p>Obsidian で <strong>「🔄 キャンバスからMD構築」</strong> ボタンを押してファイルを生成するか、.md ノートを作成してください。</p>";
            this.ui.choices.innerHTML = `<button class="retro-btn" onclick="location.reload()">🔄 トップへ戻る</button>`;
            return;
        }

        this.currentScene = scene;
        this.currentPageIndex = 0;
        this.isSubViewActive = false;
        this.currentSubChoices = [];
        this.currentSecPages = [];
        this.currentSecPageIndex = 0;
        state.visitedScenes.add(sceneId);
        state.recordSceneTransition(sceneId);

        this.ui.title.textContent = scene.title;
        state.save();

        if (scene.bgm) this.audio.playBgm(scene.bgm);

        this.renderPage(0);
        this.renderSidebar();
        this.refreshIcons();
    }

    renderPage(pageIdx) {
        this.currentPageIndex = pageIdx;
        this.isSubViewActive = false;
        this.currentSubChoices = [];
        this.currentSecPages = [];
        this.currentSecPageIndex = 0;
        const pageBranches = (this.currentScene && this.currentScene.pages && this.currentScene.pages[pageIdx]) 
            || (this.currentScene && this.currentScene.mainBranches) 
            || [];

        const mainBranch = pageBranches.find(b => b && state.check(b.condition)) || pageBranches[0] || {};

        const bgImg = mainBranch.image || (this.currentScene ? this.currentScene.image : null);
        if (bgImg) {
            this.ui.image.style.backgroundImage = `url("${bgImg}")`;
        } else {
            this.ui.image.style.backgroundImage = 'none';
        }

        this.showText(mainBranch.text || '');
    }

    /* --- 8bit タイプライターテキスト表示 --- */
    showText(html) {
        if (this.typewriterTimer) {
            clearInterval(this.typewriterTimer);
            this.typewriterTimer = null;
        }

        this.ui.choices.innerHTML = '';
        this.currentFullHtml = html;
        this.ui.text.innerHTML = '';
        this.isTyping = true;

        const tokens = [];
        const regex = /(<[^>]+>)|([^<]+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            if (match[1]) {
                tokens.push({ type: 'tag', content: match[1] });
            } else if (match[2]) {
                tokens.push({ type: 'text', content: match[2] });
            }
        }

        let tokenIndex = 0;
        let charIndex = 0;
        let tempContainer = document.createElement('div');

        this.typewriterTimer = setInterval(() => {
            if (tokenIndex >= tokens.length) {
                this.finishTypewriter();
                return;
            }

            const token = tokens[tokenIndex];
            if (token.type === 'tag') {
                tempContainer.innerHTML += token.content;
                this.ui.text.innerHTML = tempContainer.innerHTML;
                tokenIndex++;
                charIndex = 0;
            } else {
                const char = token.content[charIndex];
                tempContainer.innerHTML += char;
                this.ui.text.innerHTML = tempContainer.innerHTML;
                
                if (char && char.trim() !== '') {
                    this.audio.playBlip();
                }

                charIndex++;
                if (charIndex >= token.content.length) {
                    tokenIndex++;
                    charIndex = 0;
                }
            }
        }, 25);
    }

    skipTypewriter() {
        if (this.typewriterTimer) {
            clearInterval(this.typewriterTimer);
            this.typewriterTimer = null;
        }
        this.ui.text.innerHTML = this.currentFullHtml;
        this.isTyping = false;
        this.renderChoices(this.isSubViewActive);
    }

    finishTypewriter() {
        if (this.typewriterTimer) {
            clearInterval(this.typewriterTimer);
            this.typewriterTimer = null;
        }
        this.ui.text.innerHTML = this.currentFullHtml;
        this.isTyping = false;
        this.renderChoices(this.isSubViewActive);
    }

    renderChoices(isSubView = false) {
        this.isSubViewActive = isSubView;
        this.ui.choices.innerHTML = '';
        
        if (this.isTyping) return;

        if (isSubView) {
            // セクション内でのマルチページ切り替えボタン
            if (this.currentSecPages && this.currentSecPages.length > 1 && this.currentSecPageIndex < this.currentSecPages.length - 1) {
                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = "▶ 次へ [NEXT]";
                nextBtn.style.borderColor = "var(--text-yellow)";
                nextBtn.style.color = "var(--text-yellow)";
                nextBtn.onmouseenter = () => this.audio.playSelectSound();
                nextBtn.onclick = () => {
                    this.audio.playConfirmSound();
                    this.renderSecPage(this.currentSecPageIndex + 1);
                };
                this.ui.choices.appendChild(nextBtn);
                this.refreshIcons();
                return;
            }

            // サブセクションが持っているネスト選択肢をレンダリング！
            const subChoices = this.currentSubChoices || [];
            subChoices.forEach(choice => {
                if (choice.condition && !state.check(choice.condition)) return;
                const button = document.createElement('button');
                button.innerHTML = choice.label;
                button.onmouseenter = () => this.audio.playSelectSound();
                button.onclick = () => {
                    this.audio.playConfirmSound();
                    if (choice.action === 'move') this.render(choice.target);
                    else if (choice.action === 'section') this.handleSectionChoice(choice);
                    else this.handleInteraction(choice);
                };
                this.ui.choices.appendChild(button);
            });

            // 戻るボタンも追加
            const backBtn = document.createElement('button');
            backBtn.textContent = "◀ 戻る [RETURN]";
            backBtn.onmouseenter = () => this.audio.playSelectSound();
            backBtn.onclick = () => {
                this.audio.playConfirmSound();
                this.renderPage(this.currentPageIndex);
                this.hideOverlay();
            };
            this.ui.choices.appendChild(backBtn);
            this.refreshIcons();
            return;
        }

        // ページがまだ残っている場合
        const totalPages = this.currentScene.pages ? this.currentScene.pages.length : 1;
        if (this.currentPageIndex < totalPages - 1) {
            const nextBtn = document.createElement('button');
            nextBtn.innerHTML = "▶ 次へ [NEXT]";
            nextBtn.style.borderColor = "var(--text-yellow)";
            nextBtn.style.color = "var(--text-yellow)";
            nextBtn.onmouseenter = () => this.audio.playSelectSound();
            nextBtn.onclick = () => {
                this.audio.playConfirmSound();
                this.renderPage(this.currentPageIndex + 1);
            };
            this.ui.choices.appendChild(nextBtn);
            this.refreshIcons();
            return;
        }

        // 最終ページに達した場合、移動選択肢・調査選択肢・自動戻るボタンを表示！
        const availableChoices = [...this.currentScene.choices];
        const hasExplicitBack = availableChoices.some(c => c.action === 'move' && c.target === state.previousSceneId);

        if (state.previousSceneId && state.previousSceneId !== state.currentSceneId && !hasExplicitBack) {
            availableChoices.push({
                label: "◀ 戻る [RETURN]",
                action: "move",
                target: state.previousSceneId
            });
        }

        availableChoices.forEach(choice => {
            if (choice.condition && !state.check(choice.condition)) return;
            const button = document.createElement('button');
            button.innerHTML = choice.label;
            button.onmouseenter = () => this.audio.playSelectSound();
            button.onclick = () => {
                this.audio.playConfirmSound();
                if (choice.action === 'move') this.render(choice.target);
                else if (choice.action === 'section') this.handleSectionChoice(choice);
                else this.handleInteraction(choice);
            };
            this.ui.choices.appendChild(button);
        });

        this.refreshIcons();
    }

    renderSecPage(idx) {
        this.currentSecPageIndex = idx;
        const pageText = this.currentSecPages[idx] || '';
        this.showText(pageText);
    }

    handleSectionChoice(choice) {
        this.isSubViewActive = true;
        let secKey = choice.target;
        let sec = (this.currentScene.sections && this.currentScene.sections[secKey]);

        // 完全一致で見つからない場合のあいまい検索フォールバック
        if (!sec && this.currentScene.sections) {
            const allKeys = Object.keys(this.currentScene.sections);
            if (choice.label && this.currentScene.sections[choice.label]) {
                secKey = choice.label;
                sec = this.currentScene.sections[secKey];
            } else {
                const matchedKey = allKeys.find(k => k.includes(secKey) || secKey.includes(k) || (choice.label && (k.includes(choice.label) || choice.label.includes(k))));
                if (matchedKey) {
                    secKey = matchedKey;
                    sec = this.currentScene.sections[secKey];
                }
            }
        }

        if (sec && typeof sec === 'object') {
            this.currentSecPages = sec.pages || [];
            this.currentSecPageIndex = 0;
            this.currentSubChoices = sec.choices || [];
            this.showText(this.currentSecPages[0] || '');
        } else {
            const secText = typeof sec === 'string' ? sec : `<p>${choice.target}</p>`;
            this.currentSecPages = [secText];
            this.currentSecPageIndex = 0;
            this.currentSubChoices = [];
            this.showText(secText);
        }
    }

    handleInteraction(choice) {
        this.isSubViewActive = true;
        this.currentSubChoices = [];
        this.currentSecPages = [];
        this.currentSecPageIndex = 0;
        const branch = choice.branches.find(b => state.check(b.condition)) || choice.branches[0];
        if (branch) {
            if (choice.sfx) this.audio.playSe(choice.sfx);
            else this.audio.playConfirmSound();

            this.showText(branch.text);
            if (choice.itemImage) this.showOverlay(choice.itemImage);
            branch.effects.forEach(flag => state.setFlag(flag));
            if (choice.action === 'memory') state.unlockedMemories.add(choice.id);
            state.save();
            this.renderSidebar();
        }
    }

    async renderMapView() {
        this.hideOverlay();
        this.ui.title.textContent = "PROJECT MAP [8BIT ANALYSIS]";
        
        let html = '<div class="map-view" style="font-family:\'DotGothic16\', monospace; font-size:0.95em;">';
        const sceneIds = ['entrance', 'living', 'garden'];
        html += '<ul style="list-style:none; padding-left:0;">';
        for (const id of sceneIds) {
            const scene = await this.loader.loadScene(id);
            if (!scene) continue;
            html += `<li style="margin-bottom:16px; border-left: 3px double var(--border-color); padding-left:10px;">`;
            html += `<strong style="color:var(--text-yellow); font-size:1.1em;">${scene.title}</strong> [<code>${id}</code>]`;
            html += '<ul style="list-style:none; margin-top:6px; padding-left:10px; color:var(--text-cyan);">';
            scene.choices.filter(c => c.action === 'move').forEach(c => {
                html += `<li style="margin-bottom:4px;">──[[ ${c.label} ]]──> <code>${c.target}</code></li>`;
            });
            scene.choices.filter(c => c.action !== 'move').forEach(c => {
                html += `<li style="margin-bottom:4px;">[SEARCH] ${c.label} (<code>${c.action}:${c.id}</code>)</li>`;
            });
            html += '</ul></li>';
        }
        html += '</ul></div>';
        
        this.showText(html);
        this.refreshIcons();
    }

    renderSidebar() {
        this.renderList(this.ui.objects, this.masterData.allObjects, state.foundObjects);
        this.renderList(this.ui.memories, this.masterData.allMemories, state.unlockedMemories);
    }

    renderList(container, allItems, foundItems) {
        if (!container) return;
        container.innerHTML = '';
        allItems.forEach(item => {
            const div = document.createElement('div');
            const isFound = foundItems.has(item.id);
            div.className = `list-item ${isFound ? 'checked' : 'unchecked'}`;
            div.textContent = isFound ? item.label : '?????';
            container.appendChild(div);
        });
    }
}
