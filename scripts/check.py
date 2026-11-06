#!/usr/bin/env python3
"""Repo consistency checks for spec-driven-dev. Stdlib only.

  python3 scripts/check.py         # fail on any drift
  python3 scripts/check.py --fix   # also rewrite README's "By the numbers" table
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGES = {  # README table order and stage labels
    "spec-setup": "0 · configure", "spec-investigate": "1 · understand", "spec-create": "2 · plan", "spec-implement": "3 · build",
    "spec-verify": "4 · prove", "spec-checkpoint": "5 · commit", "spec-ship": "6 · PR",
    "generative-seo": "standalone",
}
errors = []
read = lambda p: open(os.path.join(ROOT, p), encoding="utf8").read()

skills = sorted(d for d in os.listdir(os.path.join(ROOT, "skills"))
                if os.path.isfile(os.path.join(ROOT, "skills", d, "SKILL.md")))
if set(skills) != set(STAGES):
    errors.append(f"skills/ {skills} != STAGES in scripts/check.py {sorted(STAGES)}")

for name in skills:
    text = read(f"skills/{name}/SKILL.md")
    fm = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not fm:
        errors.append(f"{name}: missing frontmatter"); continue
    fm = fm.group(1)
    if not re.search(rf"^name:\s*{re.escape(name)}\s*$", fm, re.M):
        errors.append(f"{name}: frontmatter name must equal folder name")
    if not re.search(r"^description:\s*\S", fm, re.M):
        errors.append(f"{name}: missing description")
    if not re.search(r"^license:", fm, re.M):
        errors.append(f"{name}: missing license")
    for ref in set(re.findall(r"`(references/[\w./-]+)`", text)):
        if not os.path.exists(os.path.join(ROOT, "skills", name, ref)):
            errors.append(f"{name}: references missing file {ref}")
    link = os.path.join(ROOT, ".agents", "skills", name)
    if not (os.path.islink(link) and os.path.realpath(link) == os.path.join(os.path.realpath(ROOT), "skills", name)):
        errors.append(f"{name}: .agents/skills/{name} symlink missing or wrong")

pkg = json.loads(read("package.json"))
if pkg["version"] != json.loads(read(".claude-plugin/plugin.json"))["version"]:
    errors.append("package.json and .claude-plugin/plugin.json versions differ")

for p in (".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"):
    try:
        data = json.loads(read(p))
    except ValueError as e:
        errors.append(f"{p}: invalid JSON ({e})"); continue
    blob = json.dumps(data)
    for name in skills:
        if name != "generative-seo" and name not in blob:
            errors.append(f"{p}: description doesn't mention {name}")

readme = read("README.md")
for name in skills:
    if f"`{name}`" not in readme:
        errors.append(f"README.md doesn't mention `{name}`")

# README metrics table — regenerated from the files, so it can't drift silently.
rows, tl, tw, tf = [], 0, 0, 0
for name in STAGES:
    if name not in skills:
        continue
    text = read(f"skills/{name}/SKILL.md")
    lines, words = text.count("\n"), len(text.split())
    files = sum(f not in ("SKILL.md", ".DS_Store") for _, _, fs in os.walk(os.path.join(ROOT, "skills", name)) for f in fs)
    tl, tw, tf = tl + lines, tw + words, tf + files
    rows.append(f"| `{name}` | {STAGES[name]} | {lines:,} | {words:,} | {files} |")
table = ("| Skill | Stage | SKILL.md lines | Words | Supporting files |\n|---|---|---:|---:|---:|\n"
         + "\n".join(rows) + f"\n| **Total** | | **{tl:,}** | **{tw:,}** | **{tf}** |\n")
pat = re.compile(r"\| Skill \| Stage \|.*?\| \*\*Total\*\*[^\n]*\n", re.S)
if not pat.search(readme):
    errors.append("README.md: 'By the numbers' table not found")
elif pat.search(readme).group(0) != table:
    if "--fix" in sys.argv:
        open(os.path.join(ROOT, "README.md"), "w", encoding="utf8").write(pat.sub(lambda _: table, readme))
        print("README.md metrics table updated")
    else:
        errors.append("README.md metrics table is stale — run: python3 scripts/check.py --fix")

if errors:
    print("\n".join(f"✗ {e}" for e in errors)); sys.exit(1)
print(f"✓ {len(skills)} skills consistent")
