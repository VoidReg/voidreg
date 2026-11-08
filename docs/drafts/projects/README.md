# Draft projects

First batch of project write-ups for the Voidreg site. Each file is one project:
YAML front matter (the project fields) followed by a Markdown body that the admin
imports as the project document. Status: drafts for review, not published.

| Order | File | Featured |
| --- | --- | --- |
| 10 | `voidreg.md` | yes |
| 20 | `publisle.md` | yes |
| 30 | `csi-rs.md` | yes |
| 40 | `rotex.md` | no |
| 50 | `sidermux.md` | no |
| 60 | `systems-42.md` | no |

## Facts checked against GitHub, npm and crates.io (2026-11-08)

- Publisle: 240 of the commits are by VoidReg. npm `@publisle/cli`, crates `publisle-pdf`, `publisle-math`, `publisle-cli` exist. Playground URL redirects.
- csi-rs: VoidReg is the top contributor of `esp-csi-rs`, `esp-csi-cli-rs`, `csi-gui-rs`, `csi-webserver-rs`. `esp-csi-rs` is on crates.io. `esp-csi-cli-rs` is not.
- Rotex: VoidReg is the sole contributor of `rotex-core`. `rotex-types` and `rotex-core` are on crates.io.
- Sidermux: five crates are on crates.io at 0.1.0. LiteEth PR 233 merged 2026-09-28. nextpnr PR 1822 is open.

## Open questions for the owner

1. **Voice.** The "why" in each draft is grounded in what the repos show, not in your motives. Add your own reasons in your words where you want them.
2. **csi-rs attribution.** The org description says "by Connected Motion". Do you want that named on the site, or should the project stand on its own? The terminal UI lives in `42-DDN` and its main author is another contributor, so the draft says "developed with the 42-DDN group".
3. **LiteEth PR.** The draft says you completed it on top of an existing contributor's PR and kept their commit, as the PR description states. Confirm that wording.
4. **Rotex claims.** The org page lists OpenGL and WebGL as "planned" while the `rotex-gl` README describes a working GLES 3 and WebGL2 backend. The draft says "in progress". "Zero cost" is described as a goal, not a shipped property.
5. **de1-doom.** The repository only contains a LICENSE file. The draft says it has been started and has no code yet. Drop that sentence if you prefer.
6. **42 projects.** `webserv_42` has no README and `miniAB` is a team fork, so the draft keeps those two lines short. Remove them if you would rather list only your own repos (FdF, CPP-Modules, inception).
7. **Category names.** Plan categories plus one added: "Systems programming" for the 42 group.
8. **Voidreg license.** `voidreg-site` has no LICENSE file. The draft does not mention one.

## Excluded on purpose

All private repositories, plain forks with none of your changes, the 2023 data-analyst coursework, and anything under Connected Motion Research.
