/**
 * 8bit レトロ音響管理エンジン (Web Audio API 合成音響 & 外部BGM/SE ＋ エラー自動フォールバック)
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.bgmVolume = 0.3;
        this.seVolume = 0.8;
        this.isUnlocked = false;
        this.statusEl = null;

        // HTML5 Audio 用 BGM インスタンス
        this.currentBgmAudio = null;
        this.currentBgmSrc = null;

        // Web Audio API による8bit合成アンビエントBGMノード
        this.synthBgmNodes = null;

        // 自動解凍リスナーの登録
        this.setupAutoUnlock();
    }

    setupAutoUnlock() {
        const unlockHandler = () => {
            this.unlock();
        };
        // ユーザーインタラクションイベントで同期的かつ確実にAudioContextを活性化
        ['click', 'pointerdown', 'keydown', 'touchstart', 'touchend'].forEach(evt => {
            window.addEventListener(evt, unlockHandler, { capture: true, passive: true });
        });
    }

    initCtx() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.ctx) {
            // ブロック解除を確実にするため同期的に超短時間のダミー音を再生
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(0);
                osc.stop(this.ctx.currentTime + 0.001);
            } catch (e) {}

            this.isUnlocked = true;
            this.updateStatus("有効 (ON)", "var(--text-green)");
        }
    }

    updateStatus(msg, color = "#aaa") {
        if (!this.statusEl) this.statusEl = document.getElementById('audio-status');
        if (this.statusEl) {
            this.statusEl.textContent = `[SOUND: ${msg}]`;
            this.statusEl.style.color = color;
        }
    }

    unlock() {
        this.initCtx();
        return this.isUnlocked;
    }

    /* --- 8bit ビープ音合成機能 (しっかり聴こえるチューニング) --- */
    playBeep(freq, duration = 0.06, type = 'square', startGain = 0.2) {
        this.initCtx();
        if (!this.ctx) return;
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
        const freq = 700 + Math.random() * 300;
        this.playBeep(freq, 0.04, 'triangle', 0.12);
    }

    // 選択肢移動・ホバー音 (ピコッ)
    playSelectSound() {
        this.playBeep(987.77, 0.05, 'square', 0.15); // B5
    }

    // 決定音 (ファンファーレ ピロリーン)
    playConfirmSound() {
        this.playBeep(523.25, 0.07, 'square', 0.2); // C5
        setTimeout(() => this.playBeep(659.25, 0.07, 'square', 0.2), 60); // E5
        setTimeout(() => this.playBeep(783.99, 0.12, 'square', 0.2), 120); // G5
    }

    /* --- 外部 BGM ＆ 合成アンビエント BGM 管理 --- */
    async playBgm(src) {
        if (!src) return;
        this.unlock();

        if (this.currentBgmSrc === src && this.currentBgmAudio && !this.currentBgmAudio.paused) {
            return;
        }

        this.stopBgm();
        this.currentBgmSrc = src;

        // 1. 外部 mp3/wav ファイルの読み込み・再生
        const audio = new Audio();
        audio.loop = true;
        audio.volume = this.bgmVolume;
        audio.crossOrigin = 'anonymous';
        audio.src = src;

        this.currentBgmAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`[8bit Audio] File BGM playing: ${src}`);
            }).catch(err => {
                console.warn(`[8bit Audio] External BGM load failed (${src}), starting 8bit Synth Ambient...`, err);
                // 2. 外部ファイルが存在しない・404等の場合は8bit合成アンビエントBGMを鳴らす
                this.startSynthAmbientBgm(src);
            });
        }
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

    /* --- Web Audio API 8bit レトロ合成アンビエント BGM --- */
    startSynthAmbientBgm(seedTag = '') {
        this.stopSynthAmbientBgm();
        this.initCtx();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;

            // 雨音・風音用ホワイトノイズ
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
            filter.frequency.setValueAtTime(450, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.04 * this.bgmVolume, now);

            whiteNoise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);
            whiteNoise.start(now);

            // 8bitレトロアンビエント低音 (110Hz A2 和音)
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(110, now);
            oscGain.gain.setValueAtTime(0.08 * this.bgmVolume, now);

            osc.connect(oscGain);
            oscGain.connect(this.ctx.destination);
            osc.start(now);

            this.synthBgmNodes = { whiteNoise, filter, noiseGain, osc, oscGain };
            console.log("[8bit Audio] Synth Ambient BGM generated and active!");
        } catch (e) {
            console.warn("Synth BGM error:", e);
        }
    }

    stopSynthAmbientBgm() {
        if (this.synthBgmNodes) {
            try {
                if (this.synthBgmNodes.whiteNoise) this.synthBgmNodes.whiteNoise.stop();
                if (this.synthBgmNodes.osc) this.synthBgmNodes.osc.stop();
            } catch (e) {}
            this.synthBgmNodes = null;
        }
    }

    async playSe(src) {
        this.unlock();
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
            if (this.synthBgmNodes && this.synthBgmNodes.noiseGain) {
                this.synthBgmNodes.noiseGain.gain.setValueAtTime(0.04 * floatVal, this.ctx ? this.ctx.currentTime : 0);
            }
        }
        if (type === 'se') {
            this.seVolume = floatVal;
        }
    }
}
