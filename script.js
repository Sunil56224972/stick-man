/*
  Stick Hero - by Sunil
  (https://github.com/Sunil56224972/stick-man)
  Feature-rich HTML5 Canvas & Vanilla JavaScript Game Engine
*/

// --- EXTENSIONS ---
Array.prototype.last = function () {
    return this[this.length - 1];
};

Math.sinus = function (degree) {
    return Math.sin((degree / 180) * Math.PI);
};

// --- AUDIO SYNTHESIZER (Web Audio API) ---
class SoundController {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem("stickman_sound") !== "muted";
        this.activeStretchOsc = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem("stickman_sound", this.enabled ? "on" : "muted");
        return this.enabled;
    }

    playStretch() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        this.stopStretch();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(650, this.ctx.currentTime + 3.0);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        this.activeStretchOsc = { osc, gain };
    }

    stopStretch() {
        if (this.activeStretchOsc) {
            try {
                this.activeStretchOsc.gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
                this.activeStretchOsc.osc.stop(this.ctx.currentTime + 0.06);
            } catch (e) {}
            this.activeStretchOsc = null;
        }
    }

    playPlankDrop() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.13);
    }

    playStep() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(260 + Math.random() * 40, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playPerfect(combo) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const baseFreq = 523.25; // C5
        const semitoneMultiplier = Math.pow(2, (combo * 2) / 12);
        const freq1 = baseFreq * semitoneMultiplier;
        const freq2 = freq1 * 1.5; // Perfect 5th

        [freq1, freq2].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.06);

            gain.gain.setValueAtTime(0.18, this.ctx.currentTime + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.06 + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(this.ctx.currentTime + idx * 0.06);
            osc.stop(this.ctx.currentTime + idx * 0.06 + 0.32);
        });
    }

    playCherry() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
        osc.frequency.exponentialRampToValueAtTime(1318.51, this.ctx.currentTime + 0.12); // E6

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.22);
    }

    playFlip() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(480, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.09, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playCrash() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 0.25);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.27);
    }

    playFall() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.7);

        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.7);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.72);
    }
}

const sounds = new SoundController();

// --- SKINS REPOSITORY ---
const HERO_SKINS = [
    {
        id: "classic",
        name: "Classic Ninja",
        cost: 0,
        desc: "The timeless shadow warrior.",
        bodyColor: "#1e2328",
        headbandColor: "#e53935",
        eyeColor: "#ffffff"
    },
    {
        id: "shadow",
        name: "Neon Assassin",
        cost: 10,
        desc: "Cybernetic operative with neon cyan trim.",
        bodyColor: "#1a2332",
        headbandColor: "#00e5ff",
        eyeColor: "#00e5ff"
    },
    {
        id: "gold",
        name: "Golden Master",
        cost: 25,
        desc: "Pure 24K solid gold warrior.",
        bodyColor: "#fbc02d",
        headbandColor: "#6a1b9a",
        eyeColor: "#ffffff"
    },
    {
        id: "cyber",
        name: "Crimson Ghost",
        cost: 50,
        desc: "Stealth spectre with burning amber glow.",
        bodyColor: "#b71c1c",
        headbandColor: "#ffd600",
        eyeColor: "#ffeb3b"
    }
];

const STICK_SKINS = [
    {
        id: "wood",
        name: "Classic Timber",
        cost: 0,
        desc: "Dependable dark oak timber bridge.",
        style: "wood",
        color: "#333333"
    },
    {
        id: "bamboo",
        name: "Bamboo Staff",
        cost: 10,
        desc: "Flexible, resilient natural green bamboo.",
        style: "bamboo",
        color: "#43a047"
    },
    {
        id: "laser",
        name: "Cyan Lightsaber",
        cost: 25,
        desc: "Glowing plasma beam with radiant edge.",
        style: "laser",
        color: "#00e5ff"
    },
    {
        id: "rainbow",
        name: "Rainbow Prism",
        cost: 50,
        desc: "Vibrant shifting spectrum bridge.",
        style: "rainbow",
        color: "rainbow"
    }
];

