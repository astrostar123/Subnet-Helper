# SubnetMaster

**A free, professional IPv4 subnet calculator that also teaches you *how* subnetting works.**

SubnetMaster is a single-page web app built with pure HTML5, CSS3 and vanilla JavaScript - no frameworks, no build step, no external libraries. It runs entirely in your browser, works offline once loaded, and never sends any data anywhere. Designed for anyone preparing for **CCNA**, **CompTIA Network+**, or **Fortinet NSE** certifications, or just doing real network design.

---

## ✨ Features

| Tool | What it does |
|------|--------------|
| **IPv4 Subnet Calculator** | Enter an IP + CIDR *or* an IP + required hosts. Get network, broadcast, host range, subnet mask, wildcard mask, binary mask, totals, usable hosts, subnet count and address class. |
| **Host Calculator** | Enter required hosts → get the smallest fitting CIDR, mask, total addresses, wasted hosts and efficiency %. |
| **Step-by-Step Learning** | Every calculation is explained in numbered, beginner-friendly steps (nearest power of two, reserved addresses, host bits, the AND trick, the block-size shortcut). |
| **Binary Visualizer** | An animated 32-bit grid. Drag the CIDR slider and watch network bits and host bits change in real time. |
| **VLSM Helper** | Enter multiple networks with host requirements (Office A: 100, Office B: 50…) and get a correct largest-first allocation plan with ranges and broadcasts. |
| **Practice Mode** | Endless random questions (hosts→CIDR, mask↔CIDR, network/broadcast, usable hosts) with instant checking and full explanations. |
| **Quiz Mode** | 20 timed random questions with score, percentage, per-question review and a local leaderboard. |
| **Cheat Sheet** | The /24-/30 quick-reference table plus the "magic number" block-size trick. |
| **Full CIDR Table** | Every prefix /1-/32 with instant search across masks, wildcards and host counts. |
| **PDF Export** | One click exports the current calculation as a clean printable report (browser print-to-PDF - zero dependencies). |
| **History** | Your last 50 calculations, saved in LocalStorage. |
| **Accessibility** | Full keyboard navigation (roving tabs, arrow keys), screen-reader labels and live regions, visible focus rings, a high-contrast mode, and `prefers-reduced-motion` support. |

## 🖼️ Screenshots

> _Add screenshots here after deployment:_
>
> ![Calculator screenshot](assets/images/screenshot-calculator.png)
> ![Binary visualizer screenshot](assets/images/screenshot-binary.png)
> ![Quiz mode screenshot](assets/images/screenshot-quiz.png)

## 📁 Project structure

```
subnetmaster/
├── index.html      # Single-page app markup
├── style.css       # Dark glassmorphism theme, responsive, print styles
├── script.js       # All application logic (modular, commented, dependency-free)
├── assets/
│   ├── icons/      # logo.svg, favicon.svg
│   └── images/     # screenshots (add your own)
└── README.md
```

## 🚀 Installation (local)

No build tools required.

```bash
git clone https://github.com/YOUR_USERNAME/subnetmaster.git
cd subnetmaster
```

Then either open `index.html` directly in a browser, or serve it locally:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Visit `http://localhost:8000`.

## 🌐 Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch `main` and folder `/ (root)`, then **Save**.
5. Your site goes live at `https://YOUR_USERNAME.github.io/subnetmaster/` within a minute or two.

Because the app uses only relative paths and zero server-side code, it is 100% GitHub Pages compatible out of the box.

## ⚡ Performance

- **No external libraries, fonts or CDNs** - three static files, fully offline-capable after first load.
- All subnet math is unsigned 32-bit integer arithmetic (no string parsing in hot paths).
- The CIDR search filters a pre-computed index for instant results.
- CSS animations respect `prefers-reduced-motion`.

## 🔮 Future improvements

- IPv6 subnet calculator and visualizer
- Supernetting / route summarization tool
- Shareable calculation URLs (query-string state)
- Dark/light theme switch in addition to high-contrast
- Export VLSM plans to CSV
- Spaced-repetition flashcard mode
- PWA manifest + service worker for installable offline use

## 📄 License

MIT License - free to use, modify and distribute.

```
Copyright (c) 2026 SubnetMaster contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
