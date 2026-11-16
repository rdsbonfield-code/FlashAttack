# Flash Attack

A chunky, colourful top-down 4v4 tactical shooter for Android and iOS.
Raiders plant the charge at site A or B; Guards stop them or defuse it. First team to 5 rounds wins, sides swap after round 4.

- Round economy with a buy phase: SMG, shotgun, rifle, sniper, vest, flashbangs, frags, defuse kit
- Line-of-sight fog of war — you only see enemies you actually have eyes on
- Flashbangs that white out your screen (look away to soften them) and blind bots too
- Bots that path-find, push sites, plant, rotate, defuse, strafe and throw grenades
- Twin-stick touch controls with aim assist; keyboard + mouse for desktop
- Everything is drawn in code and all sound is synthesized — no art or audio assets

## Controls

| | Touch | Keyboard / mouse |
|---|---|---|
| Move | left thumb | WASD |
| Aim / fire | right thumb — drag past the ring to fire, quick-tap for a snap shot | mouse, left button |
| Reload / swap / flash / frag | buttons | R / Q / F / G |
| Plant / defuse | hold the button that appears | hold E |
| Buy menu (buy phase) | BUY | B |

## Run it in a browser

```
npm install
npm start        # http://localhost:5173
```

The game is plain ES modules in `www/` — there is no build step.

## Build the apps

The native projects are generated with [Capacitor](https://capacitorjs.com) and wrap `www/`.
Both are locked to landscape and run fullscreen.

**Android** (needs Android Studio):

```
npm run android  # copies www/ into the project and opens Android Studio — press Run
```

**iOS** (needs a Mac with Xcode and CocoaPods):

```
npm run ios      # copies www/ into the project and opens Xcode — pick a device, press Run
```

After changing anything in `www/`, run `npm run sync` to copy it into both native projects.
The app id is `com.flashattack.game` (`capacitor.config.json`) — change it before publishing.
App icon source is `www/icon.svg` / `www/icon-1024.png`; the native projects still use Capacitor's placeholder launcher icons.

## Layout

```
www/js/config.js   map, weapons, items, rules
www/js/game.js     simulation: movement, bullets, grenades, charge, rounds, economy
www/js/ai.js       bot navigation and combat
www/js/render.js   canvas renderer, fog of war, HUD
www/js/input.js    touch sticks, keyboard, mouse
www/js/audio.js    synthesized sound effects
www/js/main.js     app shell, menus, buy screen
```

The bundled font is Titan One (SIL Open Font License, see `www/fonts/`).
