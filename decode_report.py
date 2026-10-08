#!/usr/bin/env python3
"""Decode shop report from URL query parameter to JSON file."""

import base64, zlib, json, sys
from urllib.parse import unquote, urlparse, parse_qs

def decode(url_or_param):
    # Handle full URL or just the query param value
    if url_or_param.startswith('http'):
        qs = parse_qs(urlparse(url_or_param).query)
        d = qs.get('d', [None])[0]
        if not d:
            sys.exit("Error: no 'd' query parameter found in URL")
    else:
        d = unquote(url_or_param)

    # Strip prefix and decode
    if d.startswith('deflate:'):
        compressed = base64.b64decode(d[8:])
        json_str = zlib.decompress(compressed).decode('utf-8')
    elif d.startswith('raw:'):
        json_str = base64.b64decode(d[4:]).decode('utf-8')
    else:
        sys.exit("Error: unknown prefix (expected 'deflate:' or 'raw:')")

    return json.loads(json_str)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python decode_report.py <url_or_param_or_file> [output.json]")
        print("  Accepts: full URL, raw 'd' param value, or path to a file containing it")
        print("  Use '-' to read from stdin")
        print("  output.json: optional output file (default: prints to stdout)")
        sys.exit(1)

    arg = sys.argv[1]
    # Read from stdin
    if arg == '-':
        arg = sys.stdin.read().strip()
    # Read from file if it exists on disk
    elif not arg.startswith('http') and not arg.startswith('deflate:') and not arg.startswith('raw:'):
        import os
        if os.path.isfile(arg):
            with open(arg, 'r', encoding='utf-8') as f:
                arg = f.read().strip()

    data = decode(arg)
    output = json.dumps(data, indent=2, ensure_ascii=False)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"Exported to {sys.argv[2]}")
    else:
        print(output)
