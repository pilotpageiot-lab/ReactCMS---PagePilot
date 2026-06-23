<div align="center">

<img src="https://img.shields.io/badge/PagePilot-22C55E?style=for-the-badge&logoColor=white" alt="PagePilot" />

# PagePilot

**Edit your website instantly. No developer needed.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-→-22C55E?style=flat-square)](https://pilotpageiot-lab.github.io/ReactCMS---PagePilot/)
[![GitHub Stars](https://img.shields.io/github/stars/pilotpageiot-lab/ReactCMS---PagePilot?style=flat-square&color=22C55E)](https://github.com/pilotpageiot-lab/ReactCMS---PagePilot/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](LICENSE)
[![Stack: MERN](https://img.shields.io/badge/Stack-MERN-22C55E?style=flat-square)]()

</div>

---

PagePilot is a lightweight content editing layer for small business owners. It turns any website into an editable system in minutes — no CMS migration, no page builder, no developer on call for every small change.

> **"The simplest way to update website content without code or developers."**

---

## What it is

Small businesses constantly need to update things on their websites — opening hours, prices, a phone number, a seasonal offer. Every one of those changes normally means contacting a developer, waiting, and paying.

PagePilot fixes that. Add one script tag to any website and your content becomes click-to-edit. Change it yourself, hit save, and it's live in seconds.

This repository contains the **ReactCMS — PagePilot** core: a MERN-stack headless CMS that powers the backend of the PagePilot editing system, with a rich-text dashboard, JWT authentication, role-based access control, and multisite support.

---

## Live landing page

The product landing page (with interactive demo) is hosted via GitHub Pages:

**[pilotpageiot-lab.github.io/ReactCMS---PagePilot](https://pilotpageiot-lab.github.io/ReactCMS---PagePilot/)**

The source lives in [`docs/index.html`](docs/index.html) in this repository.

---

## Features

- **Instant publishing** — changes go live the moment you save, no cache clearing or deploys
- **Any website** — works via a single `<script>` tag on any HTML page (WordPress, Webflow, static, custom)
- **No learning curve** — click, type, save; that's the whole interface
- **Rich-text dashboard** — for power users who prefer a panel over in-page editing
- **Headless REST API** — fetch and update content from any frontend
- **JWT authentication** — secure, token-based login
- **Role-based access control** — owner, editor, viewer roles per site
- **Multisite support** — manage content across multiple domains from one installation
- **Edit history** — every change is logged; roll back anytime

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Redux |
| Backend | Node.js, Express |
| Database | MongoDB |
| Auth | JWT (JSON Web Tokens) |
| API | Headless REST |
| Landing page | Vanilla HTML/CSS (self-contained) |

---

## Getting started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/pilotpageiot-lab/ReactCMS---PagePilot.git
cd ReactCMS---PagePilot
```

### 2. Set up the server

```bash
cd server
npm install
```

Import the sites configuration into MongoDB:

```bash
mongoimport --drop -d pagepilot -c sites sites.json
```

Start the server:

```bash
npm start
# Server runs at http://localhost:3001
```

### 3. Set up the client

```bash
cd ../client
npm install
```

Open `src/config.js` and set your API URL:

```js
export const API_URL = 'http://localhost:3001';
```

Start the React app:

```bash
npm start
# Client runs at http://localhost:3000
```

### 4. Add PagePilot to any website

Once your server is running, add this to any website's `<head>`:

```html
<script src="http://localhost:3001/pagepilot.js" data-site="YOUR_SITE_ID"></script>
```

Log in with your credentials and your content becomes click-to-edit.

---

## GitHub Pages setup (landing page)

The `docs/` folder contains the standalone HTML landing page. To enable GitHub Pages:

1. Go to your repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` · Folder: `/docs`
4. Save — your page will be live at:
   `https://pilotpageiot-lab.github.io/ReactCMS---PagePilot/`

To update the landing page, edit `docs/index.html` and push to `main`. GitHub Pages deploys automatically within ~60 seconds.

---

## Project structure

```
ReactCMS---PagePilot/
├── docs/                   # GitHub Pages landing page
│   └── index.html          # Self-contained landing page with live demo
├── client/                 # React frontend (dashboard + editing UI)
│   ├── src/
│   │   ├── config.js       # API URL config
│   │   ├── components/
│   │   └── ...
│   └── package.json
├── server/                 # Node.js + Express API
│   ├── sites.json          # Multisite seed data
│   ├── routes/
│   ├── models/
│   └── package.json
└── README.md
```

---

## API overview

The PagePilot REST API exposes endpoints for content management across sites.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Get a JWT token |
| `GET` | `/sites` | List all sites |
| `GET` | `/sites/:id/content` | Get all content for a site |
| `PUT` | `/sites/:id/content/:key` | Update a content field |
| `GET` | `/sites/:id/history` | View edit history |
| `POST` | `/sites/:id/rollback/:revision` | Restore a previous revision |

All protected routes require `Authorization: Bearer <token>` in the request header.

---

## Pricing (SaaS product)

PagePilot is free to self-host. The hosted SaaS version is available at three tiers:

| Plan | Price | Websites | Notes |
|---|---|---|---|
| Free | $0/mo | 1 | Unlimited edits, 7-day history |
| Pro | $9/mo | 3 | 90-day history, priority support |
| Agency | $49/mo | Unlimited | Client logins, white-label toolbar, 1-year history |

---

## Contributing

Contributions are welcome. To get started:

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a pull request

For bugs or feature requests, [open an issue](https://github.com/pilotpageiot-lab/ReactCMS---PagePilot/issues).

---

## Roadmap

- [ ] Hosted SaaS launch
- [ ] PagePilot script CDN delivery
- [ ] Image editing support
- [ ] Scheduled content publishing
- [ ] Webhook notifications on save
- [ ] Agency white-label dashboard

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <strong>PagePilot</strong> · Built by <a href="https://github.com/pilotpageiot-lab">pilotpageiot-lab</a><br/>
  <a href="https://pilotpageiot-lab.github.io/ReactCMS---PagePilot/">Landing page</a> · 
  <a href="https://github.com/pilotpageiot-lab/ReactCMS---PagePilot/issues">Issues</a> · 
  <a href="https://github.com/pilotpageiot-lab/ReactCMS---PagePilot/discussions">Discussions</a>
</div>
