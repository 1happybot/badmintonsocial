# 🎨 Professional Typography System - TopMinton

## Overview

A comprehensive, professional typography system built with:
- **CSS Custom Properties** (CSS Variables) for theming
- **Modular Scale** (1.125 ratio) for consistent sizing
- **Semantic HTML** with meaningful elements
- **WCAG AA Accessibility** standards
- **Light & Dark Mode** support (Bootstrap themes)
- **Responsive** design (mobile-first)
- **Print-optimized** styles

---

## 🎯 Core Principles

1. **Clarity**: Easy to read at any size
2. **Hierarchy**: Clear visual importance through size and weight
3. **Consistency**: Predictable patterns throughout the app
4. **Accessibility**: WCAG AA contrast ratios, semantic HTML
5. **Performance**: CSS variables for fast theme switching
6. **Flexibility**: Works in light/dark modes automatically

---

## 📚 Font Stack

### Primary Font
```css
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```
**Why**: System fonts load instantly, feel native on each OS, excellent readability.

### Monospace Font
```css
"Monaco", "Courier New", monospace
```
**For**: Code blocks, technical content, data display.

---

## 📏 Font Size Scale

**Modular Scale Ratio: 1.125** (8px increments for easy math)

| Variable | Size | Use Case | Example |
|----------|------|----------|---------|
| `--tm-font-size-xs` | 12px | Small labels, tags | Badge labels |
| `--tm-font-size-sm` | 14px | Captions, form labels | Form hints |
| `--tm-font-size-base` | 16px | **Body text** | Paragraphs |
| `--tm-font-size-lg` | 18px | Larger text | Form inputs |
| `--tm-font-size-xl` | 20px | Section intro | Card titles |
| `--tm-font-size-2xl` | 24px | Subsection | Dialog headings |
| `--tm-font-size-3xl` | 30px | Section heading | Page headers |
| `--tm-font-size-4xl` | 36px | Page heading | Main title |
| `--tm-font-size-5xl` | 48px | Large title | Hero section |
| `--tm-font-size-6xl` | 60px | **Hero title** | Landing page |

### Usage
```html
<p class="text-lg">Larger paragraph</p>
<h1 class="text-5xl">Page title</h1>
<small class="text-xs">Small label</small>
```

---

## 🎭 Font Weights

| Variable | Weight | Use Case |
|----------|--------|----------|
| `--tm-font-weight-light` | 300 | Delicate text |
| `--tm-font-weight-normal` | 400 | **Standard body** |
| `--tm-font-weight-medium` | 500 | Slight emphasis |
| `--tm-font-weight-semibold` | 600 | Labels, button text |
| `--tm-font-weight-bold` | 700 | Headings, strong |
| `--tm-font-weight-extrabold` | 800 | Large headings |
| `--tm-font-weight-black` | 900 | Hero titles |

### Usage
```html
<strong>Bold text</strong>
<span class="fw-semibold">Semibold label</span>
<h1 class="fw-black">Hero title</h1>
```

---

## 📏 Line Heights

**Critical for readability, especially on mobile.**

| Variable | Value | Use Case |
|----------|-------|----------|
| `--tm-line-height-tight` | 1.2 | Headings (more compact) |
| `--tm-line-height-snug` | 1.375 | Section headings |
| `--tm-line-height-normal` | 1.5 | **Standard body text** |
| `--tm-line-height-relaxed` | 1.75 | Long-form content, blog posts |
| `--tm-line-height-loose` | 2 | Extra-spacious (accessibility) |

### Usage
```html
<p class="leading-relaxed">Long article text...</p>
<h3 class="leading-snug">Section title</h3>
```

---

## 📝 Letter Spacing (Tracking)

**Adjusts spacing between characters for emphasis.**

| Variable | Value | Use Case |
|----------|-------|----------|
| `--tm-letter-spacing-tighter` | -0.05em | Compressed titles |
| `--tm-letter-spacing-tight` | -0.025em | Large headings |
| `--tm-letter-spacing-normal` | 0 | **Standard text** |
| `--tm-letter-spacing-wide` | 0.025em | Labels, captions |
| `--tm-letter-spacing-wider` | 0.05em | Uppercase labels |
| `--tm-letter-spacing-widest` | 0.1em | Overlines, emphasis |

### Usage
```html
<h1 class="tracking-tighter">Compact title</h1>
<span class="label tracking-widest">IMPORTANT</span>
```

