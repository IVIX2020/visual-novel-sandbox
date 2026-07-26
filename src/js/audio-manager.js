/**
 * 8bit音響管理 (Web Audio API 合成ビープ音 & BGM/SE)
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.bgmVolume = 0.15;
        this.seVolume = 0.5;
        this.isUnlocked = false;
        this.statusEl = null;
    }

    initCtx() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.isUnlocked = true;
                this.updateStatus("有効", "#55ff55");
            }
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
            this.isUnlocked = true;
            this.updateStatus("有効", "#55ff55");
        }
    }

    updateStatus(msg, color = "#aaa") {
        if (!this.statusEl) this.statusEl = document.getElementById('audio-status');
        if (this.statusEl) {
            this.statusEl.textContent = `状態: ${msg}`;
            this.statusEl.style.color = color;
        }
    }

    async unlock() {
        this.initCtx();
        return this.isUnlocked;
    }

    /* --- 8bitビープ音合成機能 --- */
    playBeep(freq, duration = 0.05, type = 'square', startGain = 0.1) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            gain.gain.setValueAtTime(startGain * this.seVolume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Beep audio error:", e);
        }
    }

    // 文字タイピング音 (パチッ)
    playBlip() {
        if (!this.isUnlocked) return;
        const freq = 600 + Math.random() * 200;
        this.playBeep(freq, 0.03, 'triangle', 0.05);
    }

    // 選択肢移動・ホバー音 (ピッ)
    playSelectSound() {
        if (!this.isUnlocked) return;
        this.playBeep(880, 0.04, 'square', 0.08);
    }

    // 決定音 (ピロリーン)
    playConfirmSound() {
        if (!this.isUnlocked) return;
        this.playBeep(523.25, 0.06, 'square', 0.1); // C5
        setTimeout(() => this.playBeep(659.25, 0.06, 'square', 0.1), 60); // E5
        setTimeout(() => this.playBeep(783.99, 0.1, 'square', 0.1), 120); // G5
    }

    async playBgm(src) {
        console.log(`[8bit Audio] BGM: ${src}`);
    }

    async playSe(src) {
        this.playConfirmSound();
    }

    setVolume(type, val) {
        if (type === 'bgm') this.bgmVolume = parseFloat(val);
        if (type === 'se') this.seVolume = parseFloat(val);
    }
}
