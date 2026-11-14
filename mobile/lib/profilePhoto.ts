import type { ImagePickerAsset } from "expo-image-picker";
import { Platform } from "react-native";

// Avatars show at ~30-100px; the server shrinks to this size anyway.
const MAX_SIDE = 600;

async function loadImage(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Some browsers can't decode every format this way - fall back below.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that photo."));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Web: a small JPEG drawn from the chosen photo. Keeps the upload well under
// the server's 2 MB limit (phone camera photos are often bigger) and turns
// formats the server can't read (e.g. iPhone HEIC) into JPEG.
async function webPhoto(asset: ImagePickerAsset): Promise<Blob> {
  const original: Blob = (asset as ImagePickerAsset & { file?: File }).file ?? (await (await fetch(asset.uri)).blob());
  const image = await loadImage(original);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.85)
  );
}

/**
 * The upload form for a new profile photo. Phones send the picked file by
 * its address (React Native reads it); a browser needs the actual image
 * data - passing the phone-style address there sent the text
 * "[object Object]" instead of a photo, so the upload always failed.
 */
export async function profilePhotoForm(asset: ImagePickerAsset): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    form.append("profile_picture", await webPhoto(asset), "profile.jpg");
  } else {
    form.append("profile_picture", {
      uri: asset.uri,
      name: asset.fileName ?? "profile.jpg",
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }
  return form;
}
