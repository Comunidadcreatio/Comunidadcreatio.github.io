banderas = {
    '01': 'cardenas.webp',
    '02': 'junin.webp',
    '03': 'san-cristobal.webp',
    '04': 'jose-maria-vargas.webp',
    '05': 'uribante.webp',
    '06': 'francisco-de-miranda.webp',
    '07': 'andres-bello.webp',
    '08': 'fernandez-feo.webp',
    '09': 'rafael-urdaneta.webp',
    '10': 'sucre.webp',
    '11': 'cordoba.webp',
    '12': 'seboruco.webp',
    '13': 'pedro-maria-urena.webp',
    '14': 'libertador.webp',
    '15': 'lobatera.webp',
    '16': 'garcia-de-hevia.webp',
    '17': 'ayacucho.webp',
    '18': 'jauregui.webp',
    '19': 'bolivar.webp',
    '20': 'independencia.webp',
    '21': 'antonio-romulo-costa.webp',
    '22': 'guasimos.webp',
    '23': 'libertad.webp',
    '24': 'michelena.webp',
    '25': 'panamericano.webp',
    '26': 'samuel-dario-maldonado.webp',
    '27': 'san-judas-tadeo.webp',
    '28': 'simon-rodriguez.webp',
    '29': 'torbes.webp',
}

with open('auth.html', 'r', encoding='utf-8') as f:
    content = f.read()

for num, bandera in banderas.items():
    old = "iconos/fondos/{}.webp')".format(num)
    new = "iconos/fondos/{}.webp') data-bandera=\"{}\"".format(num, bandera)
    if old in content:
        content = content.replace(old, new, 1)
    else:
        print("NOT FOUND:", num)

with open('auth.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
