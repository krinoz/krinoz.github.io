(() => {
    const root = document.documentElement;
    const group = document.getElementById("theme");
    if (!group || !window.particleScene) return;
    const buttons = [...group.querySelectorAll("button[data-mode]")];

    const paint = (name) => {
        root.classList.toggle("day", name === "day");
        buttons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.mode === name));
        });
        window.particleScene.setPalette(name);
    };

    paint(root.classList.contains("day") ? "day" : "night");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const next = button.dataset.mode;
            try { localStorage.setItem("krinos-theme", next); } catch (e) { /* private mode */ }
            paint(next);
        });
    });
})();
