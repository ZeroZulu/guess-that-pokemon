<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0a0a1a,50:FFD700,100:FF6B35&height=200&section=header&text=Who%27s%20That%20Pok%C3%A9mon%3F&fontSize=42&fontColor=ffffff&fontAlignY=35&desc=The%20Ultimate%20Challenge&descSize=16&descAlignY=55&animation=fadeIn" width="100%" />

<a href="#">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=22&duration=3000&pause=1000&color=FFD700&center=true&vCenter=true&repeat=true&width=435&height=35&lines=1%2C025%2B+Pok%C3%A9mon+%7C+9+Generations;3+Game+Modes+%7C+3+Difficulties;Auto-Syncing+via+Pok%C3%A9API" alt="Typing SVG" />
</a>

<br/>

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=for-the-badge&logo=github&logoColor=white)

<br/>

![Pokémon](https://img.shields.io/badge/Pok%C3%A9mon-1,025+-E63946?style=flat-square&labelColor=1a0a2e)
![Generations](https://img.shields.io/badge/Generations-9-FFD700?style=flat-square&labelColor=1a0a2e)
![Bundle](https://img.shields.io/badge/Bundle-66kb_gzip-2A9D8F?style=flat-square&labelColor=1a0a2e)
![License](https://img.shields.io/badge/License-MIT-457B9D?style=flat-square&labelColor=1a0a2e)

<br/><br/>

[<img src="https://img.shields.io/badge/%E2%96%B6_PLAY_NOW-FFD700?style=for-the-badge&logoColor=black" height="40" />](https://guess-that-pokemon-three.vercel.app)

</div>

---

## 📸 Screenshots

<table>
<tr>
<td align="center" width="50%">
<img src="./screenshots/home.png" alt="Title Screen" width="100%" />
<br/><b>Title Screen</b>
</td>
<td align="center" width="50%">
<img src="./screenshots/settings.png" alt="Challenge Settings" width="100%" />
<br/><b>Challenge Settings</b>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="./screenshots/normal.png" alt="Silhouette Mode - Normal" width="100%" />
<br/><b>Silhouette — Normal Mode</b>
</td>
<td align="center" width="50%">
<img src="./screenshots/easy.png" alt="Silhouette Mode - Easy" width="100%" />
<br/><b>Silhouette — Easy Mode</b>
</td>
</tr>
</table>

---

## 🎮 Game Modes

<table>
<tr>
<td align="center" width="33%">

### 👤
### Silhouette
Classic shadow outline guessing —<br/>the original TV show experience

</td>
<td align="center" width="33%">

### 🔍
### Zoom In
Extreme close-up crop —<br/>hints progressively zoom out

</td>
<td align="center" width="33%">

### ⚡
### Type Expert
No image — only type badges<br/>& Pokédex number. Masters only

</td>
</tr>
</table>

## ✨ What Makes It Unique

<table>
<tr><td>🔄</td><td><b>Auto-Sync DB</b></td><td>1,025 Pokémon offline + live PokeAPI sync for new releases. Future-proof forever</td></tr>
<tr><td>🔥</td><td><b>Streak Combos</b></td><td><code>GREAT!</code> → <code>ON FIRE!</code> → <code>SUPER EFFECTIVE!</code> → <code>LEGENDARY!</code></td></tr>
<tr><td>💡</td><td><b>Progressive Hints</b></td><td>Type reveal → First letter → Partial name fill</td></tr>
<tr><td>✨</td><td><b>Particle FX</b></td><td>Type-colored burst particles on correct guesses</td></tr>
<tr><td>📳</td><td><b>Screen Shake</b></td><td>Tactile feedback on wrong answers</td></tr>
<tr><td>⏱️</td><td><b>Dynamic Timer</b></td><td>Pulsing red bar when time runs low</td></tr>
<tr><td>🏆</td><td><b>Rank System</b></td><td>Rookie → Trainer → Gym Leader → Elite Four → Pokémon Master</td></tr>
<tr><td>📦</td><td><b>Caught Strip</b></td><td>Watch your collection grow at the bottom during each session</td></tr>
</table>

## ⚡ Quick Start

```bash
git clone https://github.com/ZeroZulu/guess-that-pokemon.git
cd guess-that-pokemon
npm install
npm run dev
```

## 🚀 Deploy

<table>
<tr>
<td align="center" width="50%"><b>▲ Vercel</b></td>
<td align="center" width="50%"><b>◆ GitHub Pages</b></td>
</tr>
<tr>
<td align="center">

Import repo at <a href="https://vercel.com/new">vercel.com/new</a><br/>→ Click <b>Deploy</b> → Done

</td>
<td align="center">

Repo <b>Settings → Pages</b> → Source: <b>GitHub Actions</b><br/>→ Auto-deploys on every push

</td>
</tr>
</table>

## 🔄 Auto-Sync Architecture

```
┌──────────────────────────────────────────────────┐
│              APP LOADS INSTANTLY                  │
│          (1,025 hardcoded Pokémon)                │
└─────────────────────┬────────────────────────────┘
                      │ background
                      ▼
┌──────────────────────────────────────────────────┐
│          CHECK PokeAPI species count             │
│   pokeapi.co/api/v2/pokemon-species/?limit=1     │
└─────────────────────┬────────────────────────────┘
                      │
             ┌────────┴────────┐
             ▼                 ▼
      count ≤ 1025       count > 1025
      ┌──────────┐    ┌────────────────┐
      │  No sync │    │  Fetch new in  │
      │  needed  │    │  batches of 10 │
      └──────────┘    └───────┬────────┘
                              ▼
                     ┌────────────────┐
                     │  Merge + auto  │
                     │  detect new    │
                     │  generations   │
                     └────────────────┘
```

## 🛠 Stack

`React 18` · `Vite` · `PokeAPI Sprites` · `Pure CSS Animations` · `Zero UI deps`

## 📊 Data

[Kaggle Pokemon Dataset](https://www.kaggle.com/datasets/vishalsubbiah/pokemon-images-and-types/data) by Vishal Subbiah · [PokeAPI Sprites](https://github.com/PokeAPI/sprites)

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:FF6B35,50:FFD700,100:0a0a1a&height=100&section=footer" width="100%" />

**MIT License** · *Gotta guess 'em all!*

</div>
