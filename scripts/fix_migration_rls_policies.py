#!/usr/bin/env python3
"""Prepend DROP POLICY IF EXISTS before each CREATE POLICY in supabase/migrations when missing."""
import glob
import re
import sys

# Multiline: create policy "x"\n  on public.t for
# Single line: create policy "x" on public.t for select using (...);
POLICY_START = re.compile(
    r'(?i)\ncreate policy "([^"]+)"\s+on ([a-zA-Z0-9_.]+) for',
)


def fix_content(s: str) -> str:
    pos = 0
    out: list[str] = []
    while True:
        m = POLICY_START.search(s, pos)
        if not m:
            out.append(s[pos:])
            break
        abs_start = m.start()
        name, table = m.group(1), m.group(2)
        before = s[pos:abs_start]
        window = s[max(0, abs_start - 600) : abs_start]
        check = f'drop policy if exists "{name}" on {table}'
        if check.lower() not in window.lower():
            out.append(before + f'\ndrop policy if exists "{name}" on {table};')
        else:
            out.append(before)
        # Include full CREATE POLICY ... ; (first semicolon after policy start)
        semi = s.find(";", abs_start)
        if semi == -1:
            out.append(s[abs_start:])
            break
        out.append(s[abs_start : semi + 1])
        pos = semi + 1
    return "".join(out)


def main() -> None:
    changed = []
    for path in sorted(glob.glob("supabase/migrations/*.sql")):
        with open(path, encoding="utf-8") as f:
            orig = f.read()
        if "create policy" not in orig.lower():
            continue
        new = fix_content(orig)
        if new != orig:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            changed.append(path)
    print(f"Updated {len(changed)} files")
    for p in changed:
        print(" ", p)


if __name__ == "__main__":
    main()
