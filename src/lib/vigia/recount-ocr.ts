import { createWorker, PSM } from "tesseract.js";
import type { OCRWord } from "./recounts";
export async function readRecountPhotos(images: string[], onProgress: (message: string) => void) {
  const base = new URL("/ocr/", window.location.origin).href;
  const worker = await createWorker("spa", 1, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: base,
    logger: (m) => {
      if (m.status === "recognizing text")
        onProgress(`Leyendo documento… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
    const pages: { text: string; words: OCRWord[] }[] = [];
    for (let i = 0; i < images.length; i++) {
      onProgress(`Leyendo página ${i + 1} de ${images.length}…`);
      const { data } = await worker.recognize(images[i], {}, { text: true, blocks: true });
      const words =
        data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ??
        [];
      pages.push({ text: data.text, words });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
export async function prepareRecountPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Usá una foto JPG, PNG o WebP.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("La foto supera 25 MB. Elegí una imagen más pequeña.");
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la fotografía.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    image.close();
  }
}
