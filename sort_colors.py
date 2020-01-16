import numpy as np
import colour
import json
x = json.load(open('data.json'))

# https://stackoverflow.com/questions/38876429/how-to-convert-from-rgb-values-to-color-temperature/38889696
def rgb_to_k(r, g, b):
  RGB = np.array([r, g, b])
  # Conversion to tristimulus values.
  XYZ = colour.sRGB_to_XYZ(RGB / 255)
  # Conversion to chromaticity coordinates.
  xy = colour.XYZ_to_xy(XYZ)
  # Conversion to correlated colour temperature in K.
  CCT = colour.xy_to_CCT(xy, 'hernandez1999')

  #print(f"{r}{g}{b}")

  return CCT

def rgb_to_l(r, g, b):
  RGB = np.array([r, g, b])
  HSL = colour.RGB_to_HSL(RGB)
  return HSL

from hilbertcurve.hilbertcurve import HilbertCurve
p=9
N=3
hilbert_curve = HilbertCurve(p, N)

def rgb_to_h(r, g, b):
  coords = [r, g, b]
  dist   = hilbert_curve.distance_from_coordinates(coords)
  return dist

for c in x:
    c['k'] = rgb_to_k(c['rgb']['r'], c['rgb']['g'], c['rgb']['b'])
    c['l'] = rgb_to_l(c['rgb']['r'], c['rgb']['g'], c['rgb']['b'])
    c['h'] = rgb_to_h(c['rgb']['r'], c['rgb']['g'], c['rgb']['b'])

#x.sort(key=lambda x: (x['l'][2], x['h']))
#x.sort(key=lambda x: (x['l'][2], x['h']))

#x.sort(key=lambda x: x['k'] if x['k'] > 0 else 2000+x['k'])
#x.sort(key=lambda x: (x['rgb']['r'] - x['rgb']['b']))
x.sort(key=lambda x: (x['l'][0], x['l'][1], x['l'][2]))
# mid  = int(len(x)/2)
# blue = x[:mid]
# red  = x[mid:]

# filter(lambda x: x['rgb']['b'] > x['rgb']['r'], blue)
# filter(lambda x: x['rgb']['r'] > x['rgb']['b'], red)
# x    = blue + red
# Sort in ascending by red
# Divide into two lists
# First half, keep only blue > red
# Second half, keep only red > blue

#x.sort(key=lambda x: -1*x['rgb']['b'])
temps = list(range(-15,95,5))

count = 0
lightness_min = 126
lightness_max = 128
def accept_color(c):
    if c['colorId'] > 8 and c['colorId'] < 17:
        return False
    if c['rgb']['r'] == c['rgb']['g'] and c['rgb']['r'] == c['rgb']['b']:
        return False
    if c['rgb']['r'] + c['rgb']['g'] +  c['rgb']['b'] == 510:
        return False
    if c['l'][2] > lightness_min and c['l'][2] < lightness_max:
        return True
with open('sourceme.zsh', 'w') as wf:
    wf.write('#!/usr/local/bin/zsh\n')
    use_colors = []
    wf.write("print -Pn ")
    for c in x:
      color    = c['colorId']
      sort_key = c['rgb']['r'] - c['rgb']['b']
      rgb = c['rgb']
      if accept_color(c):
        #cmd   = """print -Pn "%{}F{}\n"\n""".format(color,color)
        cmd   = """ "%{}F{} {} {}\n" """.format(color,c['rgb']['r'],c['rgb']['g'],c['rgb']['b'])
        use_colors.append(color)
        wf.write(cmd)
        count += 1

    temps = list(np.linspace(-20,100,count))
    
    temps.reverse()
    temps = [int(t) for t in temps]
    
    count = 0
    for c in x:
      color = c['colorId']
      if accept_color(c):
        cmd   = """print -Pn "%{}F{} {}\n"\n""".format(color, temps[count], c['l'][2])
        wf.write(cmd)
        count += 1
    print(json.dumps(dict(zip(temps, use_colors))))
