# PlantsVSHumans 🌿

A prototype web app that helps roommates keep track of watering their shared plants.

## Requirements

- [Node.js](https://nodejs.org/) version 22 or newer. Run `node -v` to check.

No database or Docker is needed.

## How to run

From the project folder, run:

```bash
npm install
npm start -w backend
```

Then open **http://localhost:3000** in your browser.

To stop the server, press `Ctrl + C` in the terminal.

## How to use it

1. Go to the **Household** tab and add a roommate (for example, yourself).
2. Go to the **Plants** tab and add a plant, including how often it needs water.
3. Go to the **This week** tab and press **💧 Water** when you water a plant.

To test it with more than one roommate:

1. Open the app in a second browser window.
2. In that window, choose a different person from **"I am"** at the top.
3. A watering logged in one window appears in the other right away.
4. If you try to water a plant that was just watered, the app warns you first.

## Run the tests

```bash
npm test -w backend
```

## Troubleshooting

- **Port 3000 is already in use**: start the server on another port with
  `PORT=3001 npm start -w backend`, then open http://localhost:3001.
- **Start over with no data**: stop the server, delete the `backend/data` folder, and start
  the server again.

## Where things are

| Path | What it is |
|---|---|
| `backend/src/server.ts` | The server |
| `backend/public/index.html` | The web page |
| `backend/src/domain/` | Watering schedule and duplicate rules |
| `backend/tests/` | Tests |
| `specs/001-plant-care-tracker/` | Spec, plan, and task documents |
