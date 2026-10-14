"""Pack built local Publisle packages and update file dependency pins."""
import argparse
import json
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2] / 'publisle')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.resolve()
vendor = root / 'vendor'
vendor.mkdir(exist_ok=True)
packages = ['schema', 'contracts', 'block-sdk', 'core', 'adapter-core', 'adapter-svelte', 'markdown', 'playground', 'profiles']
paths = [source / 'packages' / name for name in packages] + [source / 'blocks' / name for name in ['core', 'technical']]
for path in paths:
    if not (path / 'dist').is_dir():
        raise SystemExit(f'Build Publisle first: missing {path / "dist"}')
for path in paths:
    subprocess.run(['pnpm', '--dir', str(path), 'pack', '--pack-destination', str(vendor)], check=True, stdout=subprocess.DEVNULL)
pins = {}
for path in paths:
    metadata = json.loads((path / 'package.json').read_text())
    filename = metadata['name'].replace('@', '').replace('/', '-') + '-' + metadata['version'] + '.tgz'
    with tarfile.open(vendor / filename) as archive:
        packed = json.load(archive.extractfile('package/package.json'))
        if packed['name'] != metadata['name']:
            raise SystemExit('Packed package identity mismatch')
    pins[metadata['name']] = 'file:vendor/' + filename
manifest = root / 'package.json'
value = json.loads(manifest.read_text())
for name in value.get('dependencies', {}):
    if name in pins:
        value['dependencies'][name] = pins[name]
manifest.write_text(json.dumps(value, indent=2) + '\n')
workspace = root / 'pnpm-workspace.yaml'
base = workspace.read_text().split('\noverrides:')[0]
workspace.write_text(base + '\noverrides:\n' + ''.join(f'  "{name}": "{pin}"\n' for name, pin in pins.items()))
print('Packed Publisle and updated pins. Run pnpm install, pnpm check, and pnpm build.')
