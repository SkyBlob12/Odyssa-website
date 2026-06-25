#!/usr/bin/env python3
"""
Fix UTF-8 corruption introduced by the ads patching scripts.
Maps corrupted byte sequences back to their original UTF-8 characters.

Corruption mapping (all caused by the same bug in patch scripts):
  efbfbd 1a efbfbd  ->  e282ac   (€, 7 bytes -> 3 bytes)
  efbfbd 20 19      ->  e28692   (→, 5 bytes -> 3 bytes)
  efbfbd 1d         ->  e28094   (—, 4 bytes -> 3 bytes)
  efbfbd 21         ->  c387     (Ç, 4 bytes -> 2 bytes)
  efbfbd 30         ->  c389     (É, 4 bytes -> 2 bytes)
  efbfbd 1c         ->  e28093   (–, context: digit before)
                    ->  c593     (œ, context: letter before)
"""

import glob
import re
import sys
import os

def fix_content(data: bytes, filepath: str) -> bytes:
    # 1. Fix € first (7-byte pattern, must come before 4-byte patterns)
    data = data.replace(b'\xef\xbf\xbd\x1a\xef\xbf\xbd', b'\xe2\x82\xac')

    # 2. Fix → (5-byte pattern)
    data = data.replace(b'\xef\xbf\xbd\x20\x19', b'\xe2\x86\x92')

    # 3. Fix unambiguous 4-byte patterns
    data = data.replace(b'\xef\xbf\xbd\x1d', b'\xe2\x80\x94')  # —
    data = data.replace(b'\xef\xbf\xbd\x21', b'\xc3\x87')       # Ç
    data = data.replace(b'\xef\xbf\xbd\x30', b'\xc3\x89')       # É

    # 4. Fix context-dependent efbfbd1c (– en dash vs œ ligature)
    pattern = b'\xef\xbf\xbd\x1c'
    if pattern in data:
        result = bytearray()
        i = 0
        while i < len(data):
            pos = data.find(pattern, i)
            if pos == -1:
                result.extend(data[i:])
                break
            result.extend(data[i:pos])
            # Check the byte BEFORE the corruption
            prev_byte = data[pos - 1] if pos > 0 else 0
            if 0x30 <= prev_byte <= 0x39:  # digit (0-9)
                result.extend(b'\xe2\x80\x93')  # – en dash
            else:
                result.extend(b'\xc5\x93')       # œ ligature
            i = pos + 4
        data = bytes(result)

    return data


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = [
        f for f in glob.glob(os.path.join(root, '**/*.html'), recursive=True)
        if 'node_modules' not in f
    ]

    fixed = 0
    for filepath in sorted(files):
        data = open(filepath, 'rb').read()
        if b'\xef\xbf\xbd' not in data:
            continue
        before_count = data.count(b'\xef\xbf\xbd')
        fixed_data = fix_content(data, filepath)
        after_count = fixed_data.count(b'\xef\xbf\xbd')
        rel = os.path.relpath(filepath, root)
        if fixed_data != data:
            open(filepath, 'wb').write(fixed_data)
            if after_count == 0:
                print(f'  FIXED ({before_count} -> 0): {rel}')
            else:
                print(f'  PARTIAL ({before_count} -> {after_count} remaining): {rel}')
            fixed += 1
        else:
            if after_count > 0:
                print(f'  UNHANDLED ({after_count} remaining): {rel}')

    print(f'\nDone. {fixed} files fixed.')


if __name__ == '__main__':
    main()
