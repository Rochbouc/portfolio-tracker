# Portfolio Tracker

A standalone React stock portfolio tracking app. No backend required — all data lives in your browser's localStorage.

## Features
- Track stock holdings with live price refresh (Yahoo Finance)
- Transaction history (buy/sell)
- Dividend tracking with charts
- Portfolio analytics — sector allocation, performance summary
- Watchlist with live prices
- Price alerts (visual)
- Export/import backup as JSON

## Run Locally
```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push this project to a new GitHub repo
2. Go to **Settings → Pages**
3. Under **Build and deployment**, select **GitHub Actions**
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` will build and deploy automatically
5. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

## Notes
- Data is stored in `localStorage` — clearing browser data will clear your portfolio
- Use the **Settings → Backup & Restore** tab to export a JSON backup
- Live prices use Yahoo Finance's unofficial API via a CORS proxy — occasional failures are normal