// Load skin states
let unlockedHeroes = JSON.parse(localStorage.getItem("stickman_unlocked_heroes") || '["classic"]');
let unlockedSticks = JSON.parse(localStorage.getItem("stickman_unlocked_sticks") || '["wood"]');
let equippedHero = localStorage.getItem("stickman_equipped_hero") || "classic";
let equippedStick = localStorage.getItem("stickman_equipped_stick") || "wood";
let totalCherries = parseInt(localStorage.getItem("stickman_cherries") || "0", 10);
let highScore = parseInt(localStorage.getItem("stickman_high_score") || "0", 10);

// --- GAME STATE ---
let phase = "waiting"; // waiting | stretching | turning | walking | transitioning | falling
let lastTimestamp;

let heroX;
let heroY;
let sceneOffset;
let heroIsUpsideDown = false;

let platforms = [];
let sticks = [];
let trees = [];
let cherries = [];
let particles = [];
let floatingTexts = [];
let ambientParticles = [];

let score = 0;
let comboCount = 0;
let runCherries = 0;
let lastStepSoundTime = 0;

// Canvas Configuration
const canvasWidth = 375;
const canvasHeight = 375;
const platformHeight = 100;
const heroDistanceFromEdge = 10;
const paddingX = 100;
const perfectAreaSize = 10;

const backgroundSpeedMultiplier = 0.2;
const hill1BaseHeight = 100;
const hill1Amplitude = 10;
const hill1Stretch = 1;
const hill2BaseHeight = 70;
const hill2Amplitude = 20;
const hill2Stretch = 0.5;

const stretchingSpeed = 4;
const turningSpeed = 4;
const walkingSpeed = 4;
const transitioningSpeed = 2;
const fallingSpeed = 2;

const heroWidth = 17;
const heroHeight = 30;

// DOM Elements
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const introductionElement = document.getElementById("introduction");
const perfectElement = document.getElementById("perfect");
const restartButton = document.getElementById("restart");
const scoreElement = document.getElementById("score");
const highScoreElement = document.getElementById("high-score");
const cherryCountElement = document.getElementById("cherry-count");
const soundBtn = document.getElementById("sound-btn");
const shopBtn = document.getElementById("shop-btn");
const modalShopBtn = document.getElementById("modal-shop-btn");
const shopModal = document.getElementById("shop-modal");
const closeShopBtn = document.getElementById("close-shop-btn");
const tabHeroes = document.getElementById("tab-heroes");
const tabSticks = document.getElementById("tab-sticks");
const shopItemsContainer = document.getElementById("shop-items-container");
const shopCherryCountElement = document.getElementById("shop-cherry-count");
const gameOverModal = document.getElementById("game-over-modal");
const finalScoreElement = document.getElementById("final-score");
const finalBestElement = document.getElementById("final-best");
const finalCherriesElement = document.getElementById("final-cherries");

// Sync HUD
highScoreElement.innerText = highScore;
cherryCountElement.innerText = totalCherries;
soundBtn.innerText = sounds.enabled ? "🔊" : "🔇";

// Responsive canvas resize
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Ambient Weather Particles Initialization
for (let i = 0; i < 25; i++) {
    ambientParticles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 2.5 + 1,
        speedX: Math.random() * 0.4 - 0.2,
        speedY: Math.random() * 0.3 + 0.1,
        alpha: Math.random() * 0.7 + 0.3
    });
}

// Start fresh game
resetGame();

function resetGame() {
    phase = "waiting";
    lastTimestamp = undefined;
    sceneOffset = 0;
    score = 0;
    comboCount = 0;
    runCherries = 0;
    heroIsUpsideDown = false;

    introductionElement.style.opacity = 1;
    perfectElement.classList.remove("show");
    gameOverModal.classList.remove("active");
    scoreElement.innerText = score;
    highScoreElement.innerText = highScore;
    cherryCountElement.innerText = totalCherries;

    platforms = [{ x: 50, w: 50 }];
    cherries = [];
    generatePlatform();
    generatePlatform();
    generatePlatform();
    generatePlatform();

    sticks = [{ x: platforms[0].x + platforms[0].w, length: 0, rotation: 0 }];

    trees = [];
    for (let i = 0; i < 12; i++) {
        generateTree();
    }

    heroX = platforms[0].x + platforms[0].w - heroDistanceFromEdge;
    heroY = 0;

    particles = [];
    floatingTexts = [];

    draw();
}

