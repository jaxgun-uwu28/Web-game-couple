export type Point = { x: number; y: number; p: number };
export type Stroke = {
  points: Point[];
  color: string;
  size: number;
  pen: string;
};
export type Sticker = {
  id: string;
  kind: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flip: boolean;
};
export type CardText = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  font: string;
  style: string;
  curve: boolean;
};
export type PostcardDoc = {
  version: 1;
  portrait: boolean;
  paper: string;
  pattern?: string;
  filter: string;
  frame: string;
  photoPath?: string;
  photoTransform: { x: number; y: number; zoom: number };
  strokes: Stroke[];
  stickers: Sticker[];
  texts: CardText[];
  stamp: string;
  frontStamp: boolean;
  message: string;
  place: string;
  date: string;
  backStrokes: Stroke[];
};
export const blankPostcard = (): PostcardDoc => ({
  version: 1,
  portrait: false,
  paper: "#FFF8F3",
  filter: "Original",
  frame: "Printed",
  photoTransform: { x: 0, y: 0, zoom: 1 },
  strokes: [],
  stickers: [],
  texts: [],
  stamp: "heart",
  frontStamp: false,
  message: "",
  place: "",
  date: new Date().toLocaleDateString(),
  backStrokes: [],
});
export const cardFilters: Record<string, string> = {
  Original: "none",
  "Warm Film": "sepia(.22) saturate(1.15)",
  Rosy: "sepia(.15) hue-rotate(325deg) saturate(1.3)",
  "Dreamy Blur": "blur(2px) saturate(.9)",
  "Vintage Fade": "sepia(.4) contrast(.8)",
  "Black and White": "grayscale(1)",
};
function heart(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
  g.beginPath();
  g.moveTo(x, y + size * 0.4);
  g.bezierCurveTo(
    x - size,
    y - size * 0.3,
    x - size * 0.4,
    y - size,
    x,
    y - size * 0.45,
  );
  g.bezierCurveTo(
    x + size * 0.4,
    y - size,
    x + size,
    y - size * 0.3,
    x,
    y + size * 0.4,
  );
  g.fill();
}
function stamp(
  g: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  assets: Record<string, CanvasImageSource> = {},
) {
  g.fillStyle = "#FFF8F3";
  g.fillRect(x - 4, y - 4, 96, 108);
  g.strokeStyle = "#50313f";
  g.setLineDash([3, 4]);
  g.strokeRect(x - 4, y - 4, 96, 108);
  g.setLineDash([]);
  g.fillStyle = kind === "cloud" ? "#EAE1F5" : "#F8C9D8";
  g.fillRect(x, y, 88, 100);
  g.fillStyle = "#9D304F";
  const custom =
    assets[kind] ||
    assets[
      `postcard-stamp-${["heart", "flower", "star", "cloud"].indexOf(kind) + 1}`
    ];
  if (custom) g.drawImage(custom, x + 8, y + 8, 72, 72);
  else if (kind === "heart") heart(g, x + 44, y + 52, 30);
  else {
    g.save();
    g.translate(x + 44, y + 48);
    motif(g, kind, 28);
    g.restore();
  }
  g.font = "14px Nunito Sans";
  g.fillStyle = "#50313f";
  g.textAlign = "center";
  g.fillText("WITH LOVE", x + 44, y + 92);
}
function motif(g: CanvasRenderingContext2D, kind: string, size = 35) {
  if (!Number.isFinite(size) || size <= 0) return;
  g.save();
  g.strokeStyle = "#50313F";
  g.lineWidth = 2;

  if (kind === "sparkles" || kind === "star") {
    g.fillStyle = "#FBBF24";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? size : size * 0.35;
      const px = Math.cos(a) * r,
        py = Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#FDE68A";
    g.beginPath();
    g.arc(-size * 0.6, -size * 0.55, size * 0.18, 0, Math.PI * 2);
    g.arc(size * 0.65, size * 0.45, size * 0.14, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (kind === "rose") {
    g.fillStyle = "#4ADE80";
    g.beginPath();
    g.ellipse(size * 0.65, size * 0.35, size * 0.35, size * 0.18, 0.6, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    g.fillStyle = "#E11D48";
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      g.beginPath();
      g.arc(
        Math.cos(a) * size * 0.45,
        Math.sin(a) * size * 0.45,
        size * 0.42,
        0,
        Math.PI * 2,
      );
      g.fill();
      g.stroke();
    }
    g.fillStyle = "#FB7185";
    g.beginPath();
    g.arc(0, 0, size * 0.36, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#FFF1F2";
    g.beginPath();
    g.arc(-size * 0.08, -size * 0.08, size * 0.18, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "kiss") {
    g.fillStyle = "#F43F5E";
    g.beginPath();
    g.moveTo(-size, 0);
    g.quadraticCurveTo(-size * 0.5, -size * 0.65, -size * 0.15, -size * 0.4);
    g.lineTo(0, -size * 0.25);
    g.lineTo(size * 0.15, -size * 0.4);
    g.quadraticCurveTo(size * 0.5, -size * 0.65, size, 0);
    g.quadraticCurveTo(0, size * 0.1, -size, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.85, 0);
    g.quadraticCurveTo(0, size * 0.85, size * 0.85, 0);
    g.quadraticCurveTo(0, size * 0.1, -size * 0.85, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(255, 255, 255, 0.45)";
    g.beginPath();
    g.ellipse(0, size * 0.35, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "letter") {
    g.fillStyle = "#FFFBEB";
    g.beginPath();
    g.roundRect(-size, -size * 0.65, size * 2, size * 1.3, 6);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-size, -size * 0.65);
    g.lineTo(0, size * 0.1);
    g.lineTo(size, -size * 0.65);
    g.stroke();
    g.fillStyle = "#E11D48";
    heart(g, 0, 0, size * 0.32);
  } else if (kind === "ribbon") {
    g.fillStyle = "#F472B6";
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-size * 0.5, -size * 0.7, -size, -size * 0.5, -size * 0.9, 0);
    g.bezierCurveTo(-size, size * 0.5, -size * 0.5, size * 0.7, 0, 0);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(size * 0.5, -size * 0.7, size, -size * 0.5, size * 0.9, 0);
    g.bezierCurveTo(size, size * 0.5, size * 0.5, size * 0.7, 0, 0);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.2, size * 0.1);
    g.lineTo(-size * 0.6, size * 0.9);
    g.lineTo(-size * 0.35, size * 0.75);
    g.lineTo(-size * 0.05, size * 0.85);
    g.lineTo(0, size * 0.15);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(size * 0.2, size * 0.1);
    g.lineTo(size * 0.6, size * 0.9);
    g.lineTo(size * 0.35, size * 0.75);
    g.lineTo(size * 0.05, size * 0.85);
    g.lineTo(0, size * 0.15);
    g.fill();
    g.stroke();
    g.fillStyle = "#DB2777";
    g.beginPath();
    g.arc(0, 0, size * 0.25, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (kind === "lock") {
    g.fillStyle = "#F59E0B";
    g.strokeStyle = "#78350F";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, -size * 0.3, size * 0.4, Math.PI, 0);
    g.stroke();
    g.lineWidth = 2;
    g.fillStyle = "#F43F5E";
    heart(g, 0, size * 0.2, size * 0.7);
    g.fillStyle = "#3F2C35";
    g.beginPath();
    g.arc(0, size * 0.15, size * 0.12, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-size * 0.07, size * 0.18);
    g.lineTo(size * 0.07, size * 0.18);
    g.lineTo(size * 0.05, size * 0.38);
    g.lineTo(-size * 0.05, size * 0.38);
    g.closePath();
    g.fill();
  } else if (kind === "gift") {
    g.fillStyle = "#F472B6";
    g.beginPath();
    g.roundRect(-size * 0.75, -size * 0.4, size * 1.5, size * 1.25, 6);
    g.fill();
    g.stroke();
    g.fillStyle = "#FBBF24";
    g.fillRect(-size * 0.15, -size * 0.4, size * 0.3, size * 1.25);
    g.strokeRect(-size * 0.15, -size * 0.4, size * 0.3, size * 1.25);
    g.fillRect(-size * 0.75, size * 0.1, size * 1.5, size * 0.3);
    g.strokeRect(-size * 0.75, size * 0.1, size * 1.5, size * 0.3);
    g.beginPath();
    g.arc(-size * 0.25, -size * 0.55, size * 0.2, 0, Math.PI * 2);
    g.arc(size * 0.25, -size * 0.55, size * 0.2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (kind === "bubble") {
    g.fillStyle = "#FFF1F2";
    g.beginPath();
    g.roundRect(-size, -size * 0.65, size * 2, size * 1.2, 14);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.3, size * 0.52);
    g.lineTo(-size * 0.6, size * 0.95);
    g.lineTo(-size * 0.05, size * 0.52);
    g.fill();
    g.stroke();
    g.fillStyle = "#F43F5E";
    heart(g, 0, -size * 0.05, size * 0.35);
  } else if (kind === "bear") {
    g.fillStyle = "#D97706";
    g.beginPath();
    g.arc(-size * 0.65, -size * 0.55, size * 0.35, 0, Math.PI * 2);
    g.arc(size * 0.65, -size * 0.55, size * 0.35, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#FBCFE8";
    g.beginPath();
    g.arc(-size * 0.65, -size * 0.55, size * 0.18, 0, Math.PI * 2);
    g.arc(size * 0.65, -size * 0.55, size * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#D97706";
    g.beginPath();
    g.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#FDA4AF";
    g.beginPath();
    g.arc(-size * 0.45, size * 0.15, size * 0.15, 0, Math.PI * 2);
    g.arc(size * 0.45, size * 0.15, size * 0.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FEF3C7";
    g.beginPath();
    g.ellipse(0, size * 0.18, size * 0.35, size * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3F2C35";
    g.beginPath();
    g.arc(0, size * 0.1, size * 0.1, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(-size * 0.32, -size * 0.1, size * 0.09, 0, Math.PI * 2);
    g.arc(size * 0.32, -size * 0.1, size * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.arc(-size * 0.34, -size * 0.13, size * 0.035, 0, Math.PI * 2);
    g.arc(size * 0.3, -size * 0.13, size * 0.035, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "cloud") {
    g.roundRect(-size, -size * 0.25, size * 2, size * 0.8, size * 0.35);
    g.fill();
    for (const [x, y, r] of [
      [-size * 0.45, -size * 0.22, size * 0.4],
      [size * 0.12, -size * 0.4, size * 0.5],
      [size * 0.6, -size * 0.15, size * 0.35],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "flower") {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.beginPath();
      g.ellipse(
        Math.cos(a) * size * 0.6,
        Math.sin(a) * size * 0.6,
        size * 0.5,
        size * 0.3,
        a,
        0,
        Math.PI * 2,
      );
      g.fill();
      g.stroke();
    }
    g.fillStyle = "#F7E6A6";
    g.beginPath();
    g.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    g.fill();
  } else {
    g.roundRect(-size, -size * 0.3, size * 2, size * 0.6, 4);
    g.fill();
    g.stroke();
  }
  g.restore();
}
function strokes(base: CanvasRenderingContext2D, items: Stroke[]) {
  if (!items.length) return;
  const layer = document.createElement("canvas");
  layer.width = base.canvas.width;
  layer.height = base.canvas.height;
  const g = layer.getContext("2d")!;
  g.setTransform(base.getTransform());
  for (const s of items) {
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = s.color;
    g.fillStyle = s.color;
    g.lineWidth = s.size;
    if (s.pen === "eraser") {
      g.globalCompositeOperation = "destination-out";
    }
    if (s.pen === "marker") g.globalAlpha = 0.55;
    if (s.pen === "crayon") {
      g.globalAlpha = 0.7;
      g.setLineDash([s.size * 0.4, s.size * 0.12]);
    }
    if (s.pen === "neon") {
      g.shadowBlur = 12;
      g.shadowColor = s.color;
    }
    const p = s.points;
    if (p.length) {
      if(p.length===1){g.beginPath();g.arc(p[0].x,p[0].y,s.size*Math.max(.3,p[0].p)/2,0,Math.PI*2);g.fill();g.restore();continue;}
      g.beginPath();
      g.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) {
        g.lineWidth = s.size * Math.max(0.3, p[i].p);
        if (s.pen === "hearts") {
          if (i % 4 === 0) heart(g, p[i].x, p[i].y, s.size);
        } else {
          const a = p[i - 1],
            b = p[i];
          g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
      }
      if (s.pen !== "hearts") g.stroke();
      if (s.pen === "glitter")
        for (let i = 0; i < p.length; i += 3) {
          g.fillStyle = "#F7E6A6";
          g.beginPath();
          g.arc(
            p[i].x + Math.sin(i) * s.size,
            p[i].y + Math.cos(i) * s.size,
            2,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
    }
    g.restore();
  }
  base.save();
  base.resetTransform();
  base.drawImage(layer, 0, 0);
  base.restore();
}
export function drawPostcard(
  canvas: HTMLCanvasElement,
  d: PostcardDoc,
  photo: CanvasImageSource | null,
  back = false,
  assets: Record<string, CanvasImageSource> = {},
) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const w = d.portrait ? 600 : 900,
    h = d.portrait ? 900 : 600;
  canvas.width = d.portrait ? 1066 : 1600;
  canvas.height = d.portrait ? 1600 : 1066;
  g.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  g.fillStyle = d.paper;
  g.fillRect(0, 0, w, h);
  g.save();
  g.fillStyle = "#FFF8F3";
  g.fillRect(16, 16, w - 32, h - 32);
  if (assets["postcard-paper-texture"])
    g.drawImage(assets["postcard-paper-texture"], 16, 16, w - 32, h - 32);
  if(d.pattern && d.pattern!=='Plain'){
    g.save();g.fillStyle=d.paper;g.fillRect(24,24,w-48,h-48);g.globalAlpha=.3;g.fillStyle='#9D304F';
    for(let y=35;y<h-25;y+=36)for(let x=35;x<w-25;x+=36){
      if(d.pattern==='Hearts')heart(g,x,y,5);
      else if(d.pattern==='Gingham'){if((Math.floor(x/36)+Math.floor(y/36))%2===0)g.fillRect(x-11,y-11,22,22);}
      else {g.beginPath();g.arc(x,y,2,0,Math.PI*2);g.fill();}
    }g.restore();
  }
  if (back) {
    g.strokeStyle = "#F8C9D8";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.58, 40);
    g.lineTo(w * 0.58, h - 50);
    g.stroke();
    stamp(g, d.stamp, w - 152, 50, assets);
    g.strokeStyle = "#9D304F";
    g.beginPath();
    g.arc(w - 168, 151, 49, 0, Math.PI * 2);
    g.stroke();
    g.font = "14px Caveat";
    g.fillStyle = "#9D304F";
    g.textAlign = "center";
    g.fillText(d.date, w - 168, 150);
    g.textAlign = "left";
    g.font = `${d.portrait ? 20 : 28}px Caveat`;
    g.fillStyle = "#50313f";
    g.fillText("To my favorite person", w * 0.62, 280, w * 0.33);
    g.font = "22px Caveat";
    g.fillText(d.place, w * 0.62, 340, w * 0.33);
    g.fillText(d.date, w * 0.62, 380, w * 0.33);
    g.font = "30px Caveat";
    let y = 100;
    const words = d.message.split(/\s+/);
    let line = "";
    for (const w of words) {
      if (g.measureText(line + w).width > (d.portrait ? 245 : 410)) {
        g.fillText(line, 54, y);
        y += 38;
        line = "";
      }
      line += w + " ";
    }
    g.fillText(line, 54, y);
    strokes(g, d.backStrokes);
  } else {
    g.save();
    g.beginPath();
    g.rect(30, 30, w - 60, h - 60);
    g.clip();
    g.fillStyle = d.paper;
    g.fillRect(30, 30, w - 60, h - 60);
    if (photo) {
      g.filter = cardFilters[d.filter] || "none";
      const p = photo as ImageBitmap;
      const base =
        Math.max((w - 60) / p.width, (h - 60) / p.height) *
        d.photoTransform.zoom;
      g.drawImage(
        photo,
        w / 2 - (p.width * base) / 2 + d.photoTransform.x,
        h / 2 - (p.height * base) / 2 + d.photoTransform.y,
        p.width * base,
        p.height * base,
      );
      g.filter = "none";
    }
    g.restore();
    strokes(g, d.strokes);
    for (const s of d.stickers) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
      const sScale = Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 1;
      const sRot = Number.isFinite(s.rotation) ? s.rotation : 0;
      g.save();
      g.translate(s.x, s.y);
      g.rotate((sRot * Math.PI) / 180);
      g.scale(sScale * (s.flip ? -1 : 1), sScale);
      g.fillStyle =
        s.kind === "sparkles"
          ? "#FBBF24"
          : s.kind === "rose"
            ? "#E11D48"
            : s.kind === "letter"
              ? "#FFFBEB"
              : s.kind === "ribbon" || s.kind === "gift"
                ? "#F472B6"
                : s.kind === "lock"
                  ? "#F59E0B"
                  : s.kind === "bear"
                    ? "#D97706"
                    : s.kind === "kiss"
                      ? "#F43F5E"
                      : s.kind === "bubble"
                        ? "#FFF1F2"
                        : s.kind === "cloud"
                          ? "#EAE1F5"
                          : s.kind === "star"
                            ? "#F7E6A6"
                            : "#F8C9D8";
      if (s.kind.startsWith("asset:") && assets[s.kind.slice(6)])
        g.drawImage(assets[s.kind.slice(6)], -40, -40, 80, 80);
      else if (s.kind === "heart") heart(g, 0, 0, 35);
      else motif(g, s.kind);
      g.restore();
    }
    for (const t of d.texts) {
      g.save();
      g.fillStyle = t.color;
      g.strokeStyle = "#FFF8F3";
      g.lineWidth = 4;
      g.font = `${t.size}px ${t.font}`;
      if (["highlight", "bubble", "label"].includes(t.style)) {
        g.fillStyle = "#F7E6A6";
        const width=g.measureText(t.text).width+20;
        g.beginPath();g.roundRect(t.x-10,t.y-t.size,width,t.size+14,t.style==='bubble'?16:t.style==='label'?4:0);g.fill();
        if(t.style==='bubble'){g.beginPath();g.moveTo(t.x+12,t.y+14);g.lineTo(t.x+6,t.y+26);g.lineTo(t.x+28,t.y+14);g.fill();}
        if(t.style==='label'){g.strokeStyle='#50313F';g.lineWidth=1;g.setLineDash([3,3]);g.strokeRect(t.x-6,t.y-t.size+4,width-8,t.size+6);g.setLineDash([]);}
        g.fillStyle = t.color;
      }
      if (t.style === "outline") g.strokeText(t.text, t.x, t.y);
      if (t.curve) {
        let x = t.x;
        for (let i = 0; i < t.text.length; i++) {
          g.fillText(
            t.text[i],
            x,
            t.y + Math.sin((i / t.text.length) * Math.PI) * -30,
          );
          x += g.measureText(t.text[i]).width;
        }
      } else g.fillText(t.text, t.x, t.y);
      g.restore();
    }
    if (d.frontStamp) stamp(g, d.stamp, w - 140, 50, assets);
    if (d.frame !== "Printed") {
      g.strokeStyle = "#FFF8F3";
      g.lineWidth = d.frame === "Polaroid" ? 25 : 12;
      g.setLineDash(
        d.frame === "Film strip"
          ? [14, 18]
          : d.frame === "Lace"
            ? [2, 6]
            : d.frame === "Torn edge"
              ? [17, 5]
              : [8, 10],
      );
      g.strokeRect(23, 23, w - 46, h - 46);
      g.setLineDash([]);
    }
    const frameAsset =
      assets[
        `postcard-frame-${["Scalloped edge", "Polaroid", "Film strip", "Torn edge", "Lace"].indexOf(d.frame) + 1}`
      ];
    if (frameAsset) g.drawImage(frameAsset, 0, 0, w, h);
  }
  g.restore();
}
export async function exportCard(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Postcard could not export.")),
        "image/webp",
        quality,
      ),
    );
    if (blob.size <= 400000) return blob;
  }
  throw new Error(
    "This design is too large. Try a simpler photo or fewer layers.",
  );
}
