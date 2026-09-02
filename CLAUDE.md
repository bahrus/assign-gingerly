# Instructions for Claude

## Edit TypeScript sources only — never the generated `.js`

This repo (and its nested submodules, e.g. `inferencer/`) builds `.js` and `.d.ts` from `.ts`.

- **Only edit `.ts` files.** The `.js` / `.d.ts` files are build output and will be
  regenerated — hand-edits to them get overwritten and cause `.ts`/`.js` drift.
- After changing a `.ts`, leave the corresponding `.js` alone; the maintainer runs the build.
- See `AGENTS.md` for coding conventions (destructuring, types location, `localName`, etc.).