function generateTree() {
    const minimumGap = 30;
    const maximumGap = 150;
    const lastTree = trees[trees.length - 1];
    let furthestX = lastTree ? lastTree.x : 0;

    const x = furthestX + minimumGap + Math.floor(Math.random() * (maximumGap - minimumGap));
    const treeColors = ["#6D8821", "#8FAC34", "#98B333"];
    const color = treeColors[Math.floor(Math.random() * treeColors.length)];

    trees.push({ x, color });
}

function generatePlatform() {
    const minimumGap = 45;
    const maximumGap = 200;
    const minimumWidth = 22;
    const maximumWidth = 95;

    const lastPlatform = platforms[platforms.length - 1];
    let furthestX = lastPlatform.x + lastPlatform.w;

    const gap = minimumGap + Math.floor(Math.random() * (maximumGap - minimumGap));
    const x = furthestX + gap;
    const w = minimumWidth + Math.floor(Math.random() * (maximumWidth - minimumWidth));

    // Spawn cherry under the bridge if gap is wide enough
    if (gap >= 70 && Math.random() < 0.65) {
        cherries.push({
            x: furthestX + gap / 2,
            y: canvasHeight - platformHeight + 18,
            collected: false
        });
    }

    platforms.push({ x, w });
}

// --- PARTICLE & FLOATING TEXT ENGINE ---
function spawnConfetti(x, y, count = 20) {
    const colors = ["#e53935", "#ffb300", "#00e5ff", "#76ff03", "#d500f9"];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            size: Math.random() * 4 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1.0,
            decay: Math.random() * 0.03 + 0.02
        });
    }
}

function spawnCherrySparkles(x, y) {
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: Math.random() * 3 + 1.5,
            color: "#ff1744",
            life: 1.0,
            decay: 0.04
        });
    }
}

function addFloatingText(text, x, y, color = "#e53935") {
    floatingTexts.push({
        text,
        x,
        y,
        vy: -1.2,
        color,
        alpha: 1.0
    });
}

// --- INPUT EVENT HANDLING ---
function handleInteractionStart(e) {
    if (gameOverModal.classList.contains("active") || shopModal.classList.contains("active")) {
        return;
    }
    if (e.target.closest(".modal-overlay") || e.target.closest("button") || e.target.closest(".top-hud")) {
        return;
    }

    if (phase === "waiting") {
        lastTimestamp = undefined;
        introductionElement.style.opacity = 0;
        phase = "stretching";
        sounds.playStretch();
        window.requestAnimationFrame(animate);
    } else if (phase === "walking") {
        // FLIP UPSIDE DOWN OR UPRIGHT WHILE WALKING!
        heroIsUpsideDown = !heroIsUpsideDown;
        sounds.playFlip();
    }
}

function handleInteractionEnd(e) {
    if (gameOverModal.classList.contains("active") || shopModal.classList.contains("active")) {
        return;
    }
    if (e && (e.target.closest(".modal-overlay") || e.target.closest("button"))) {
        return;
    }

    if (phase === "stretching") {
        sounds.stopStretch();
        phase = "turning";
    }
}

// Mouse & Touch bindings
window.addEventListener("mousedown", handleInteractionStart);
window.addEventListener("mouseup", handleInteractionEnd);

window.addEventListener("touchstart", function (e) {
    if (!e.target.closest(".modal-overlay.active") && !e.target.closest("button") && !e.target.closest(".top-hud")) {
        handleInteractionStart(e);
    }
}, { passive: true });

window.addEventListener("touchend", function (e) {
    if (!e.target.closest(".modal-overlay.active") && !e.target.closest("button")) {
        handleInteractionEnd(e);
    }
}, { passive: true });

// Keyboard controls (Spacebar)
window.addEventListener("keydown", function (e) {
    if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (gameOverModal.classList.contains("active")) {
            resetGame();
        } else {
            handleInteractionStart(e);
        }
    }
});

window.addEventListener("keyup", function (e) {
    if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleInteractionEnd(e);
    }
});

// HUD & Button events
soundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const enabled = sounds.toggle();
    soundBtn.innerText = enabled ? "🔊" : "🔇";
});

shopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openShop();
});

modalShopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    gameOverModal.classList.remove("active");
    openShop();
});

closeShopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    shopModal.classList.remove("active");
});

restartButton.addEventListener("click", (e) => {
    e.stopPropagation();
    resetGame();
});

