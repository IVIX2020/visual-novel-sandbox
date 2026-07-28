/**
 * 8bit レトロ音響管理エンジン (Web Audio API 合成音響 & 外部BGM/SE ＋ エラー自動フォールバック)
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.bgmVolume = 0.15;
        this.seVolume = 0.5;
        this.isUnlocked = false;
        this.statusEl = null;

        // HTML5 Audio 用 BGM インスタンス
        this.currentBgmAudio = null;
        this.currentBgmSrc = null;

        // Web Audio API による8bit合成アンビエントBGMノード
        this.synthBgmNodes = null;

        // 自動アンロックリスナーの登録
        this.setupAutoUnlock();
    }

    setupAutoUnlock() {
        const unlockHandler = () => {
            this.unlock();
        };
        ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, unlockHandler, { passive: true });
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

    async unlock() {
        this.initCtx();
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        return this.isUnlocked;
    }

    /* --- 8bit ビープ音合成ロジック --- */
    playBeep(freq, duration = 0.05, type = 'square', startGain = 0.1) {
        this.initCtx();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            const now = this.ctx.currentTime;
            gain.gain.setValueAtTime(startGain * this.seVolume, now);
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
        const freq = 600 + Math.random() * 200;
        this.playBeep(freq, 0.03, 'triangle', 0.04);
    }

    // 選択肢移動・ホバー音 (ピッ)
    playSelectSound() {
        this.playBeep(880, 0.04, 'square', 0.06);
    }

    // 決定音 (ピロリーン)
    playConfirmSound() {
        this.playBeep(523.25, 0.06, 'square', 0.08); // C5
        setTimeout(() => this.playBeep(659.25, 0.06, 'square', 0.08), 50); // E5
        setTimeout(() => this.playBeep(783.99, 0.09, 'square', 0.08), 100); // G5
    }

    /* --- 外部 BGM ＆ 合成アンビエント BGM 管理 --- */
    async playBgm(src) {
        if (!src) return;
        if (this.currentBgmSrc === src && this.currentBgmAudio && !this.currentBgmAudio.paused) {
            return; // 既に再生中の場合はスキップ
        }

        this.stopBgm();
        this.currentBgmSrc = src;
        this.unlock();

        // 1. まず外部 mp3/wav ファイルのロード・再生を試みる
        const audio = new Audio();
        audio.loop = true;
        audio.volume = this.bgmVolume;
        audio.src = src;

        this.currentBgmAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`[8bit Audio] File BGM playing: ${src}`);
            }).catch(err => {
                console.warn(`[8bit Audio] External BGM load failed (${src}), falling back to 8bit Synth Ambient...`, err);
                // 2. 外部ファイルが存在しない (404) 場合は、8bit レトロ合成アンビエントBGMへフォールバック再生！
                this.startSynthAmbientBgm(src);
            });
        }
    }

    stopBgm() {
        if (this.currentBgmAudio) {
            this.currentBgmAudio.pause();
            this.currentBgmAudio.currentTime = 0;
            this.currentBgmAudio = null;
        }
        this.stopSynthAmbientBgm();
        this.currentBgmSrc = null;
    }

    /* --- Web Audio API 8bit レトロ合成アンビエント BGM (404時フォールバック) --- */
    startSynthAmbientBgm(seedTag = '') {
        this.stopSynthAmbientBgm();
        this.initCtx();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;

            // 雨音・風音用ホワイトノイズ生成
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            // 雨風フィルター (Low-pass)
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, now);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.015 * this.bgmVolume, now);

            whiteNoise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);
            whiteNoise.start(now);

            // 8bitレトロアンビエント低音オシレーター (ドローン)
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(110, now); // A2 (110Hz) の落ち着いた低音
            oscGain.gain.setValueAtTime(0.03 * this.bgmVolume, now);

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
                this.synthBgmNodes.noiseGain.gain.setValueAtTime(0.015 * floatVal, this.ctx ? this.ctx.currentTime : 0);
            }
        }
        if (type === 'se') {
            this.seVolume = floatVal;
        }
    }
}
