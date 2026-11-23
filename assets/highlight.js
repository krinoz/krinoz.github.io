// Morandi chips. The first two letters pick the colour, so the same words match on every page.
const HIGHLIGHTS = [
    "#aeb8c4", "#c2b3c0", "#c4b2a8", "#b7b1a6", "#c9c2b2",
    "#d4c7c0", "#cbbba4", "#c5c0b8", "#b3c0b4", "#cfc3b4"
];

function highlightKey(text) {
    const letters = String(text || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (letters.length >= 2) return (letters.charCodeAt(0) - 65) * 26 + (letters.charCodeAt(1) - 65);
    const raw = String(text || "").trim();
    if (!raw) return 0;
    return raw.charCodeAt(0) * 31 + (raw.charCodeAt(1) || 0);
}

function highlight(target = ".tint") {
    const nodes = typeof target === "string"
        ? document.querySelectorAll(target)
        : target instanceof Element ? [target] : target;
    nodes.forEach((node) => {
        node.classList.add("tint");
        const color = HIGHLIGHTS[highlightKey(node.textContent) % HIGHLIGHTS.length];
        node.style.setProperty("background", color, "important");
        node.style.setProperty("color", "#2c2926", "important");
    });
}

window.highlight = highlight;
window.addEventListener("pageshow", (event) => { if (event.persisted) highlight(); });
