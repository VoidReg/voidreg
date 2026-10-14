"""Refresh admin preview components from the canonical reader host."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
source = root.parent / 'voidreg-web' / 'src/lib/publishing'
for name in ['ArticleBody.svelte', 'Counter.svelte', 'api.ts', 'renderers.ts']:
    shutil.copyfile(source / name, root / 'src/lib/publishing' / name)
print('Refreshed reader components. Run pnpm check and pnpm build.')
