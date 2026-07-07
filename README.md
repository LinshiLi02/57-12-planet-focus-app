# 57-12 Planet Focus App

A playful weekly focus timer app where each completed 52/17 work slot grows a flower on a personal 3D planet.

## How to Use

1. Open `index.html` in a browser.
2. Press **Start** to begin a 52-minute work session.
3. When the work timer ends, the app switches to a 17-minute break.
4. When the break ends, one flower is added to this week's planet.
5. Use **Pause** to stop the timer, **Reset** to return to a fresh work session, or **Complete Slot Manually** to add a completed slot right away.
6. Drag the planet with a mouse or finger to rotate it.
7. Press **View Planet** to open the larger planet view, then press **Back** to return to the timer.

The app stores flowers and slot counts in `localStorage`, so progress stays after refreshing the page. A new planet is used for each week.

## Deploy with GitHub Pages

1. In GitHub, open this repository's settings.
2. Go to **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the root folder.
5. Save. GitHub will publish the app and show the live URL when deployment is ready.

No build step or package installation is required. The 3D scene loads Three.js from a CDN.