---

## 🎯 Heading Hierarchy

**Use semantic HTML (h1-h6) - automatically styled!**

### h1 - Page Title
```html
<h1>Welcome to TopMinton</h1>
```
- Size: 48px
- Weight: 900 (Black)
- Line-height: 1.2
- Letter-spacing: -0.05em
- Margin-bottom: 18px

### h2 - Section Title
```html
<h2>About Our Badminton Community</h2>
```
- Size: 36px
- Weight: 800 (Extrabold)
- Margin-top: 24px
- Margin-bottom: 16px

### h3 - Subsection
```html
<h3>Getting Started</h3>
```
- Size: 30px
- Weight: 700 (Bold)
- Margin-top: 16px

### h4 - Subheading
```html
<h4>Step 1: Create an Account</h4>
```
- Size: 24px
- Weight: 600 (Semibold)

### h5 - Minor Heading
```html
<h5>Account Details</h5>
```
- Size: 20px
- Weight: 600 (Semibold)

### h6 - Label/Overline
```html
<h6>QUICK ACTIONS</h6>
```
- Size: 18px
- Weight: 600 (Semibold)
- Text-transform: uppercase
- Letter-spacing: 0.05em

---

## 🏷️ Semantic Text Classes

### Display Classes (Large, impressive text)
```html
<div class="display-1">Huge hero title</div>        <!-- 60px, 900 weight -->
<div class="display-2">Large title</div>            <!-- 48px, 800 weight -->
```

### Lead Paragraph (Introductory text)
```html
<p class="lead">This is an important introduction to the content...</p>
```
- Size: 20px
- Weight: 400
- Line-height: 1.75
- Color: Secondary (muted)

### Label (Form labels, badges, tags)
```html
<span class="label">REQUIRED FIELD</span>
```
- Size: 12px
- Weight: 600
- Text-transform: uppercase
- Letter-spacing: 0.05em

### Caption (Images, footnotes)
```html
<figure>
  <img src="..." />
  <figcaption class="caption">Photo by Jane Doe, 2024</figcaption>
</figure>
```

### Overline (Above text marker)
```html
<div class="overline">NEW FEATURE</div>
<h3>Exciting Update</h3>
```

---

## 🎨 Text Color System

### Primary Color Levels

| Class | Usage | Variable |
|-------|-------|----------|
| `.text-primary` | Main body text | `var(--tm-text-primary)` |
| `.text-secondary` | Secondary info, subtext | `var(--tm-text-secondary)` |
| `.text-tertiary` | Tertiary info, hints | `var(--tm-text-tertiary)` |
| `.text-muted` | Disabled, placeholder | `var(--tm-text-muted)` |

### Bootstrap Theme Colors
```html
<p class="text-success">Success message</p>
<p class="text-warning">Warning text</p>
<p class="text-danger">Error text</p>
<p class="text-info">Information</p>
```

### Implementation Note
- All colors use **CSS custom properties** from Bootstrap
- Automatically adapt to **light/dark mode**
- Maintain **WCAG AA contrast** ratios
- No manual color changes needed!

---

## 📱 Text Size Utility Classes

**Quick size adjustments without headings:**

```html
<p class="text-xs">Extra small text</p>
<p class="text-sm">Small text</p>
<p class="text-base">Normal text</p>
<p class="text-lg">Large text</p>
<p class="text-xl">Extra large</p>
<p class="text-2xl">2x large</p>
<p class="text-3xl">3x large</p>
<p class="text-4xl">4x large</p>
<p class="text-5xl">5x large</p>
<p class="text-6xl">6x large</p>
```

---

## 💪 Font Weight Classes

**Apply weights to any element:**

```html
<p class="fw-light">Light text</p>
<p class="fw-normal">Normal weight</p>
<p class="fw-medium">Medium weight</p>
<p class="fw-semibold">Semibold text</p>
<p class="fw-bold">Bold text</p>
<p class="fw-extrabold">Extra bold</p>
<p class="fw-black">Black weight</p>
```

---

## 📏 Line Height Classes

**Control text spacing:**

```html
<p class="leading-tight">Tight line height (1.2)</p>
<p class="leading-snug">Snug line height (1.375)</p>
<p class="leading-normal">Normal (1.5) - default</p>
<p class="leading-relaxed">Relaxed (1.75)</p>
<p class="leading-loose">Loose (2.0)</p>
```

