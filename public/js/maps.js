/*
 * Stick Hero - maps.
 *
 * Pure data. Each map names a sky (three palettes: day, dusk, night), three
 * parallax layers, a pillar material and a weather effect. scenery.js turns
 * this into pixels. Colours are 6-digit hex so they can be blended and given
 * an alpha suffix.
 *
 * layer fields: shape, color (palette key), y (base height), amp (ridge
 * height), f (ridge frequency), k (parallax speed), seed, and for props:
 * prop, gap (spacing), skip (chance to leave a gap), size [min, max].
 */
(function (root) {
    'use strict';
    var SH = (root.SH = root.SH || {});

    var MAPS = [
        {
            id: 'meadow', name: 'Pine Meadow', cost: 0,
            desc: 'Rolling hills, pines and fireflies after dark.',
            pillar: 'brick', weather: 'fireflies', clouds: 7,
            sun: { x: 0.76, size: 1, color: '#fff1b8', dusk: '#ffd08a' },
            themes: [
                { skyTop: '#8fd3e8', skyBot: '#fdf0d5', far: '#b9d9c8', mid: '#8fc487', near: '#62a76d', pillar: '#2a2540', rim: '#4a4466', tree: '#3f8a5a', cloud: '#ffffff', mist: '#1d1b2b', accent: '#ffd27a' },
                { skyTop: '#ef8a5c', skyBot: '#ffe2a9', far: '#e0a58f', mid: '#c06a6e', near: '#8f4d66', pillar: '#2c2036', rim: '#5a3f58', tree: '#6d3f5c', cloud: '#ffd3b0', mist: '#2a1830', accent: '#ffb35c' },
                { skyTop: '#0e1330', skyBot: '#383a72', far: '#2d3563', mid: '#242b55', near: '#1b2147', pillar: '#12152b', rim: '#2f3566', tree: '#171c3d', cloud: '#5b5f9c', mist: '#070a1c', accent: '#e8ff7a' }
            ],
            layers: [
                { shape: 'rolling', color: 'far',  y: 70, amp: 34, f: 0.011, k: 0.08, seed: 0.0 },
                { shape: 'rolling', color: 'mid',  y: 36, amp: 24, f: 0.017, k: 0.16, seed: 2.1 },
                { shape: 'rolling', color: 'near', y: 10, amp: 14, f: 0.026, k: 0.3,  seed: 4.3, prop: 'pine', gap: 46, skip: 0.35, size: [22, 44] }
            ]
        },
        {
            id: 'sakura', name: 'Sakura Shrine', cost: 12,
            desc: 'Blossom groves and pagodas under drifting petals.',
            pillar: 'lacquer', weather: 'petals', clouds: 5,
            sun: { x: 0.7, size: 1.15, color: '#ffd9b0', dusk: '#ff9c80' },
            themes: [
                { skyTop: '#f6b7c9', skyBot: '#fff1e6', far: '#d9b8d4', mid: '#e8a4b8', near: '#c97b95', pillar: '#3a1f2e', rim: '#6b3a52', tree: '#8a4a60', cloud: '#ffffff', mist: '#2a1220', accent: '#ff9fb8' },
                { skyTop: '#b0558e', skyBot: '#ffc9a0', far: '#a8789e', mid: '#a85a82', near: '#7a3d66', pillar: '#2a1428', rim: '#5a2f50', tree: '#5c2f55', cloud: '#ffc4c0', mist: '#1e0e1e', accent: '#ff8aae' },
                { skyTop: '#1a1240', skyBot: '#4a3a7a', far: '#3a3070', mid: '#2f2860', near: '#231d4d', pillar: '#140f2c', rim: '#3a2f6a', tree: '#1c1642', cloud: '#6b5fa8', mist: '#0a0618', accent: '#c27ae0' }
            ],
            layers: [
                { shape: 'peaks',   color: 'far',  y: 66, amp: 44, f: 0.005, k: 0.06, seed: 1.2, cap: true },
                { shape: 'rolling', color: 'mid',  y: 34, amp: 24, f: 0.014, k: 0.15, seed: 3.4, prop: 'pagoda', gap: 170, skip: 0.45, size: [40, 56] },
                { shape: 'rolling', color: 'near', y: 10, amp: 14, f: 0.024, k: 0.3,  seed: 5.1, prop: 'blossom', gap: 40, skip: 0.3, size: [24, 40] }
            ]
        },
        {
            id: 'desert', name: 'Dune Canyon', cost: 20,
            desc: 'Mesas, cactus and a sun that means it.',
            pillar: 'sandstone', weather: 'dust', clouds: 3,
            sun: { x: 0.74, size: 1.45, color: '#fff0b0', dusk: '#ff8a3a' },
            themes: [
                { skyTop: '#6fc3e6', skyBot: '#ffe9b8', far: '#e8c28a', mid: '#d9a05f', near: '#bf7e45', pillar: '#4a2c1a', rim: '#7a4e2e', tree: '#5f8a3a', cloud: '#fff6e6', mist: '#2a1608', accent: '#ffd27a' },
                { skyTop: '#d9553f', skyBot: '#ffc66b', far: '#d9906a', mid: '#b8613f', near: '#8f4230', pillar: '#35170f', rim: '#68331f', tree: '#4a5a2c', cloud: '#ffb890', mist: '#240c06', accent: '#ff9a4a' },
                { skyTop: '#10122e', skyBot: '#47306a', far: '#4a3560', mid: '#3a2a52', near: '#2a1f42', pillar: '#170f24', rim: '#3e2a54', tree: '#1d2a2e', cloud: '#5e4f8a', mist: '#0a0612', accent: '#8a6ad0' }
            ],
            layers: [
                { shape: 'mesa',  color: 'far',  y: 76, amp: 34, f: 0.008, k: 0.06, seed: 0.7 },
                { shape: 'dunes', color: 'mid',  y: 38, amp: 26, f: 0.013, k: 0.15, seed: 2.6 },
                { shape: 'dunes', color: 'near', y: 10, amp: 14, f: 0.021, k: 0.3,  seed: 4.8, prop: 'cactus', gap: 72, skip: 0.5, size: [14, 28] }
            ]
        },
        {
            id: 'frost', name: 'Frozen Peaks', cost: 35,
            desc: 'Snowfall, ice pillars and an aurora at night.',
            pillar: 'ice', weather: 'snow', clouds: 4, aurora: true,
            sun: { x: 0.78, size: 0.8, color: '#fff4d0', dusk: '#ffb0c8' },
            themes: [
                { skyTop: '#7fb8e8', skyBot: '#eaf6ff', far: '#a9c4e0', mid: '#c9dcee', near: '#e6f0fa', pillar: '#2a3f5a', rim: '#7fa6cc', tree: '#4a7a88', cloud: '#ffffff', mist: '#15233a', accent: '#bfe9ff' },
                { skyTop: '#6a5fb0', skyBot: '#ffc7d8', far: '#8f86c0', mid: '#b6a6cf', near: '#d6c4dc', pillar: '#2a2a50', rim: '#6f6aa6', tree: '#4a5a86', cloud: '#ffd8e6', mist: '#16163a', accent: '#ffb3e0' },
                { skyTop: '#050c26', skyBot: '#1f3a6a', far: '#2a3f78', mid: '#34508a', near: '#3f5f96', pillar: '#0f1a38', rim: '#3a5f9a', tree: '#1d3768', cloud: '#4a6aa8', mist: '#040a1c', accent: '#7dffd0' }
            ],
            layers: [
                { shape: 'peaks',   color: 'far',  y: 58, amp: 64, f: 0.006, k: 0.07, seed: 0.4, cap: true },
                { shape: 'peaks',   color: 'mid',  y: 28, amp: 40, f: 0.01,  k: 0.15, seed: 2.9, cap: true },
                { shape: 'rolling', color: 'near', y: 8,  amp: 14, f: 0.024, k: 0.3,  seed: 5.5, prop: 'icepine', gap: 44, skip: 0.35, size: [20, 40] }
            ]
        },
        {
            id: 'neon', name: 'Neon Harbor', cost: 50,
            desc: 'A rain-slick skyline that never switches off.',
            pillar: 'neon', weather: 'rain', clouds: 2, glow: true, moon: false,
            sun: { x: 0.68, size: 1.5, stay: true, color: '#ff9ad0', dusk: '#ff5fa8', night: '#ff5fa8' },
            themes: [
                { skyTop: '#7a8fe0', skyBot: '#ffd6f0', far: '#9a8ac8', mid: '#7a6aaa', near: '#5a4a8a', pillar: '#1c1a3a', rim: '#4a46a0', tree: '#4a3a80', cloud: '#fff0fa', mist: '#120e30', accent: '#19e6d8' },
                { skyTop: '#4a2a8a', skyBot: '#ff6aa8', far: '#7a4a9a', mid: '#5a3280', near: '#3d2268', pillar: '#160f34', rim: '#4a2f90', tree: '#33205c', cloud: '#ff9ac8', mist: '#0e0826', accent: '#ff4fd8' },
                { skyTop: '#07041a', skyBot: '#2a0f5a', far: '#241050', mid: '#1a0c40', near: '#120830', pillar: '#0b0620', rim: '#3a22a0', tree: '#0e0628', cloud: '#4a2a8a', mist: '#05020f', accent: '#2cf4ff' }
            ],
            layers: [
                { shape: 'skyline', color: 'far',  y: 22, amp: 80, minH: 60, cell: 34, k: 0.06, seed: 1.1, windows: true },
                { shape: 'skyline', color: 'mid',  y: 6,  amp: 46, minH: 28, cell: 26, k: 0.15, seed: 3.7, windows: true, neon: true },
                { shape: 'rolling', color: 'near', y: -2, amp: 8,  f: 0.03, k: 0.3, seed: 5.2 }
            ]
        },
        {
            id: 'volcano', name: 'Ember Caldera', cost: 80,
            desc: 'Basalt pillars over a sky that is on fire.',
            pillar: 'basalt', weather: 'embers', clouds: 4, glow: true, stars: false, moon: false,
            sun: { x: 0.72, size: 1.2, color: '#ffb066', dusk: '#ff7a30' },
            themes: [
                { skyTop: '#c9784f', skyBot: '#ffd9a0', far: '#8a5a50', mid: '#6a3f3f', near: '#4a2a30', pillar: '#241418', rim: '#5a3a3a', tree: '#3a2024', cloud: '#d9b0a0', mist: '#140808', accent: '#ff7a2a' },
                { skyTop: '#7a2a30', skyBot: '#ff8a4a', far: '#6a3038', mid: '#4f2230', near: '#341822', pillar: '#1c0e14', rim: '#4a2a30', tree: '#2a141c', cloud: '#c06a5a', mist: '#10060a', accent: '#ff5a1a' },
                { skyTop: '#120608', skyBot: '#4a1410', far: '#3a1418', mid: '#2a0e14', near: '#1c0a10', pillar: '#0e0508', rim: '#3a1a1c', tree: '#14080c', cloud: '#5a2a2a', mist: '#070204', accent: '#ff4a10' }
            ],
            layers: [
                { shape: 'volcano', color: 'far',  y: 60, amp: 60, f: 0.0065, k: 0.07, seed: 0.9 },
                { shape: 'volcano', color: 'mid',  y: 28, amp: 38, f: 0.011,  k: 0.16, seed: 3.1 },
                { shape: 'rolling', color: 'near', y: 8,  amp: 12, f: 0.024,  k: 0.3,  seed: 5.9, prop: 'spire', gap: 62, skip: 0.5, size: [18, 34] }
            ]
        }
    ];

    SH.maps = MAPS;
})(typeof window !== 'undefined' ? window : globalThis);