// --- MAIN GAME LOOP ---
function animate(timestamp) {
    if (!lastTimestamp) {
        lastTimestamp = timestamp;
        window.requestAnimationFrame(animate);
        return;
    }

    const dt = timestamp - lastTimestamp;

    switch (phase) {
        case "waiting":
            return;

        case "stretching": {
            sticks.last().length += dt / stretchingSpeed;
            break;
        }

        case "turning": {
            sticks.last().rotation += dt / turningSpeed;

            if (sticks.last().rotation >= 90) {
                sticks.last().rotation = 90;
                sounds.playPlankDrop();

                const [nextPlatform, perfectHit] = thePlatformTheStickHits();
                if (nextPlatform) {
                    if (perfectHit) {
                        comboCount++;
                        const bonus = comboCount * 2;
                        score += bonus;
                        sounds.playPerfect(comboCount);

                        const perfectText = comboCount > 1 ? `COMBO x${comboCount}! +${bonus}` : `PERFECT! +${bonus}`;
                        perfectElement.innerText = perfectText;
                        perfectElement.classList.add("show");
                        setTimeout(() => perfectElement.classList.remove("show"), 1200);

                        // Confetti explosion at red center target
                        const centerTargetX = nextPlatform.x + nextPlatform.w / 2;
                        spawnConfetti(centerTargetX, canvasHeight - platformHeight, 25);
                        addFloatingText(`+${bonus}`, centerTargetX, canvasHeight - platformHeight - 20, "#e53935");
                    } else {
                        comboCount = 0;
                        score += 1;
                        addFloatingText("+1", nextPlatform.x + 10, canvasHeight - platformHeight - 20, "#2e7d32");
                    }

                    scoreElement.innerText = score;
                    if (score > highScore) {
                        highScore = score;
                        localStorage.setItem("stickman_high_score", highScore.toString());
                        highScoreElement.innerText = highScore;
                    }

                    generatePlatform();
                    generateTree();
                    generateTree();
                }

                phase = "walking";
            }
            break;
        }

        case "walking": {
            heroX += dt / walkingSpeed;

            // Soft footstep sound
            if (timestamp - lastStepSoundTime > 140) {
                sounds.playStep();
                lastStepSoundTime = timestamp;
            }

            const [nextPlatform] = thePlatformTheStickHits();

            // Cherry collection test
            cherries.forEach((cherry) => {
                if (!cherry.collected && Math.abs(heroX - cherry.x) < 18) {
                    if (heroIsUpsideDown) {
                        cherry.collected = true;
                        runCherries++;
                        totalCherries++;
                        localStorage.setItem("stickman_cherries", totalCherries.toString());
                        cherryCountElement.innerText = totalCherries;
                        sounds.playCherry();
                        spawnCherrySparkles(cherry.x, cherry.y);
                        addFloatingText("+1 🍒", cherry.x, cherry.y - 12, "#c62828");
                    }
                }
            });

            if (nextPlatform) {
                // HAZARD: Smashes into pillar if still upside-down when reaching next platform!
                if (heroIsUpsideDown && heroX >= nextPlatform.x - 3) {
                    sounds.playCrash();
                    sounds.playFall();
                    phase = "falling";
                    break;
                }

                const maxHeroX = nextPlatform.x + nextPlatform.w - heroDistanceFromEdge;
                if (heroX > maxHeroX) {
                    heroX = maxHeroX;
                    heroIsUpsideDown = false;
                    phase = "transitioning";
                }
            } else {
                const maxHeroX = sticks.last().x + sticks.last().length + heroWidth;
                if (heroX > maxHeroX) {
                    heroX = maxHeroX;
                    sounds.playFall();
                    phase = "falling";
                }
            }
            break;
        }

        case "transitioning": {
            sceneOffset += dt / transitioningSpeed;

            const [nextPlatform] = thePlatformTheStickHits();
            if (sceneOffset > nextPlatform.x + nextPlatform.w - paddingX) {
                sticks.push({
                    x: nextPlatform.x + nextPlatform.w,
                    length: 0,
                    rotation: 0
                });
                phase = "waiting";
            }
            break;
        }

        case "falling": {
            if (sticks.last().rotation < 180) {
                sticks.last().rotation += dt / turningSpeed;
            }

            heroY += dt / fallingSpeed;
            const maxHeroY = platformHeight + 120 + (window.innerHeight - canvasHeight) / 2;
            if (heroY > maxHeroY) {
                sounds.playCrash();
                // Trigger game over modal
                finalScoreElement.innerText = score;
                finalBestElement.innerText = highScore;
                finalCherriesElement.innerText = `🍒 ${runCherries} (+${runCherries})`;
                gameOverModal.classList.add("active");
                return;
            }
            break;
        }
    }

    draw();
    window.requestAnimationFrame(animate);
    lastTimestamp = timestamp;
}