---

## ✍️ Text Alignment

```html
<p class="text-left">Left aligned</p>
<p class="text-center">Centered</p>
<p class="text-right">Right aligned</p>
<p class="text-justify">Justified text</p>
```

---

## 🔤 Text Transformation

```html
<p class="uppercase">UPPERCASE TEXT</p>
<p class="lowercase">lowercase text</p>
<p class="capitalize">Capitalize Text</p>
<p class="normal-case">nOrMaL cAsE</p>
```

---

## ✂️ Text Truncation

### Single Line
```html
<p class="truncate">This text will be cut off with...</p>
```

### Multiple Lines (Line Clamp)
```html
<p class="line-clamp-1">One line maximum</p>
<p class="line-clamp-2">Two lines maximum</p>
<p class="line-clamp-3">Three lines maximum</p>
```

---

## 📖 Code & Technical Content

### Inline Code
```html
<p>Use the <code>filter()</code> function to...</p>
```
- Gray background
- Monospace font
- Padding: 0.25em 0.5em

### Code Block
```html
<pre><code>
function badminton() {
  return 'fun';
}
</code></pre>
```
- Full width code
- Scrollable if too long
- Border with rounded corners

---

## 📝 List Styling

### Description Lists
```html
<dt>Skill Rating</dt>
<dd>Your level from 1-10, with 1 being beginner and 10 being professional.</dd>

<dt>Hosting</dt>
<dd>Organize your own badminton session and invite others.</dd>
```

---

## 🎯 Real-World Examples

### Navigation
```html
<nav>
  <a href="/" class="text-lg fw-semibold">TopMinton</a>
  <a href="/challenges" class="text-base">Challenges</a>
</nav>
```

### Card
```html
<div class="card">
  <h3>Session Title</h3>
  <p class="text-secondary">Saturday, July 5 · 10:00 AM</p>
  <p>Join other players for a fun doubles match...</p>
</div>
```

### Form Label
```html
<label class="label" for="email">Email Address</label>
<input type="email" id="email" class="form-control" />
<small class="text-secondary">We'll never share your email</small>
```

### Hero Section
```html
<h1 class="display-1">Join the Community</h1>
<p class="lead">Meet badminton players near you and level up your game.</p>
<a href="/register" class="btn btn-primary btn-lg">Get Started</a>
```

### Player Card
```html
<div class="player-card">
  <h5>Alex Chen</h5>
  <p class="text-sm text-secondary">Stockholm · Level 7</p>
  <p class="text-xs">Active player hosting weekly sessions</p>
</div>
```

---

## ♿ Accessibility Features

### WCAG AA Compliance
- ✅ Sufficient color contrast (4.5:1 for text)
- ✅ Large minimum font size (16px base)
- ✅ Proper line height (1.5+)
- ✅ Semantic HTML (h1-h6, strong, em, etc.)
- ✅ Focus indicators on interactive elements

### Focus States
```css
a:focus-visible {
  outline: 3px solid var(--bs-primary);
  outline-offset: 2px;
}
```

### Dark Mode
- Automatically adjusts text colors
- Maintains contrast ratios
- No manual overrides needed

---

## 📱 Responsive Behavior

### Tablet & Below (≤768px)
- h1: Reduced from 48px to 36px
- h2: Reduced from 36px to 30px
- h3: Reduced from 30px to 24px
- Headings remain readable

### Mobile (≤480px)
- Body: 15px (slightly smaller)
- h1: 30px
- h2: 24px
- h3: 20px
- **All sizes remain legible!**

---

## 🌙 Dark Mode Example

```html
<!-- Light Mode (default) -->
<body>
  <h1>Welcome</h1>  <!-- Dark text on light background -->
</body>

<!-- Dark Mode -->
<body data-bs-theme="dark">
  <h1>Welcome</h1>  <!-- Light text on dark background -->
</body>
```
**No CSS changes needed** - automatically handled!

---

## 🚀 How to Use in Your Code

### Option 1: Use Semantic HTML (Recommended)
```html
<h1>My Title</h1>           <!-- Uses all h1 styles -->
<h2>Subtitle</h2>           <!-- Uses all h2 styles -->
<p>Body text</p>            <!-- Normal paragraph -->
<strong>Bold text</strong>  <!-- Bold automatically -->
```

