(() => {
    const canvas = document.getElementById("wave");
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parseColor = (value, fallback) => (value ? value.split(",").map((c) => Number(c) / 255) : fallback);
    const PALETTE = {
        night: { bg: [5, 5, 6], fg: [235, 235, 240], glow: [158, 219, 255] },
        day: { bg: [243, 239, 230], fg: [106, 132, 158], glow: [168, 196, 220] },
    };
    const scale = (rgb) => rgb.map((c) => c / 255);
    let fg = parseColor(canvas.dataset.fg, [1, 1, 1]);
    let bg = parseColor(canvas.dataset.bg, [0, 0, 0]);
    let glow = scale(PALETTE.night.glow);
    const cycling = canvas.dataset.cycle !== "off";

    const SLOT_S = 10;
    const HOLD_S = 5;
    const MORPH_S = 2;
    const MANUAL_HOLD_MS = 30000;
    const MORPH_MS = 2000;
    const COLS = 250;
    const ROWS = 160;
    const N = COLS * ROWS;

    // ---------- helpers ----------
    let seed = 7;
    const rand = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
    const onSphere = (r) => {
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)];
    };
    const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
    const norm3 = (a) => scale3(a, 1 / len3(a));
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const pickWeighted = (weights, total) => {
        let pick = rand() * total;
        let i = 0;
        while (pick > weights[i] && i < weights.length - 1) pick -= weights[i++];
        return i;
    };

    // ---------- shapes ----------
    // Every shape returns positions (N * 3) and one tag per point; shapes that are lit also return normals.
    // Tag meaning depends on the shape kind:
    //   rigid:   tag >= 0 is a pulse coordinate, -1 means no pulse
    //   orbit:   -1 primary disk image, -2 secondary (lensed) disk image, -3 photon ring
    //   arm:     -(link + 2)
    //   galaxy:  -brightness
    function waveShape() {
        const data = new Float32Array(N * 3);
        let k = 0;
        for (let j = 0; j < ROWS; j++) {
            for (let i = 0; i < COLS; i++) {
                data[k++] = -14 + (28 * i) / (COLS - 1);
                data[k++] = 0;
                data[k++] = 3 - (24 * j) / (ROWS - 1);
            }
        }
        return { data, tag: new Float32Array(N).fill(-1) };
    }

    function helixShape() {
        const data = new Float32Array(N * 3);
        const half = 2.45;
        const radius = 0.55;
        const turns = 3.22;
        const rungs = 36;
        for (let n = 0; n < N; n++) {
            let x, y, z;
            if (n < N * 0.7) {
                const strand = n % 2;
                y = -half + rand() * half * 2;
                const a = (y / (half * 2)) * turns * Math.PI * 2 + strand * Math.PI;
                const ang = rand() * Math.PI * 2;
                const rad = 0.06 * Math.sqrt(rand());
                const c = Math.cos(a);
                const s = Math.sin(a);
                x = c * (radius + Math.cos(ang) * rad) - s * Math.sin(ang) * rad;
                z = s * (radius + Math.cos(ang) * rad) + c * Math.sin(ang) * rad;
                y += (rand() * 2 - 1) * 0.012;
            } else {
                const r = Math.floor(rand() * rungs);
                y = -half + ((r + 0.5) / rungs) * half * 2;
                const a = (y / (half * 2)) * turns * Math.PI * 2;
                const t = (rand() * 2 - 1) * 0.9;
                const thick = (rand() * 2 - 1) * 0.008;
                x = Math.cos(a) * radius * t - Math.sin(a) * thick;
                z = Math.sin(a) * radius * t + Math.cos(a) * thick;
            }
            data.set([x, y, z], n * 3);
        }
        return { data, tag: new Float32Array(N).fill(-1) };
    }

    function moleculeShape() {
        const s = 0.72;
        const hexCenter = [-0.55, 0];
        const atoms = [];
        const bonds = [];
        const add = (x, y, z, r) => atoms.push({ p: [x, y, z], r }) - 1;

        const hex = [];
        for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 180) * (30 + 60 * k);
            hex.push(add(hexCenter[0] + s * Math.cos(a), hexCenter[1] + s * Math.sin(a), 0, 0.2));
        }
        for (let k = 0; k < 6; k++) bonds.push([hex[k], hex[(k + 1) % 6]]);

        const R = s / (2 * Math.sin(Math.PI / 5));
        const pc = [hexCenter[0] + s * Math.cos(Math.PI / 6) + R * Math.cos(Math.PI / 5), 0];
        const pent = [hex[0]];
        for (const deg of [72, 0, -72]) {
            const a = (Math.PI / 180) * deg;
            pent.push(add(pc[0] + R * Math.cos(a), pc[1] + R * Math.sin(a), 0, 0.2));
        }
        pent.push(hex[5]);
        for (let k = 0; k < 4; k++) bonds.push([pent[k], pent[k + 1]]);

        const substituent = (atomIndex, center, length, r, z) => {
            const a = atoms[atomIndex].p;
            const dx = a[0] - center[0];
            const dy = a[1] - center[1];
            const d = Math.hypot(dx, dy);
            const i = add(a[0] + (dx / d) * length, a[1] + (dy / d) * length, z, r);
            bonds.push([atomIndex, i]);
        };
        substituent(hex[1], hexCenter, 0.62, 0.26, 0.05);
        substituent(hex[2], hexCenter, 0.7, 0.24, -0.25);
        substituent(hex[3], hexCenter, 0.62, 0.26, 0.05);
        substituent(hex[4], hexCenter, 0.7, 0.24, 0.25);
        substituent(pent[2], pc, 0.7, 0.24, -0.2);

        const atomWeights = atoms.map((a) => a.r * a.r);
        const atomTotal = atomWeights.reduce((x, y) => x + y, 0);
        const bondLength = bonds.map(([a, b]) => len3(sub3(atoms[a].p, atoms[b].p)));
        const bondTotal = bondLength.reduce((x, y) => x + y, 0);

        const data = new Float32Array(N * 3);
        for (let n = 0; n < N; n++) {
            let p;
            if (n < N * 0.62) {
                const atom = atoms[pickWeighted(atomWeights, atomTotal)];
                p = add3(atom.p, onSphere(atom.r * (0.92 + rand() * 0.1)));
            } else {
                const [ia, ib] = bonds[pickWeighted(bondLength, bondTotal)];
                const t = rand();
                const A = atoms[ia].p;
                const B = atoms[ib].p;
                p = [0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t + gauss() * 0.025);
            }
            data.set(p, n * 3);
        }
        return { data, tag: new Float32Array(N).fill(-1) };
    }


    // Pulses run along each synapse from one neuron to the next; a neuron's soma lights up when one arrives.
    function neuralWebShape() {
        const PULSE_SPAN = 0.3;
        const radii = [2.4, 1.55, 1.4];
        const nodes = [];
        for (let attempt = 0; nodes.length < 38 && attempt < 5000; attempt++) {
            const p = radii.map((r) => (rand() * 2 - 1) * r);
            if (p.reduce((sum, v, i) => sum + (v / radii[i]) ** 2, 0) > 1) continue;
            if (nodes.some((q) => len3(sub3(p, q.p)) < 0.55)) continue;
            nodes.push({ p, size: 0.07 + rand() * 0.05, fire: -1 });
        }

        const edges = [];
        const seen = new Set();
        const connect = (i, j) => {
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (i === j || seen.has(key)) return;
            seen.add(key);
            const [from, to] = rand() < 0.5 ? [nodes[i], nodes[j]] : [nodes[j], nodes[i]];
            const dir = sub3(to.p, from.p);
            const length = len3(dir);
            let bendDir = onSphere(1);
            bendDir = norm3(sub3(bendDir, scale3(dir, dot3(bendDir, dir) / (length * length))));
            const ctrl = add3(scale3(add3(from.p, to.p), 0.5), scale3(bendDir, length * (0.12 + rand() * 0.18)));
            const phase = rand();
            to.fire = phase + PULSE_SPAN;
            edges.push({ a: from.p, b: to.p, ctrl, length, phase });
        };
        nodes.forEach((node, i) => {
            const nearest = nodes
                .map((other, j) => [len3(sub3(node.p, other.p)), j])
                .sort((x, y) => x[0] - y[0])
                .slice(1, 4);
            nearest.forEach(([, j]) => connect(i, j));
        });
        for (let k = 0; k < 8; k++) connect(Math.floor(rand() * nodes.length), Math.floor(rand() * nodes.length));

        const spikes = nodes.flatMap((node) =>
            Array.from({ length: 5 }, () => ({ node, dir: onSphere(1), length: 0.16 + rand() * 0.2 })));
        const edgeWeights = edges.map((e) => e.length);
        const edgeTotal = edgeWeights.reduce((x, y) => x + y, 0);

        const data = new Float32Array(N * 3);
        const tag = new Float32Array(N);
        for (let n = 0; n < N; n++) {
            let p;
            let s = -1;
            const u = n / N;
            if (u < 0.14) {
                const node = nodes[Math.floor(rand() * nodes.length)];
                p = add3(node.p, onSphere(node.size * Math.cbrt(0.4 + rand() * 0.6)));
                s = node.fire;
            } else if (u < 0.27) {
                const spike = spikes[Math.floor(rand() * spikes.length)];
                const t = rand();
                const base = add3(spike.node.p, scale3(spike.dir, spike.node.size + spike.length * t));
                p = add3(base, onSphere(0.018 * (1 - t) * Math.sqrt(rand())));
            } else if (u < 0.95) {
                const e = edges[pickWeighted(edgeWeights, edgeTotal)];
                const t = rand();
                const mt = 1 - t;
                const point = [0, 1, 2].map((i) => mt * mt * e.a[i] + 2 * mt * t * e.ctrl[i] + t * t * e.b[i]);
                p = add3(point, onSphere(0.014 * Math.sqrt(rand())));
                s = e.phase + t * PULSE_SPAN;
            } else {
                p = radii.map((r) => (rand() * 2 - 1) * r * 1.1);
            }
            data.set(p, n * 3);
            tag[n] = s;
        }
        return { data, tag };
    }

    function galaxyShape() {
        const data = new Float32Array(N * 3);
        const tag = new Float32Array(N);
        const armPoint = () => {
            const major = rand() < 0.72;
            const arm = major ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
            const t = Math.pow(rand(), 0.9);
            const r = 0.3 + 3.45 * t;
            const a = arm * (Math.PI / 2) + (arm >= 2 ? 0.35 : 0) + Math.log(r / 0.3) * 2.0;
            const spread = (major ? 0.2 : 0.28) * (0.5 + t);
            const along = [Math.cos(a), 0, Math.sin(a)];
            const perp = [-Math.sin(a), 0, Math.cos(a)];
            const p = add3(scale3(along, r), scale3(perp, gauss() * spread));
            p[1] = gauss() * 0.045 * (1 - 0.5 * t);
            return { p, t, major };
        };
        for (let n = 0; n < N; n++) {
            const u = n / N;
            let p;
            let bright;
            if (u < 0.2) {
                const q = [gauss() * 0.32, gauss() * 0.17, gauss() * 0.32];
                p = q;
                bright = 1.9 - Math.min(len3(q), 1) * 0.9;
            } else if (u < 0.72) {
                const s = armPoint();
                p = s.p;
                bright = (s.major ? 1.15 : 0.8) + 0.6 * Math.exp(-s.t * 2.5);
            } else if (u < 0.78) {
                const s = armPoint();
                p = add3(s.p, [gauss() * 0.04, gauss() * 0.02, gauss() * 0.04]);
                bright = 1.9;
            } else if (u < 0.94) {
                const r = Math.min(-0.85 * Math.log(rand() + 1e-6), 2.9);
                const a = rand() * Math.PI * 2;
                p = [Math.cos(a) * r, gauss() * 0.06, Math.sin(a) * r];
                bright = 0.5;
            } else {
                p = onSphere(1.2 + rand() * 1.8);
                p[1] *= 0.6;
                bright = 0.3;
            }
            data.set(p, n * 3);
            tag[n] = -bright;
        }
        return { data, tag };
    }

    // The robot arm is the Seeed reBot Arm B601-DM, sampled offline from Seeed-Projects/reBot-DevArm
    // (CERN-OHL-W-2.0) by tools/build_arm_points.py into assets/arm-points.bin.
    // Each 10-byte record: int16 x, y, z (metres * ARM_POS_SCALE, in the link frame),
    // int8 normal * 127, uint8 packed link (low 4 bits) and material brightness (high 4 bits).
    const ARM_POS_SCALE = 8000;
    const ARM_SRC = document.currentScript ? new URL("arm-points.bin", document.currentScript.src).href : null;

    function decodeArm(buffer) {
        const view = new DataView(buffer);
        const count = Math.min(N, Math.floor(buffer.byteLength / 10));
        const data = new Float32Array(N * 3);
        const normal = new Float32Array(N * 3);
        const tag = new Float32Array(N).fill(-2);
        for (let i = 0; i < count; i++) {
            const o = i * 10;
            for (let k = 0; k < 3; k++) {
                data[i * 3 + k] = view.getInt16(o + k * 2, true) / ARM_POS_SCALE;
                normal[i * 3 + k] = view.getInt8(o + 6 + k) / 127;
            }
            tag[i] = -(view.getUint8(o + 9) + 2);
        }
        return { data, tag, normal };
    }

    function pendingArm() {
        return { data: new Float32Array(N * 3), tag: new Float32Array(N).fill(-2), normal: new Float32Array(N * 3) };
    }

    const KIND = { wave: 0, rigid: 1, orbit: 2, arm: 3, galaxy: 4 };
    const slug = (name) => (name || "").toLowerCase().replace(/[^a-z]/g, "");
    const requested = new URLSearchParams(location.search).get("shape") || canvas.dataset.shape || "";
    const roster = [
        { name: "Wave", kind: KIND.wave, tilt: 0, scale: 1, shift: 0, ...waveShape() },
        { name: "DNA", kind: KIND.rigid, tilt: 0, roll: (20 * Math.PI) / 180, scale: 2.15, shift: 0.4, ...helixShape() },
        { name: "Molecule", kind: KIND.rigid, tilt: 0, scale: 2.45, shift: 0.75, ...moleculeShape() },
        { name: "Neural net", kind: KIND.rigid, tilt: 0, scale: 1.95, shift: 0.65, ...neuralWebShape() },
        { name: "Galaxy", kind: KIND.galaxy, tilt: 0.95, scale: 2.7, shift: 1.85, drop: 1.35, ...galaxyShape() },
        { name: "Robot arm", kind: KIND.arm, tilt: 0, scale: 10.4, shift: 0, ...pendingArm() },
    ];
    // The hero cycles the shapes after the wave. A page that asks for the wave and does not cycle keeps it.
    const shapes = !cycling && slug(requested) === "wave"
        ? roster.filter((s) => s.name === "Wave")
        : roster.filter((s) => s.name !== "Wave");

    const seeds = new Float32Array(N * 3);
    for (let n = 0; n < N; n++) seeds.set(onSphere(Math.cbrt(rand())), n * 3);
    const noNormals = new Float32Array(N * 3);

    // ---------- GL ----------
    const vertexSource = `
        attribute vec3 aFrom;
        attribute vec3 aTo;
        attribute vec3 aSeed;
        attribute float aTagFrom;
        attribute float aTagTo;
        attribute vec3 aNormalFrom;
        attribute vec3 aNormalTo;
        uniform mat4 uViewProj;
        uniform float uTime;
        uniform float uAspect;
        uniform vec2 uMouse;
        uniform float uMouseStrength;
        uniform float uPixelRatio;
        uniform float uMix;
        uniform float uFromKind;
        uniform float uToKind;
        uniform float uFromTilt;
        uniform float uToTilt;
        uniform float uFromScale;
        uniform float uToScale;
        uniform float uFromShift;
        uniform float uToShift;
        uniform float uFromDrop;
        uniform float uToDrop;
        uniform float uFromRoll;
        uniform float uToRoll;
        uniform vec3 uCenter;
        uniform vec3 uEye;
        varying float vAlpha;
        varying float vGlow;

        float height(float x, float z, float t) {
            return 0.34 * sin(x * 0.55 + t * 0.7)
                 + 0.22 * sin(z * 0.75 - t * 0.55)
                 + 0.10 * sin((x + z) * 1.35 + t * 1.3)
                 + 0.05 * sin(x * 2.4 - z * 1.7 + t * 1.9);
        }

        vec3 rotX(vec3 p, float a) {
            float c = cos(a), s = sin(a);
            return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
        }

        vec3 rotY(vec3 p, float a) {
            float c = cos(a), s = sin(a);
            return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        }

        vec3 rotZ(vec3 p, float a) {
            float c = cos(a), s = sin(a);
            return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
        }

        // reBot B601-DM kinematics from its URDF, in metres. Joint 1 stays put so the arm keeps reaching left.
        // Joint 2 rotates about -Z; the other revolute joints rotate about Z. Fixed origin rotations are baked in.
        void armTransform(inout vec3 p, inout vec3 n, float link) {
            float t = uTime * 0.4;
            float j2 = -1.0 + 0.14 * sin(t);
            float j3 = -1.15 + 0.16 * sin(t + 1.1);
            float j4 = 0.15 + 0.1 * sin(t * 0.7);
            float j5 = 0.7 + 0.12 * sin(t + 2.0);
            float j6 = 1.57 + 0.18 * sin(t * 0.5);
            float grip = 0.014 + 0.012 * sin(uTime * 0.9);
            if (link > 7.5) {
                p.y += link < 8.5 ? grip : -grip;
                link = 7.0;
            }
            if (link > 6.5) {
                p = rotZ(rotY(p, -1.5708), 3.1416);
                n = rotZ(rotY(n, -1.5708), 3.1416);
                p += vec3(0.0, 0.0, 0.15539);
                link = 6.0;
            }
            if (link > 5.5) { p = rotZ(p, j6); n = rotZ(n, j6); p = rotY(p, 1.5708); n = rotY(n, 1.5708); p += vec3(0.028008, 0.0, 0.04); }
            if (link > 4.5) { p = rotZ(p, j5); n = rotZ(n, j5); p = rotX(p, -1.5708); n = rotX(n, -1.5708); p += vec3(0.078308, -0.0375, -0.03); }
            if (link > 3.5) { p = rotZ(p, j4); n = rotZ(n, j4); p += vec3(0.2426, -0.054, -0.001625); }
            if (link > 2.5) { p = rotZ(p, j3); n = rotZ(n, j3); p += vec3(-0.264, 0.0, 0.0); }
            if (link > 1.5) { p = rotZ(p, -j2); n = rotZ(n, -j2); p = rotX(p, -1.5708); n = rotX(n, -1.5708); p += vec3(0.020084, 0.031625, 0.05555); }
            if (link > 0.5) { p += vec3(-0.000084, 0.0, 0.08465); }
            p = vec3(-p.x, p.z, p.y);
            n = vec3(-n.x, n.z, n.y);
        }

        // Approximate gravitational lensing: points behind the hole are pushed onto their primary
        // (outer) or secondary (inner, flipped) image, and anything that lands inside the shadow is hidden.
        vec3 blackHolePoint(vec3 p, float tag, float tilt, float scale, out float bright) {
            vec3 view = normalize(uEye - uCenter);
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), view));
            vec3 up = cross(view, right);
            float shadow = 0.9 * scale;

            if (tag < -2.5) {
                float a = p.y + uTime * 0.1;
                bright = 2.0;
                return (right * cos(a) + up * sin(a)) * p.x * scale;
            }

            float r = p.x;
            float angle = p.y + uTime * 1.2 / (r + 0.2);
            vec3 local = rotX(vec3(r * cos(angle), p.z, r * sin(angle)), tilt) * scale;
            vec3 velocity = rotX(vec3(-sin(angle), 0.0, cos(angle)), tilt);

            float depth = dot(local, view);
            vec3 offset = local - view * depth;
            float beta = max(length(offset), 1e-3);
            float einstein2 = 0.85 * scale * max(-depth, 0.0);
            float root = sqrt(beta * beta + 4.0 * einstein2);
            bool secondary = tag < -1.5;
            vec3 image = offset * (0.5 * (secondary ? beta - root : beta + root) / beta);

            bright = 1.9 * exp(-(r - 1.05) * 1.5) * (1.0 + 0.6 * dot(velocity, view));
            if (secondary) {
                bright *= 0.75;
                if (depth >= 0.0) bright = 0.0;
            }
            if (depth < 0.0 && length(image) < shadow) bright = 0.0;
            return image + view * depth;
        }

        // kind: 0 wave, 1 rigid object, 2 black hole, 3 robot arm, 4 galaxy
        vec3 place(vec3 p, vec3 normal, float kind, float tag, float tilt, float scale, float shift, float drop, float roll,
                   out float bright, out vec3 worldNormal) {
            bright = 1.0;
            worldNormal = vec3(0.0);
            if (kind < 0.5) {
                p.y += height(p.x, p.z, uTime);
                return p;
            }
            vec3 q;
            if (kind < 1.5) {
                q = p + aSeed * 0.02 * sin(uTime * 1.4 + aSeed.x * 23.0);
                q = rotX(rotZ(rotY(q, uTime * 0.1), 0.22 + roll), tilt) * scale;
            } else if (kind < 2.5) {
                q = blackHolePoint(p, tag, tilt, scale, bright);
            } else if (kind < 3.5) {
                q = p;
                vec3 n = normal;
                float code = -tag - 2.0;
                float link = mod(code, 16.0);
                armTransform(q, n, link);
                q += n * 0.016;
                q = rotY(q, -0.55);
                n = rotY(n, -0.55);
                q = q * scale + vec3(0.15, -3.45, 0.0);
                worldNormal = n;
                bright = 0.7 + 0.9 * floor(code / 16.0) / 14.0;
                return q + uCenter;
            } else {
                q = rotX(rotY(p, uTime * 0.065), tilt) * scale;
                bright = -tag;
            }
            q.x += shift;
            q.y -= 0.55 + drop;
            return q + uCenter;
        }

        // Lambert plus a rim term; faces turned away from the viewer almost vanish so solids read as solids.
        float surfaceShade(vec3 normal, vec3 p) {
            if (dot(normal, normal) < 0.25) return 1.0;
            vec3 n = normalize(normal);
            float facing = dot(n, normalize(uEye - p));
            if (facing < -0.05) return 0.06;
            float diffuse = max(dot(n, normalize(vec3(-0.5, 0.75, 0.55))), 0.0);
            float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 3.0);
            return 0.14 + 1.5 * diffuse + 0.55 * rim;
        }

        float pulseGlow(float s) {
            if (s < 0.0) return 0.0;
            float d = s - fract(uTime * 0.3);
            d -= floor(d + 0.5);
            float head = exp(-d * d * 900.0);
            float tail = d < 0.0 ? exp(d * 14.0) * 0.45 : 0.0;
            return head + tail;
        }

        void main() {
            float brightFrom;
            float brightTo;
            vec3 normalFrom;
            vec3 normalTo;
            vec3 a = place(aFrom, aNormalFrom, uFromKind, aTagFrom, uFromTilt, uFromScale, uFromShift, uFromDrop, uFromRoll, brightFrom, normalFrom);
            vec3 b = place(aTo, aNormalTo, uToKind, aTagTo, uToTilt, uToScale, uToShift, uToDrop, uToRoll, brightTo, normalTo);
            vec3 p = mix(a, b, uMix);
            p += aSeed * sin(uMix * 3.14159) * 1.6;
            float bright = mix(brightFrom, brightTo, uMix);
            float shade = mix(surfaceShade(normalFrom, a), surfaceShade(normalTo, b), uMix);

            vec4 projected = uViewProj * vec4(p, 1.0);
            vec2 ndc = projected.xy / projected.w;
            float d = length((ndc - uMouse) * vec2(uAspect, 1.0));
            float lift = exp(-d * d * 14.0) * uMouseStrength;
            float ripple = sin(d * 28.0 - uTime * 5.0) * exp(-d * 3.5) * 0.06 * uMouseStrength;
            p.y += lift * 0.6 + ripple;

            vec4 position = uViewProj * vec4(p, 1.0);
            gl_Position = position;

            float glow = mix(pulseGlow(aTagFrom), pulseGlow(aTagTo), uMix) * (1.0 - sin(uMix * 3.14159));
            float hasPulse = mix(step(0.0, aTagFrom), step(0.0, aTagTo), uMix);

            float depth = position.w;
            float sizeBoost = clamp(0.75 + 0.25 * bright, 0.6, 1.4);
            float armness = mix(step(2.5, uFromKind) * step(uFromKind, 3.5), step(2.5, uToKind) * step(uToKind, 3.5), uMix);
            gl_PointSize = uPixelRatio * clamp(15.0 / depth, 0.9, 3.4 + armness * 2.2) * sizeBoost * (1.0 + armness * 0.45) * (1.0 + glow * 1.8);
            vGlow = clamp(glow, 0.0, 1.0);
            float waveness = mix(step(uFromKind, 0.5), step(uToKind, 0.5), uMix);
            float crest = mix(0.6, 0.35 + 0.55 * smoothstep(-0.5, 0.65, p.y), waveness);
            crest *= 1.0 - 0.4 * hasPulse;
            float fog = smoothstep(26.0, 5.0, depth);
            vAlpha = fog * crest * bright * shade + lift * 0.4 + glow;
        }
    `;

    const fragmentSource = `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uGlow;
        varying float vAlpha;
        varying float vGlow;
        void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = dot(c, c);
            if (r > 0.25) discard;
            vec3 color = mix(uColor, uGlow, vGlow);
            gl_FragColor = vec4(color, vAlpha * smoothstep(0.25, 0.12, r));
        }
    `;

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
        return shader;
    }

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);

    const makeBuffer = (data) => {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return buffer;
    };
    const noNormalBuffer = makeBuffer(noNormals);
    shapes.forEach((s) => {
        s.buffer = makeBuffer(s.data);
        s.tagBuffer = makeBuffer(s.tag);
        s.normalBuffer = s.normal ? makeBuffer(s.normal) : noNormalBuffer;
    });
    const seedBuffer = makeBuffer(seeds);

    const armShape = shapes.find((s) => s.kind === KIND.arm);
    if (armShape && ARM_SRC) {
        fetch(ARM_SRC)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
            .then((buffer) => {
                Object.assign(armShape, decodeArm(buffer));
                for (const [target, data] of [[armShape.buffer, armShape.data], [armShape.tagBuffer, armShape.tag],
                    [armShape.normalBuffer, armShape.normal]]) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, target);
                    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
                }
                if (reduceMotion) draw(performance.now());
            })
            .catch((error) => console.warn("Robot arm points unavailable:", error));
    }

    const attr = {
        from: gl.getAttribLocation(program, "aFrom"),
        to: gl.getAttribLocation(program, "aTo"),
        seed: gl.getAttribLocation(program, "aSeed"),
        tagFrom: gl.getAttribLocation(program, "aTagFrom"),
        tagTo: gl.getAttribLocation(program, "aTagTo"),
        normalFrom: gl.getAttribLocation(program, "aNormalFrom"),
        normalTo: gl.getAttribLocation(program, "aNormalTo"),
    };
    const bindAttr = (location, buffer, size = 3) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    bindAttr(attr.seed, seedBuffer);

    const u = {};
    for (const name of ["uViewProj", "uTime", "uAspect", "uMouse", "uMouseStrength", "uPixelRatio", "uColor", "uGlow", "uMix",
        "uFromKind", "uToKind", "uFromTilt", "uToTilt", "uFromScale", "uToScale", "uFromShift", "uToShift", "uFromDrop", "uToDrop", "uFromRoll", "uToRoll", "uCenter", "uEye"]) {
        u[name] = gl.getUniformLocation(program, name);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function applyPalette(name) {
        const chosen = PALETTE[name] || PALETTE.night;
        bg = scale(chosen.bg);
        fg = scale(chosen.fg);
        glow = scale(chosen.glow);
        gl.clearColor(bg[0], bg[1], bg[2], 1);
        gl.uniform3f(u.uColor, fg[0], fg[1], fg[2]);
        gl.uniform3f(u.uGlow, glow[0], glow[1], glow[2]);
    }
    applyPalette(document.documentElement.classList.contains("day") ? "day" : "night");

    function perspective(fovY, aspect, near, far) {
        const f = 1 / Math.tan(fovY / 2);
        const nf = 1 / (near - far);
        return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    }

    function lookAt(eye, target, up) {
        let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
        let len = Math.hypot(zx, zy, zz);
        zx /= len; zy /= len; zz /= len;
        let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
        len = Math.hypot(xx, xy, xz);
        xx /= len; xy /= len; xz /= len;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        return [
            xx, yx, zx, 0,
            xy, yy, zy, 0,
            xz, yz, zz, 0,
            -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
            -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
            -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
            1,
        ];
    }

    function multiply(a, b) {
        const out = new Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                out[c * 4 + r] =
                    a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return out;
    }

    let aspect = 1;
    let pixelRatio = 1;

    function resize() {
        pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(canvas.clientWidth * pixelRatio);
        canvas.height = Math.round(canvas.clientHeight * pixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);
        aspect = canvas.clientWidth / canvas.clientHeight;
    }

    // ---------- state ----------
    const initial = Math.max(0, shapes.findIndex((s) => slug(s.name) === slug(requested)));
    const state = {
        from: initial, to: initial, morphStart: 0, morphing: false, pending: null, manual: false,
        holdStart: performance.now(),
    };
    const listeners = [];

    function setShape(index) {
        if (state.morphing) {
            state.pending = index;
            return;
        }
        if (index === state.to) return;
        state.from = state.to;
        state.to = index;
        state.morphing = true;
        state.morphStart = performance.now();
        listeners.forEach((fn) => fn(index));
        if (reduceMotion) {
            state.from = index;
            state.morphing = false;
            draw(performance.now());
        }
    }

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const mouse = { x: 0, y: -2, tx: 0, ty: -2, strength: 0, target: 0 };
    window.addEventListener("pointermove", (e) => {
        mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
        mouse.target = 1;
    });
    document.addEventListener("pointerleave", () => (mouse.target = 0));

    let scrollTilt = 0;
    window.addEventListener("scroll", () => (scrollTilt = Math.min(window.scrollY / window.innerHeight, 1)), {
        passive: true,
    });

    const start = performance.now();

    // The tens place of real time picks the shape: one shape per 10 seconds, the same for everyone.
    // Each block holds for 5 seconds, morphs for 2, then rests on the next shape until the block ends.
    let clockShown = -1;
    function applyClock() {
        const sec = Date.now() / 1000;
        const slot = Math.floor(sec / SLOT_S);
        const into = sec - slot * SLOT_S;
        const count = shapes.length;
        const index = ((slot % count) + count) % count;
        const next = (index + 1) % count;
        let shown = index;
        let mix = 0;
        if (into < HOLD_S) {
            state.from = index;
            state.to = index;
        } else if (into < HOLD_S + MORPH_S) {
            state.from = index;
            state.to = next;
            mix = ease((into - HOLD_S) / MORPH_S);
            shown = next;
        } else {
            state.from = next;
            state.to = next;
            shown = next;
        }
        if (shown !== clockShown) {
            clockShown = shown;
            listeners.forEach((fn) => fn(shown));
        }
        return mix;
    }

    function draw(now) {
        const t = reduceMotion ? 6 : (now - start) / 1000;

        let m = 0;
        if (cycling && !reduceMotion && !state.manual) {
            m = applyClock();
        } else if (state.morphing) {
            const p = Math.min((now - state.morphStart) / MORPH_MS, 1);
            m = ease(p);
            if (p >= 1) {
                state.from = state.to;
                state.morphing = false;
                state.holdStart = now;
                m = 0;
                if (state.pending !== null) {
                    const next = state.pending;
                    state.pending = null;
                    setShape(next);
                }
            }
        } else if (cycling && !reduceMotion && state.manual && now - state.holdStart > MANUAL_HOLD_MS) {
            state.manual = false;
        }

        mouse.x += (mouse.tx - mouse.x) * 0.08;
        mouse.y += (mouse.ty - mouse.y) * 0.08;
        mouse.strength += (mouse.target - mouse.strength) * 0.04;

        const eye = [Math.sin(t * 0.05) * 0.6, 2.1 + scrollTilt * 2.2, 6.5 - scrollTilt * 1.5];
        const view = lookAt(eye, [0, -0.2, -3], [0, 1, 0]);
        const viewProj = multiply(perspective((48 * Math.PI) / 180, aspect, 0.1, 60), view);
        const wide = aspect > 1.1;
        const from = shapes[state.from];
        const to = shapes[state.to];
        const armScale = (shape) => (shape.kind === KIND.arm && !wide ? 1.85 : 1);
        const sizeFactor = wide ? 1 : 0.62;
        const armMix = ((from.kind === KIND.arm ? 1 : 0) * (1 - m)) + ((to.kind === KIND.arm ? 1 : 0) * m);

        bindAttr(attr.from, from.buffer);
        bindAttr(attr.to, to.buffer);
        bindAttr(attr.tagFrom, from.tagBuffer, 1);
        bindAttr(attr.tagTo, to.tagBuffer, 1);
        bindAttr(attr.normalFrom, from.normalBuffer);
        bindAttr(attr.normalTo, to.normalBuffer);
        gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
        gl.uniform1f(u.uTime, t);
        gl.uniform1f(u.uAspect, aspect);
        gl.uniform2f(u.uMouse, mouse.x, mouse.y);
        gl.uniform1f(u.uMouseStrength, mouse.strength);
        gl.uniform1f(u.uPixelRatio, pixelRatio);
        gl.uniform1f(u.uMix, m);
        gl.uniform1f(u.uFromKind, from.kind);
        gl.uniform1f(u.uToKind, to.kind);
        gl.uniform1f(u.uFromTilt, from.tilt);
        gl.uniform1f(u.uToTilt, to.tilt);
        gl.uniform1f(u.uFromScale, from.scale * sizeFactor * armScale(from));
        gl.uniform1f(u.uToScale, to.scale * sizeFactor * armScale(to));
        gl.uniform1f(u.uFromShift, from.shift || 0);
        gl.uniform1f(u.uToShift, to.shift || 0);
        gl.uniform1f(u.uFromDrop, from.drop || 0);
        gl.uniform1f(u.uToDrop, to.drop || 0);
        gl.uniform1f(u.uFromRoll, from.roll || 0);
        gl.uniform1f(u.uToRoll, to.roll || 0);
        gl.uniform3f(u.uCenter,
            wide ? 3.0 : armMix * 1.15,
            wide ? 0.25 : 1.0 - armMix * 1.35,
            wide ? -1.0 : -2.5 + armMix * 1.35);
        gl.uniform3f(u.uEye, eye[0], eye[1], eye[2]);

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.POINTS, 0, N);
    }

    function loop(now) {
        draw(now);
        requestAnimationFrame(loop);
    }

    window.addEventListener("resize", () => {
        resize();
        if (reduceMotion) draw(performance.now());
    });

    if (cycling && !reduceMotion) applyClock();

    window.particleScene = {
        shapes: shapes.map((s) => s.name),
        current: () => state.to,
        setShape: (index) => {
            state.manual = true;
            setShape(index);
        },
        onChange: (fn) => listeners.push(fn),
        setPalette: applyPalette,
    };

    resize();
    if (reduceMotion) draw(performance.now());
    else requestAnimationFrame(loop);
})();
