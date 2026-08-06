import re

with open('auth.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: move data-bandera from inside style to its own attribute
# Broken: style="background-image: url('iconos/fondos/01.webp') data-bandera="cardenas.webp";"
# Fixed:  style="background-image: url('iconos/fondos/01.webp');" data-bandera="cardenas.webp"

pattern = re.compile(
    r"style=\"background-image: url\('([^']+)'\) data-bandera=\"([^\"]+)\";\""
)

def fix_match(m):
    url = m.group(1)
    bandera = m.group(2)
    return f'style="background-image: url(\'{url}\');" data-bandera="{bandera}"'

fixed, count = pattern.subn(fix_match, content)
print(f'Fixed {count} slides')

with open('auth.html', 'w', encoding='utf-8') as f:
    f.write(fixed)
