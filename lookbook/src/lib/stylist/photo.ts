"use client"

/**
 * Reads a photo the shopper picked and shrinks it in the browser (longest side `max` px,
 * JPEG) so uploads stay small and quick. The server re-validates and re-encodes it anyway.
 */
export async function photoToDataUrl(file: File, max = 1024): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.")
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too large; please choose one under 15 MB.")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn't open that photo. Could you try another?")
  })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.86)
}
