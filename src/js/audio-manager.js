/**
 * 音響管理（BGM・SE）を担当 - [DISABLED]
 */
export class AudioManager {
    constructor() {
        this.statusEl = null; // init後に取得
        this.bgm = null;
        this.updateStatus("無効化済み（システム保護）", "#aaa");
    }

    updateStatus(msg, color = "#aaa") {
        if (!this.statusEl) this.statusEl = document.getElementById('audio-status');
        if (this.statusEl) {
            this.statusEl.textContent = `状態: ${msg}`;
            this.statusEl.style.color = color;
        }
        console.log(`[Audio Status] ${msg}`);
    }

    async unlock() {
        return true;
    }

    async playBgm(src) {
        // 音声機能は現在停止されています
        console.log(`[Audio] BGM Play skipped: ${src}`);
    }

    async playSe(src) {
        // 音声機能は現在停止されています
        console.log(`[Audio] SE Play skipped: ${src}`);
    }

    setVolume(type, val) {
        // 音声機能は現在停止されています
    }
}
