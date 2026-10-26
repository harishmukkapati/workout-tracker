# Workout Tracker

A desktop app for your 3-day training cycle, food, calories and body weight.
Everything stays on your PC.

## Run it (portable build)

1. Unzip `Workout-Tracker-Windows.zip` somewhere permanent, e.g. `C:\Users\<you>\Apps\Workout Tracker`.
2. Double-click `Workout Tracker.exe`.
   - Windows SmartScreen may say "Windows protected your PC" because the app isn't code-signed.
     Click **More info**, then **Run anyway**. You only do this once.
3. The first launch adds Workout Tracker to your Start menu and desktop. Pin it to the taskbar if you like.

Your data lives in `%APPDATA%\Workout Tracker\data.json`, with 30 days of daily backups in
`%APPDATA%\Workout Tracker\backups`. Updating or moving the app folder never touches your data.

## Updates

The app updates itself from a GitHub repo. Set it once in Settings → Updates (for example
`yourname/workout-tracker`). It checks a few seconds after opening and every 4 hours, downloads the
update, and asks you to restart. If an update ever fails to start, it goes back to the version that
worked. Your data is never touched by updates.

## Run from source (optional)

Needs Node.js 20 or newer (https://nodejs.org).

- `start.bat`: installs dependencies the first time, then opens the app.
- `build-installer.bat`: builds a normal Windows installer into `dist\`.

## How the schedule works

- Day 1 train, Day 2 train, Day 3 rest, repeat. Day 1 was Monday, Oct 26, 2026.
- A training day counts when you press **Finish workout** or check off at least half of it
  (change this in Settings).
- If a training day passes without that, it's a miss. The next day becomes Day 1, and the app
  asks why you missed (vacation, laziness, exam or interview prep, sick, work, other).
- Forgot to log a day you actually trained? Open that day and log it. The schedule recalculates.
- Rest day but want to train? Use **Train today instead**. Need a fresh start? Settings → **Restart at Day 1 today**.

## Nutrition

Every food in your meal plan carries calories, protein, carbs, fat, saturated fat, fiber, sugars, sodium,
cholesterol, potassium, calcium, iron, magnesium, vitamins D, C and B12, folate, choline and omega-3.
The Today page shows what you've eaten so far. The Nutrition page shows your full meal plan, today, or a
7- or 30-day average against the FDA daily values, with the biggest source of each nutrient and plain notes on
what's high or low. Edit any food's numbers in Settings → Meal plan (click More for vitamins and minerals).

## Fitness data (Apple Health / Google Fit)

Neither service has a Windows API (and Google is shutting down the Google Fit API), so the app imports files:

- **iPhone:** Health app → your profile picture → Export All Health Data. Save the zip to iCloud Drive or OneDrive,
  then Settings → Import Apple Health export. For hands-off daily syncing, use an app like Health Auto Export
  to write a CSV to iCloud Drive on a schedule, and import that CSV once.
- **Android / Google Fit:** takeout.google.com → select only Fit → import the zip.
- **Any CSV** with a Date column plus active energy, resting energy, total calories, steps or weight.

Imported files are re-read automatically whenever they change. Imported calories replace the built-in estimate on the days they cover.
