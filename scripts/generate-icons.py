"""Optional developer artwork helper. Requires Pillow; no downloaded artwork."""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent
raw = subprocess.check_output(['node', '--import', 'tsx', '-e',
    "const {paperAt,normal}=require('./assets/scripts/core/PaperModel.ts'); console.log(JSON.stringify(paperAt(4).map(f=>({...f,front:normal(f).z>0}))));"], cwd=root)
faces = sorted(json.loads(raw), key=lambda f: f['layer'])
image = Image.new('RGB', (1024, 1024), '#DDE9DD')
draw = ImageDraw.Draw(image)
def xy(x,y): return (512+x*390, 512-(y+.36)*390)
for f in faces:
    points = [xy(p['x'],p['y']) for p in f['vertices']]
    draw.polygon(points, fill='#DD9E81' if f['front'] else '#F3DDC0')
    draw.line(points+[points[0]],fill='#B78069',width=3)
for x in [-.22,.22]:
    cx,cy=xy(x,-.29);draw.ellipse((cx-10,cy-10,cx+10,cy+10),fill='#314440')
draw.polygon([xy(-.045,-.45),xy(0,-.51),xy(.045,-.45)],fill='#314440')
folder=root/'native/engine/ios/Images.xcassets/AppIcon.appiconset'
for entry in json.loads((folder/'Contents.json').read_text())['images']:
    size=int(float(entry['size'].split('x')[0])*float(entry['scale'].replace('x','')))
    image.resize((size,size),Image.Resampling.LANCZOS).save(folder/entry['filename'])