### Option 2: Use Utility Classes
```html
<div class="text-5xl fw-black">My Title</div>
<div class="text-xl fw-semibold">Subtitle</div>
<p class="text-base">Body text</p>
```

### Option 3: Mix Both (Most Flexible)
```html
<h1 class="text-4xl">My Title</h1>    <!-- h1 styling + override size -->
<p class="lead">Introduction...</p>    <!-- Semantic with custom class -->
```

---

## 📊 Quick Reference

| Element | Class | Size | Weight | Usage |
|---------|-------|------|--------|-------|
| `<h1>` | - | 48px | 900 | Page title |
| `<h2>` | - | 36px | 800 | Section title |
| `<h3>` | - | 30px | 700 | Subsection |
| `<h4>` | - | 24px | 600 | Subheading |
| `<h5>` | - | 20px | 600 | Minor heading |
| `<h6>` | - | 18px | 600 | Label |
| `<p>` | - | 16px | 400 | Body text |
| - | `.display-1` | 60px | 900 | Hero title |
| - | `.lead` | 20px | 400 | Intro text |
| - | `.label` | 12px | 600 | Labels |
| - | `.caption` | 14px | 400 | Captions |

---

## 🔄 CSS Variables Reference

### All Available Variables
```css
/* Font Families */
--tm-font-sans
--tm-font-mono

/* Font Sizes (xs to 6xl) */
--tm-font-size-xs through --tm-font-size-6xl

/* Font Weights (thin to black) */
--tm-font-weight-thin through --tm-font-weight-black

/* Line Heights */
--tm-line-height-tight
--tm-line-height-snug
--tm-line-height-normal
--tm-line-height-relaxed
--tm-line-height-loose

/* Letter Spacing */
--tm-letter-spacing-tighter through --tm-letter-spacing-widest

/* Text Colors */
--tm-text-primary
--tm-text-secondary
--tm-text-tertiary
--tm-text-muted
--tm-text-inverse
```

---

## 🎓 Best Practices

1. **Always use semantic HTML first** (h1, p, strong, em, etc.)
2. **Apply utility classes for overrides** (not replacement)
3. **Test in both light and dark modes** before shipping
4. **Check mobile rendering** - sizes scale down automatically
5. **Use `.text-secondary` for hints** - not gray color
6. **Maintain WCAG AA contrast** - built-in but verify
7. **Don't change CSS variables** - theme handles it
8. **Use system fonts** - no extra downloads
9. **Prioritize readability** - over aesthetics
10. **Test with keyboard navigation** - focus states matter

---

## 📋 Checklist for Developers

When implementing text in TopMinton:

- [ ] Use semantic HTML (h1-h6, p, strong, em)
- [ ] Check mobile rendering (test on small screen)
- [ ] Verify light & dark mode appearance
- [ ] Ensure sufficient line height (≥1.5)
- [ ] Confirm color contrast (≥4.5:1)
- [ ] Test keyboard navigation (Tab key)
- [ ] Use utility classes for overrides
- [ ] Avoid inline styles for typography
- [ ] Don't hardcode colors
- [ ] Test with screen readers

---

## 🆘 Troubleshooting

### Text too small on mobile?
```css
/* ❌ Don't do this */
p { font-size: 12px; }

/* ✅ Do this instead */
p { font-size: var(--tm-font-size-sm); }
/* It's 14px, already accessible */
```

### Color not showing in dark mode?
```css
/* ❌ Don't do this */
p { color: #333; }

/* ✅ Do this instead */
p { color: var(--tm-text-primary); }
/* Automatically adapts to theme */
```

### Heading doesn't match design?
```html
<!-- ❌ Don't do this -->
<div class="text-5xl fw-black">Title</div>

<!-- ✅ Do this instead -->
<h1>Title</h1>  <!-- All styles applied automatically -->
```

---

## 🔗 File Location

- **CSS**: `/src/styles/typography.css`
- **Loaded in**: `/src/views/partials/header.ejs`
- **Variables in**: Root `:root` selector
- **Component classes**: `.tm-*` prefix

---

## 📞 Questions?

Refer to:
1. This documentation
2. `/src/styles/typography.css` source
3. Bootstrap Typography Docs: https://getbootstrap.com/docs/5.3/content/typography/
4. WCAG Guidelines: https://www.w3.org/WAI/WCAG21/quickref/

---

**Last Updated**: 2024-06-30
**Version**: 1.0 - Professional Typography System
**Status**: ✅ Production Ready
