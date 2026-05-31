/**
 * シーン描画とUI制御を担当
 */
import { state } from './state.js';
import { AudioManager } from './audio-manager.js';

export class Engine {
    constructor(loader) {
        this.loader = loader;
        this.currentScene = null;
        this.masterData = { allObjects: [], allMemories: [] };
        this.audio = new AudioManager();
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
    }

    async init() {
        this.ui.selector.classList.add('hidden');
        this.ui.app.classList.remove('hidden');

        this.masterData = await this.loader.loadMasterData();
        state.load();
        await this.render(state.currentSceneId || 'entrance');
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
        }
    }

    hideOverlay() {
        if (this.ui.overlay) this.ui.overlay.classList.add('hidden');
    }

    async render(sceneId) {
        this.hideOverlay();
        const scene = await this.loader.loadScene(sceneId);
        if (!scene) return;

        this.currentScene = scene;
        state.visitedScenes.add(sceneId);
        state.currentSceneId = sceneId;

        this.ui.title.textContent = scene.title;
        state.save();

        if (scene.bgm) this.audio.playBgm(scene.bgm);

        const mainBranch = scene.mainBranches.find(b => state.check(b.condition)) || scene.mainBranches[0];
        this.showText(mainBranch.text);

        const bgImg = mainBranch.image || scene.image;
        if (bgImg) {
            this.ui.image.style.backgroundImage = `url("${bgImg}")`;
        } else {
            this.ui.image.style.backgroundImage = 'none';
        }

        this.renderChoices();
        this.renderSidebar();
        this.refreshIcons();
    }

    showText(html) {
        this.ui.text.innerHTML = html;
    }

    renderChoices(isSubView = false) {
        this.ui.choices.innerHTML = '';
        if (isSubView) {
            const backBtn = document.createElement('button');
            backBtn.textContent = "← 戻る";
            backBtn.onclick = () => {
                const mainBranch = this.currentScene.mainBranches.find(b => state.check(b.condition)) || this.currentScene.mainBranches[0];
                this.showText(mainBranch.text);
                this.renderChoices(false);
                this.hideOverlay();
            };
            this.ui.choices.appendChild(backBtn);
        } else {
            this.currentScene.choices.forEach(choice => {
                if (choice.condition && !state.check(choice.condition)) return;
                const button = document.createElement('button');
                button.innerHTML = choice.label;
                button.onclick = () => {
                    if (choice.action === 'move') this.render(choice.target);
                    else this.handleInteraction(choice);
                };
                this.ui.choices.appendChild(button);
            });
        }
        this.refreshIcons();
    }

    handleInteraction(choice) {
        const branch = choice.branches.find(b => state.check(b.condition)) || choice.branches[0];
        if (branch) {
            if (choice.sfx) this.audio.playSe(choice.sfx);
            this.showText(branch.text);
            if (choice.itemImage) this.showOverlay(choice.itemImage);
            this.renderChoices(true);
            branch.effects.forEach(flag => state.setFlag(flag));
            if (choice.action === 'memory') state.unlockedMemories.add(choice.id);
            state.save();
            this.renderSidebar();
        }
    }

    async renderMapView() {
        this.hideOverlay();
        this.ui.title.textContent = "Project Map (Analysis)";
        this.ui.text.innerHTML = "解析中...";
        let html = '<div class="map-view" style="font-family:monospace; font-size:0.9em;">';
        const sceneIds = ['entrance', 'living', 'garden'];
        html += '<ul style="list-style:none; padding-left:0;">';
        for (const id of sceneIds) {
            const scene = await this.loader.loadScene(id);
            if (!scene) continue;
            html += `<li style="margin-bottom:24px; border-left: 2px solid #444; padding-left:12px;">`;
            html += `<strong style="color:#4a9eff; font-size:1.1em;">${scene.title}</strong> (<code>${id}</code>)`;
            html += '<ul style="list-style:none; margin-top:8px; padding-left:12px; color:#aaa;">';
            scene.choices.filter(c => c.action === 'move').forEach(c => {
                html += `<li style="margin-bottom:4px;">──[[ ${c.label} ]]──> <code>${c.target}</code></li>`;
            });
            scene.choices.filter(c => c.action !== 'move').forEach(c => {
                html += `<li style="margin-bottom:4px;">[調査] ${c.label} (<code>${c.action}:${c.id}</code>)</li>`;
            });
            html += '</ul></li>';
        }
        html += '</ul></div>';
        this.ui.text.innerHTML = html;
        this.renderChoices(true);
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
