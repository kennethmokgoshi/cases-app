
import os

base = "C:/Visual Studio Code/19 Feb 2026/FromGIt/cases-app-main/apps/cases"

replacements = [
    ("from '@/lib/prisma'",        "from '@zenowethu/database'"),
    ('from "@/lib/prisma"',        'from "@zenowethu/database"'),
    ("from './prisma'",             "from '@zenowethu/database'"),
    ('from "./prisma"',             'from "@zenowethu/database"'),
    ("from '@/lib/auth'",          "from '@zenowethu/auth'"),
    ('from "@/lib/auth"',          'from "@zenowethu/auth"'),
    ("from '@/lib/api-auth'",      "from '@zenowethu/auth'"),
    ('from "@/lib/api-auth"',      'from "@zenowethu/auth"'),
    ("from '@/lib/statuses'",      "from '@zenowethu/statuses'"),
    ('from "@/lib/statuses"',      'from "@zenowethu/statuses"'),
    ("from '@/lib/workflow'",      "from '@zenowethu/statuses'"),
    ('from "@/lib/workflow"',      'from "@zenowethu/statuses"'),
    ("from '@/lib/workingDays'",   "from '@zenowethu/statuses'"),
    ('from "@/lib/workingDays"',   'from "@zenowethu/statuses"'),
    ("from '@/lib/ghl-config'",    "from '@zenowethu/integrations'"),
    ('from "@/lib/ghl-config"',    'from "@zenowethu/integrations"'),
    ("from './ghl-config'",         "from '@zenowethu/integrations'"),
    ('from "./ghl-config"',         'from "@zenowethu/integrations"'),
    ("from '@/lib/ghl-service'",   "from '@zenowethu/integrations'"),
    ('from "@/lib/ghl-service"',   'from "@zenowethu/integrations"'),
    ("from '@/lib/dhs-config'",    "from '@zenowethu/integrations'"),
    ('from "@/lib/dhs-config"',    'from "@zenowethu/integrations"'),
    ("from './dhs-config'",         "from '@zenowethu/integrations'"),
    ('from "./dhs-config"',         'from "@zenowethu/integrations"'),
    ("from '@/lib/layout-context'", "from '@zenowethu/ui'"),
    ('from "@/lib/layout-context"', 'from "@zenowethu/ui"'),
    ("from '@/lib/project-context'", "from '@zenowethu/ui'"),
    ('from "@/lib/project-context"', 'from "@zenowethu/ui"'),
    ("from '@/lib/theme-context'", "from '@zenowethu/ui'"),
    ('from "@/lib/theme-context"', 'from "@zenowethu/ui"'),
]

ts_files = []
for root, dirs, files in os.walk(base):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".next")]
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            ts_files.append(os.path.join(root, f))

changed_files = []
total_replacements = 0

for filepath in sorted(ts_files):
    with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
        original = fh.read()
    content = original
    file_replacements = 0
    for find_str, replace_str in replacements:
        count = content.count(find_str)
        if count > 0:
            content = content.replace(find_str, replace_str)
            file_replacements += count
    if content != original:
        with open(filepath, "w", encoding="utf-8") as fh:
            fh.write(content)
        rel = filepath.replace(base, "")
        changed_files.append((rel, file_replacements))
        total_replacements += file_replacements

print("Files changed: " + str(len(changed_files)))
print("Total replacement instances: " + str(total_replacements))
print()
print("Changed files:")
for rel, count in changed_files:
    print("  " + rel + "  (" + str(count) + " replacement(s))")
