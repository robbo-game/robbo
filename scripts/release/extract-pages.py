"""Extract static releases without trusting archive paths or executing PR code."""
import pathlib
import stat
import sys
import zipfile

archive, destination = sys.argv[1:]
root = pathlib.Path(destination).resolve()
with zipfile.ZipFile(archive) as release:
    entries = release.infolist()
    if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 300 * 1024 * 1024:
        raise ValueError('Release exceeds Pages extraction limits')
    for entry in entries:
        name = pathlib.PurePosixPath(entry.filename)
        if name.is_absolute() or '..' in name.parts or '\\' in entry.filename or '.git' in name.parts or not name.parts or name.parts[0] != 'robbo':
            raise ValueError('Unsafe release path')
        if stat.S_ISLNK(entry.external_attr >> 16):
            raise ValueError('Release symlinks are forbidden')
        output = root.joinpath(*name.parts)
        if entry.is_dir():
            output.mkdir(parents=True, exist_ok=True)
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(release.read(entry))
if not (root / 'robbo' / 'index.html').is_file():
    raise ValueError('Release has no index.html')
