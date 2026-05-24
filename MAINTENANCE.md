# Site Maintenance Guide

This document explains how to update your personal website when you have new content to add.

---

## File Structure

```
krinoz.github.io-gh-pages/
├── index.html              ← Home page (intro + education + research + experience)
├── publications.html       ← Publications page (papers grouped by research area)
├── assets/
│   ├── stylesheets/
│   │   └── custom.css      ← All styles
│   ├── fontawesome-free-7.2.0-web/
│   └── figures/
│       └── portrait.jpg    ← Profile photo
```

---

## 1. Update Introduction (Hero Section)

**File:** `index.html`  
**Location:** Lines inside `<div class="home-intro">` (near the top)

```html
<h1 class="title">Hello</h1>
<p>
    I am Krinos Li,<br>
    a Ph.D. student at ...
</p>
<p>
    <em>My long-term goal is ...</em>
</p>
```

Edit the `<p>` tags directly to change your bio or research statement.

---

## 2. Add/Edit Research Directions

**File:** `index.html`  
**Location:** Inside `<!-- 02 / Research -->` section

```html
<div class="about-content">
    <p>My research spans three interconnected themes:</p>
    <ul>
        <li><b>Multimodal AI</b>: Description...</li>
        <li><b>Agentic AI</b>: Description...</li>
        <li><b>AI for Life Science</b>: Description...</li>
    </ul>
</div>
```

To add a new direction, add another `<li><b>New Area</b>: Description...</li>` inside the `<ul>`.

---

## 3. Add New Experience

**File:** `index.html`  
**Location:** Inside `<!-- 03 / Experience -->` section

Add a new `<li>` inside `<ul class="exp-list">`:

```html
<li>
    <span class="exp-info"><b>Job Title</b> &mdash; Company Name, Location</span>
    <span class="exp-time">Start &ndash; End Year</span>
</li>
```

Items are displayed in the order they appear in HTML — put the most recent one first.

---

## 4. Add New Publication

**File:** `publications.html`  
**Location:** Under the relevant research area heading (`Multimodal AI`, `Agentic AI`, or `AI for Life Science`)

Add a new `<div class="pub-item">` block:

```html
<div class="pub-item">
    <div class="pub-venue">Journal or Conference Name, Year</div>
    <div class="pub-title">Paper Title</div>
    <div class="pub-authors">Author1, <span class="me">K Li</span>, Author3, ...</div>
</div>
```

**Rules:**
- Line 1 (`pub-venue`): Journal/conference name + year — rendered in italic gray
- Line 2 (`pub-title`): Full paper title — rendered bold
- Line 3 (`pub-authors`): All authors — wrap your name in `<span class="me">K Li</span>` to highlight it
- Within each research area, put newer papers (2026) before older ones (2025)

**To add a new research area section:**

```html
<h2 class="pub-year-heading">New Area Name</h2>

<div class="pub-item">
    ...
</div>
```

---

## 5. Update Education

**File:** `index.html`  
**Location:** Inside `<!-- 01 / Education -->` section

Edit the paragraph text directly. It's a single `<p>` block describing your degrees in prose form.

---

## 6. Change Profile Photo

Replace the file at `assets/figures/portrait.jpg` with your new photo (keep the same filename).

---

## 7. Update Social Links

**File:** Both `index.html` and `publications.html`  
**Location:** Inside `<div class="social">` in the nav bar

```html
<div class="icon"><a href="mailto:your@email.com"><i class="fa-solid fa-envelope"></i></a></div>
<div class="icon"><a href="https://scholar.google..." target="_blank"><i class="fa-solid fa-graduation-cap"></i></a></div>
```

Remember to update in **both** files to keep nav consistent.

---

## 8. Add a New Page

1. Copy `publications.html` as a starting template
2. Change the `<title>` and content
3. Add a nav link in both `index.html` and `publications.html`:

```html
<div class="menu">
    <a href="index.html">Home</a>
    <a href="publications.html">Publications</a>
    <a href="newpage.html">New Page</a>
    <div class="menu-dot"></div>
</div>
```

---

## Special Characters Reference

| Character | HTML Code |
|-----------|-----------|
| — (em dash) | `&mdash;` |
| – (en dash) | `&ndash;` |
| β (beta) | `&beta;` |
| & (ampersand) | `&amp;` |
| non-breaking space | `&nbsp;` |
