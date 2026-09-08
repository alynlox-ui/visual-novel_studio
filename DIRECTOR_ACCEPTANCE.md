# Director acceptance

The six-feature contract is defined in WEBGAL_FEATURE_CONTRACT.md. A legacy regression pass or a deployed source match does not establish feature behavior.

## Reopened gaps in revision 107cbeb

- Editor: missing template import/export, portrait uploads and entry-preview action; cue zero-value display and duplicate add controls; incomplete undo transaction; invalid JSON feedback absent.
- Native: scene entry, image resolution, call/return, choice eligibility and basic director snapshots are already connected in the committed source. An initial search returned incomplete matches; direct `git show` inspection corrected that finding. Remaining gaps are dedicated behavior acceptance, persisted navigation history/backlog and chapter director snapshots.
- Browser: requires feature-specific acceptance of rendered cues, instant reveal, pause/rate, inheritance, flow and restoration. Prior generic playthrough is not sufficient.

## Verification commands

Browser acceptance requires Node.js 20+, `npm install`, and Microsoft Edge (or `EDGE_PATH` pointing to a Chromium executable). Native acceptance requires Windows x64/.NET Framework. These are development-test requirements; the deployed Node server does not launch browsers.

- `node director_editor_test.js`: actual editor control interactions.
- `node director_browser_test.js`: preview and generated standalone behavior.
- `node director_native_test.js`: actual compiled EXE director self-test, fresh report required.
- `npm test`: legacy regression plus all director acceptance scripts.
- `node director_release_verify.js [origin]`: normalized committed HTML/module hashes, health and exported native template/overlay verification.

Run the native build after the last C# change and before native tests. Final combined acceptance passed: editor browser 23 checks, preview/export browser 48 checks, native director 38 checks; npm test exited 0 after rebuilding the final native source. Legacy condition 43, export structure 18, experience 27, native HTTP/EXE integration 25 and collaboration HTTP 10 also passed. Hosted content equality proves delivery of the tested revision, not runtime behavior by itself.