function thePlatformTheStickHits() {
    if (sticks.last().rotation !== 90) {
        throw Error(`Stick is ${sticks.last().rotation}°`);
    }
    const stickFarX = sticks.last().x + sticks.last().length;

    const platformTheStickHits = platforms.find(
        (p) => p.x < stickFarX && stickFarX < p.x + p.w
    );

    if (
        platformTheStickHits &&
        platformTheStickHits.x + platformTheStickHits.w / 2 - perfectAreaSize / 2 < stickFarX &&
        stickFarX < platformTheStickHits.x + platformTheStickHits.w / 2 + perfectAreaSize / 2
    ) {
        return [platformTheStickHits, true];
    }

    return [platformTheStickHits, false];
}

// --- RENDERING PIPELINE ---
function draw() {
    ctx.save();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    drawDynamicBackground();

    // Center game viewport
    ctx.translate(
        (window.innerWidth - canvasWidth) / 2 - sceneOffset,
        (window.innerHeight - canvasHeight) / 2
    );

    drawPlatforms();
    drawCherries();
    drawHero();
    drawSticks();
    drawParticles();
    drawFloatingTexts();

    ctx.restore();
}

// Dynamic Day / Sunset / Night Theme
function drawDynamicBackground() {
    let topColor = "#BBD691";
    let bottomColor = "#FEF1E1";
    let hill1Color = "#95C629";
    let hill2Color = "#659F1C";

    if (score >= 20) {
        // Midnight Theme
        topColor = "#0d1b2a";
        bottomColor = "#1b263b";
        hill1Color = "#415a77";
        hill2Color = "#1b263b";
    } else if (score >= 10) {
        // Sunset / Dusk Theme
        topColor = "#f97316";
        bottomColor = "#fed7aa";
        hill1Color = "#ea580c";
        hill2Color = "#c2410c";
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // Celestial orb (Sun or Moon)
    ctx.save();
    if (score >= 20) {
        // Crescent Moon
        ctx.fillStyle = "#fef08a";
        ctx.shadowColor = "#fef08a";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(window.innerWidth - 120, 90, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Moon shadow cutout
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.arc(window.innerWidth - 110, 85, 24, 0, Math.PI * 2);
        ctx.fill();
    } else if (score >= 10) {
        // Sunset Golden Sun
        ctx.fillStyle = "#fdba74";
        ctx.shadowColor = "#ea580c";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(window.innerWidth - 140, 110, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();

    // Ambient floating particles (leaves, stars, embers)
    ctx.save();
    ambientParticles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.y > window.innerHeight) p.y = 0;
        if (p.x > window.innerWidth) p.x = 0;
        if (p.x < 0) p.x = window.innerWidth;

        ctx.fillStyle = score >= 20 ? `rgba(255, 255, 255, ${p.alpha})` : score >= 10 ? `rgba(255, 237, 213, ${p.alpha})` : `rgba(255, 255, 255, ${p.alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    // Background Hills
    drawHill(hill1BaseHeight, hill1Amplitude, hill1Stretch, hill1Color);
    drawHill(hill2BaseHeight, hill2Amplitude, hill2Stretch, hill2Color);

    trees.forEach((tree) => drawTree(tree.x, tree.color));
}

function drawHill(baseHeight, amplitude, stretch, color) {
    ctx.beginPath();
    ctx.moveTo(0, window.innerHeight);
    ctx.lineTo(0, getHillY(0, baseHeight, amplitude, stretch));
    for (let i = 0; i < window.innerWidth; i += 4) {
        ctx.lineTo(i, getHillY(i, baseHeight, amplitude, stretch));
    }
    ctx.lineTo(window.innerWidth, window.innerHeight);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawTree(x, color) {
    ctx.save();
    ctx.translate(
        (-sceneOffset * backgroundSpeedMultiplier + x) * hill1Stretch,
        getTreeY(x, hill1BaseHeight, hill1Amplitude)
    );

    const trunkHeight = 6;
    const trunkWidth = 2.5;
    const crownHeight = 26;
    const crownWidth = 12;

    ctx.fillStyle = "#7D833C";
    ctx.fillRect(-trunkWidth / 2, -trunkHeight, trunkWidth, trunkHeight);

    ctx.beginPath();
    ctx.moveTo(-crownWidth / 2, -trunkHeight);
    ctx.lineTo(0, -(trunkHeight + crownHeight));
    ctx.lineTo(crownWidth / 2, -trunkHeight);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore();
}

function getHillY(windowX, baseHeight, amplitude, stretch) {
    const sineBaseY = window.innerHeight - baseHeight;
    return Math.sinus((sceneOffset * backgroundSpeedMultiplier + windowX) * stretch) * amplitude + sineBaseY;
}

function getTreeY(x, baseHeight, amplitude) {
    const sineBaseY = window.innerHeight - baseHeight;
    return Math.sinus(x) * amplitude + sineBaseY;
}

function drawPlatforms() {
    platforms.forEach(({ x, w }) => {
        ctx.fillStyle = "#1e2328";
        ctx.fillRect(
            x,
            canvasHeight - platformHeight,
            w,
            platformHeight + (window.innerHeight - canvasHeight) / 2
        );

        // Center red target dot
        if (sticks.last().x < x) {
            ctx.fillStyle = "#e53935";
            ctx.fillRect(
                x + w / 2 - perfectAreaSize / 2,
                canvasHeight - platformHeight,
                perfectAreaSize,
                perfectAreaSize
            );
        }
    });
}

function drawCherries() {
    cherries.forEach((cherry) => {
        if (cherry.collected) return;

        ctx.save();
        ctx.translate(cherry.x, cherry.y);

        // Gentle floating bob
        const bob = Math.sin(Date.now() / 200) * 2;
        ctx.translate(0, bob);

        // Cherry berries
        ctx.fillStyle = "#d32f2f";
        ctx.beginPath();
        ctx.arc(-4, 2, 5, 0, Math.PI * 2);
        ctx.arc(4, 3, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Berry highlights
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-5.5, 0.5, 1.2, 0, Math.PI * 2);
        ctx.arc(2.5, 1.5, 1.0, 0, Math.PI * 2);
        ctx.fill();

        // Stems & leaf
        ctx.strokeStyle = "#43a047";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-4, -1);
        ctx.quadraticCurveTo(-1, -7, 0, -10);
        ctx.moveTo(4, 0);
        ctx.quadraticCurveTo(2, -7, 0, -10);
        ctx.stroke();

        ctx.fillStyle = "#4caf50";
        ctx.beginPath();
        ctx.ellipse(2, -9, 3, 1.5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawHero() {
    const skin = HERO_SKINS.find((s) => s.id === equippedHero) || HERO_SKINS[0];

    ctx.save();
    let currentHeroY = heroY + canvasHeight - platformHeight - heroHeight / 2;

    // Flip vertically if hanging upside down!
    if (heroIsUpsideDown) {
        ctx.translate(heroX - heroWidth / 2, canvasHeight - platformHeight + heroHeight / 2 + 4);
        ctx.scale(1, -1);
    } else {
        ctx.translate(heroX - heroWidth / 2, currentHeroY);
    }

    // Body
    ctx.fillStyle = skin.bodyColor;
    drawRoundedRect(-heroWidth / 2, -heroHeight / 2, heroWidth, heroHeight - 4, 5);

    // Legs
    const legDistance = 5;
    ctx.beginPath();
    ctx.arc(legDistance, 11.5, 3, 0, Math.PI * 2);
    ctx.arc(-legDistance, 11.5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.beginPath();
    ctx.fillStyle = skin.eyeColor;
    ctx.arc(5, -7, 3, 0, Math.PI * 2);
    ctx.fill();

    // Headband
    ctx.fillStyle = skin.headbandColor;
    ctx.fillRect(-heroWidth / 2 - 1, -12, heroWidth + 2, 4.5);
    ctx.beginPath();
    ctx.moveTo(-9, -14.5);
    ctx.lineTo(-17, -18.5);
    ctx.lineTo(-14, -8.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -10.5);
    ctx.lineTo(-15, -3.5);
    ctx.lineTo(-5, -7);
    ctx.fill();

    ctx.restore();
}

function drawSticks() {
    const stickSkin = STICK_SKINS.find((s) => s.id === equippedStick) || STICK_SKINS[0];

    sticks.forEach((stick) => {
        ctx.save();
        ctx.translate(stick.x, canvasHeight - platformHeight);
        ctx.rotate((Math.PI / 180) * stick.rotation);

        ctx.lineWidth = 3.5;

        if (stickSkin.style === "bamboo") {
            // Bamboo segment
            ctx.strokeStyle = "#43a047";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -stick.length);
            ctx.stroke();

            // Joints
            ctx.fillStyle = "#2e7d32";
            for (let seg = 20; seg < stick.length; seg += 24) {
                ctx.fillRect(-2.5, -seg, 5, 2.5);
            }
        } else if (stickSkin.style === "laser") {
            // Neon cyan lightsaber
            ctx.shadowColor = "#00e5ff";
            ctx.shadowBlur = 8;
            ctx.strokeStyle = "#00e5ff";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -stick.length);
            ctx.stroke();
            // Core white line
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -stick.length);
            ctx.stroke();
        } else if (stickSkin.style === "rainbow") {
            // Shifting rainbow gradient
            const grad = ctx.createLinearGradient(0, 0, 0, -stick.length);
            grad.addColorStop(0, "#ff1744");
            grad.addColorStop(0.33, "#ffea00");
            grad.addColorStop(0.66, "#00e676");
            grad.addColorStop(1, "#00e5ff");
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -stick.length);
            ctx.stroke();
        } else {
            // Classic Timber
            ctx.strokeStyle = "#333333";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -stick.length);
            ctx.stroke();
        }

        ctx.restore();
    });
}

function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // Gravity
        p.life -= p.decay;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 0.02;

        if (ft.alpha <= 0) {
            floatingTexts.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.font = "bold 18px 'Segoe UI', sans-serif";
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = ft.alpha;
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    }
}

function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.lineTo(x, y + height - radius);
    ctx.arcTo(x, y + height, x + radius, y + height, radius);
    ctx.lineTo(x + width - radius, y + height);
    ctx.arcTo(x + width, y + height, x + width, y + height - radius, radius);
    ctx.lineTo(x + width, y + radius);
    ctx.arcTo(x + width, y, x + width - radius, y, radius);
    ctx.lineTo(x + radius, y);
    ctx.arcTo(x, y, x, y + radius, radius);
    ctx.fill();
}

// --- SKIN SHOP MODAL LOGIC ---
let activeShopTab = "heroes";

tabHeroes.addEventListener("click", () => {
    activeShopTab = "heroes";
    tabHeroes.classList.add("active");
    tabSticks.classList.remove("active");
    renderShopItems();
});

tabSticks.addEventListener("click", () => {
    activeShopTab = "sticks";
    tabSticks.classList.add("active");
    tabHeroes.classList.remove("active");
    renderShopItems();
});

function openShop() {
    shopCherryCountElement.innerText = totalCherries;
    renderShopItems();
    shopModal.classList.add("active");
}

function renderShopItems() {
    shopCherryCountElement.innerText = totalCherries;
    shopItemsContainer.innerHTML = "";

    const items = activeShopTab === "heroes" ? HERO_SKINS : STICK_SKINS;
    const unlockedList = activeShopTab === "heroes" ? unlockedHeroes : unlockedSticks;
    const equippedId = activeShopTab === "heroes" ? equippedHero : equippedStick;

    items.forEach((item) => {
        const isUnlocked = unlockedList.includes(item.id);
        const isEquipped = item.id === equippedId;

        const card = document.createElement("div");
        card.className = `shop-item ${isEquipped ? "equipped" : ""}`;

        // Preview Canvas
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 60;
        previewCanvas.height = 60;
        previewCanvas.className = "skin-preview-canvas";
        drawSkinPreview(previewCanvas, item, activeShopTab);

        const nameEl = document.createElement("div");
        nameEl.className = "skin-name";
        nameEl.innerText = item.name;

        const descEl = document.createElement("div");
        descEl.className = "skin-desc";
        descEl.innerText = item.desc;

        const actionBtn = document.createElement("button");
        actionBtn.className = "skin-action-btn";

        if (isEquipped) {
            actionBtn.className += " btn-equipped";
            actionBtn.innerText = "EQUIPPED";
        } else if (isUnlocked) {
            actionBtn.className += " btn-equip";
            actionBtn.innerText = "EQUIP";
            actionBtn.onclick = () => equipSkin(item.id, activeShopTab);
        } else {
            if (totalCherries >= item.cost) {
                actionBtn.className += " btn-unlock";
                actionBtn.innerText = `UNLOCK (🍒 ${item.cost})`;
                actionBtn.onclick = () => unlockSkin(item, activeShopTab);
            } else {
                actionBtn.className += " btn-locked";
                actionBtn.innerText = `🍒 ${item.cost}`;
            }
        }

        card.appendChild(previewCanvas);
        card.appendChild(nameEl);
        card.appendChild(descEl);
        card.appendChild(actionBtn);

        shopItemsContainer.appendChild(card);
    });
}

function drawSkinPreview(c, item, type) {
    const pctx = c.getContext("2d");
    pctx.clearRect(0, 0, 60, 60);

    if (type === "heroes") {
        pctx.save();
        pctx.translate(30, 32);

        // Body
        pctx.fillStyle = item.bodyColor;
        pctx.beginPath();
        pctx.roundRect(-8, -12, 16, 24, 4);
        pctx.fill();

        // Eye
        pctx.fillStyle = item.eyeColor;
        pctx.beginPath();
        pctx.arc(3, -5, 2.5, 0, Math.PI * 2);
        pctx.fill();

        // Headband
        pctx.fillStyle = item.headbandColor;
        pctx.fillRect(-9, -9, 18, 4);
        pctx.restore();
    } else {
        pctx.save();
        pctx.translate(15, 45);
        pctx.rotate(-Math.PI / 4);

        pctx.lineWidth = 4;
        if (item.style === "bamboo") {
            pctx.strokeStyle = "#43a047";
            pctx.beginPath();
            pctx.moveTo(0, 0);
            pctx.lineTo(40, 0);
            pctx.stroke();
            pctx.fillStyle = "#2e7d32";
            pctx.fillRect(12, -3, 3, 6);
            pctx.fillRect(26, -3, 3, 6);
        } else if (item.style === "laser") {
            pctx.shadowColor = "#00e5ff";
            pctx.shadowBlur = 6;
            pctx.strokeStyle = "#00e5ff";
            pctx.beginPath();
            pctx.moveTo(0, 0);
            pctx.lineTo(40, 0);
            pctx.stroke();
        } else if (item.style === "rainbow") {
            const grad = pctx.createLinearGradient(0, 0, 40, 0);
            grad.addColorStop(0, "#ff1744");
            grad.addColorStop(0.5, "#ffea00");
            grad.addColorStop(1, "#00e5ff");
            pctx.strokeStyle = grad;
            pctx.beginPath();
            pctx.moveTo(0, 0);
            pctx.lineTo(40, 0);
            pctx.stroke();
        } else {
            pctx.strokeStyle = "#333333";
            pctx.beginPath();
            pctx.moveTo(0, 0);
            pctx.lineTo(40, 0);
            pctx.stroke();
        }
        pctx.restore();
    }
}

function equipSkin(id, type) {
    if (type === "heroes") {
        equippedHero = id;
        localStorage.setItem("stickman_equipped_hero", id);
    } else {
        equippedStick = id;
        localStorage.setItem("stickman_equipped_stick", id);
    }
    renderShopItems();
    draw();
}

function unlockSkin(item, type) {
    if (totalCherries < item.cost) return;

    totalCherries -= item.cost;
    localStorage.setItem("stickman_cherries", totalCherries.toString());
    cherryCountElement.innerText = totalCherries;

    if (type === "heroes") {
        unlockedHeroes.push(item.id);
        localStorage.setItem("stickman_unlocked_heroes", JSON.stringify(unlockedHeroes));
        equippedHero = item.id;
        localStorage.setItem("stickman_equipped_hero", item.id);
    } else {
        unlockedSticks.push(item.id);
        localStorage.setItem("stickman_unlocked_sticks", JSON.stringify(unlockedSticks));
        equippedStick = item.id;
        localStorage.setItem("stickman_equipped_stick", item.id);
    }

    sounds.playCherry();
    renderShopItems();
    draw();
}
