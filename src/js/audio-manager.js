/**
 * 8bit レトロ音響管理エンジン (Web Audio API 合成音響 & 外部BGM/SE ＋ 未解放時自動キュースタート)
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.bgmVolume = 0.4;
        this.seVolume = 0.8;
        this.isUnlocked = false;
        this.statusEl = null;

        // 保留中（未タップ時）の BGM 要求
        this.pendingBgmSrc = null;

        // HTML5 Audio 用 BGM インスタンス
        this.currentBgmAudio = null;
        this.currentBgmSrc = null;

        // Web Audio API による8bit合成アンビエントBGMノード
        this.synthBgmNodes = null;

        // 自動解凍リスナーの登録
        this.setupAutoUnlock();
    }

    setupAutoUnlock() {
        const unlockHandler = async () => {
            const unlocked = await this.unlock();
            if (unlocked && this.pendingBgmSrc) {
                const bgmToPlay = this.pendingBgmSrc;
                this.pendingBgmSrc = null;
                this.playBgm(bgmToPlay);
            }
        };

        ['click', 'pointerdown', 'keydown', 'touchstart', 'touchend'].forEach(evt => {
            window.addEventListener(evt, unlockHandler, { capture: true });
        });
    }

    async initCtx() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
            } catch (e) {}
        }
        if (this.ctx && this.ctx.state === 'running') {
            this.isUnlocked = true;
            this.updateStatus("有効 (ON)", "var(--text-green)");
        }
        return this.isUnlocked;
    }

    updateStatus(msg, color = "#aaa") {
        if (!this.statusEl) this.statusEl = document.getElementById('audio-status');
        if (this.statusEl) {
            this.statusEl.textContent = `[SOUND: ${msg}]`;
            this.statusEl.style.color = color;
        }
    }

    async unlock() {
        await this.initCtx();
        if (this.ctx && this.ctx.state === 'running') {
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(0);
                osc.stop(this.ctx.currentTime + 0.001);
            } catch (e) {}
        }
        return this.isUnlocked;
    }

    /* --- 8bit ビープ音合成機能 --- */
    async playBeep(freq, duration = 0.06, type = 'square', startGain = 0.25) {
        if (!this.ctx || this.ctx.state !== 'running') {
            await this.initCtx();
        }
        if (!this.ctx || this.ctx.state !== 'running') return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            const now = this.ctx.currentTime;
            const volume = startGain * this.seVolume;
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.warn("Beep audio error:", e);
        }
    }

    // 文字タイピング音 (パチッ)
    playBlip() {
        const freq = 750 + Math.random() * 250;
        this.playBeep(freq, 0.04, 'triangle', 0.15);
    }

    // 選択肢移動・ホバー音 (ピコッ)
    playSelectSound() {
        this.playBeep(987.77, 0.05, 'square', 0.18);
    }

    // 決定音 (ファンファーレ ピロリーン)
    playConfirmSound() {
        this.playBeep(523.25, 0.07, 'square', 0.22); // C5
        setTimeout(() => this.playBeep(659.25, 0.07, 'square', 0.22), 60); // E5
        setTimeout(() => this.playBeep(783.99, 0.12, 'square', 0.22), 120); // G5
    }

    /* --- 外部 BGM ＆ 合成アンビエント BGM 管理 --- */
    async playBgm(src) {
        if (!src) return;
        this.pendingBgmSrc = src;

        const unlocked = await this.initCtx();
        if (!unlocked || !this.ctx || this.ctx.state !== 'running') {
            console.log(`[8bit Audio] BGM playback queued for user interaction: ${src}`);
            return;
        }

        if (this.currentBgmSrc === src && ((this.currentBgmAudio && !this.currentBgmAudio.paused) || this.synthBgmNodes)) {
            return;
        }

        this.stopBgm();
        this.currentBgmSrc = src;
        this.pendingBgmSrc = null;

        // まずファイルが存在するか軽微チェック
        let fileExists = false;
        try {
            const checkRes = await fetch(src, { method: 'HEAD' });
            if (checkRes.ok) fileExists = true;
        } catch (e) {}

        if (fileExists) {
            const audio = new Audio();
            audio.loop = true;
            audio.volume = this.bgmVolume;
            audio.src = src;

            this.currentBgmAudio = audio;
            try {
                await audio.play();
                console.log(`[8bit Audio] File BGM playing: ${src}`);
                return;
            } catch (err) {
                console.warn(`[8bit Audio] External BGM play failed (${src}), falling back to 8bit Synth Ambient...`);
            }
        }

        // ファイルが無い (404) 場合はスムーズに8bitレトロ合成BGMを起動！
        await this.startSynthAmbientBgm(src);
    }

    stopBgm() {
        if (this.currentBgmAudio) {
            try {
                this.currentBgmAudio.pause();
                this.currentBgmAudio.currentTime = 0;
            } catch (e) {}
            this.currentBgmAudio = null;
        }
        this.stopSynthAmbientBgm();
        this.currentBgmSrc = null;
    }

    /* --- Web Audio API 8bit レトロ合成アンビエント BGM (豊かなアンビエント和音) --- */
    async startSynthAmbientBgm(seedTag = '') {
        this.stopSynthAmbientBgm();
        const unlocked = await this.initCtx();
        if (!unlocked || !this.ctx || this.ctx.state !== 'running') {
            return;
        }

        try {
            const now = this.ctx.currentTime;

            // 1. 雨音・風音用ノイズ
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.06 * this.bgmVolume, now);

            whiteNoise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);
            whiteNoise.start(now);

            // 2. 8bitレトロ低音ドローン (110Hz A2)
            const osc1 = this.ctx.createOscillator();
            const oscGain1 = this.ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(110, now);
            oscGain1.gain.setValueAtTime(0.12 * this.bgmVolume, now);
            osc1.connect(oscGain1);
            oscGain1.connect(this.ctx.destination);
            osc1.start(now);

            // 3. 和音・ハーモニクス (164.81Hz E3 - 5度上の豊かな響き)
            const osc2 = this.ctx.createOscillator();
            const oscGain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(164.81, now);
            oscGain2.gain.setValueAtTime(0.08 * this.bgmVolume, now);
            osc2.connect(oscGain2);
            oscGain2.connect(this.ctx.destination);
            osc2.start(now);

            this.synthBgmNodes = { whiteNoise, filter, noiseGain, osc1, oscGain1, osc2, oscGain2 };
            console.log("[8bit Audio] Enhanced Synth Ambient BGM active!");
        } catch (e) {
            console.warn("Synth BGM error:", e);
        }
    }

    stopSynthAmbientBgm() {
        if (this.synthBgmNodes) {
            try {
                if (this.synthBgmNodes.whiteNoise) this.synthBgmNodes.whiteNoise.stop();
                if (this.synthBgmNodes.osc1) this.synthBgmNodes.osc1.stop();
                if (this.synthBgmNodes.osc2) this.synthBgmNodes.osc2.stop();
            } catch (e) {}
            this.synthBgmNodes = null;
        }
    }

    async playSe(src) {
        await this.initCtx();
        if (src) {
            const seAudio = new Audio(src);
            seAudio.volume = this.seVolume;
            seAudio.play().catch(() => {
                this.playConfirmSound();
            });
        } else {
            this.playConfirmSound();
        }
    }

    setVolume(type, val) {
        const floatVal = parseFloat(val);
        if (type === 'bgm') {
            this.bgmVolume = floatVal;
            if (this.currentBgmAudio) {
                this.currentBgmAudio.volume = floatVal;
            }
            if (this.synthBgmNodes) {
                if (this.synthBgmNodes.noiseGain) this.synthBgmNodes.noiseGain.gain.setValueAtTime(0.06 * floatVal, this.ctx ? this.ctx.currentTime : 0);
                if (this.synthBgmNodes.oscGain1) this.synthBgmNodes.oscGain1.gain.setValueAtTime(0.12 * floatVal, this.ctx ? this.ctx.currentTime : 0);
                if (this.synthBgmNodes.oscGain2) this.synthBgmNodes.oscGain2.gain.setValueAtTime(0.08 * floatVal, this.ctx ? this.ctx.currentTime : 0);
            }
        }
        if (type === 'se') {
            this.seVolume = floatVal;
        }
    }
}
