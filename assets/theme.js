(() => {
    const root = document.documentElement;
    const button = document.getElementById("theme");
    if (!button || !window.particleScene) return;

    const paint = (name) => {
        const day = name === "day";
        root.classList.toggle("day", day);
        button.textContent = day ? "Night" : "Day";
        button.setAttribute("aria-pressed", String(day));
        button.setAttribute("aria-label", day ? "Switch to night" : "Switch to day");
        window.particleScene.setPalette(name);
    };

    paint(root.classList.contains("day") ? "day" : "night");
    button.addEventListener("click", () => {
        const next = root.classList.contains("day") ? "night" : "day";
        try { localStorage.setItem("krinos-theme", next); } catch (e) { /* private mode */ }
        paint(next);
    });
})();
