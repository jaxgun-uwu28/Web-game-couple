"use client";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera as CameraIcon } from "lucide-react";
export default function NativePhotoButton({
  onPhoto,
  cameraOnly = false,
  label,
  disabled = false,
}: {
  onPhoto: (file: File) => void | Promise<void>;
  cameraOnly?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!Capacitor.isNativePlatform()) return null;
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy || disabled}
        onClick={() => {
          setBusy(true);
          setError("");
          void (async () => {
            const { Camera, CameraResultType, CameraSource } =
              await import("@capacitor/camera");
            const photo = await Camera.getPhoto({
              source: cameraOnly ? CameraSource.Camera : CameraSource.Prompt,
              resultType: CameraResultType.Uri,
              quality: 85,
              saveToGallery: false,
              promptLabelHeader: "Add a photo",
              promptLabelPhoto: "Choose from photos",
              promptLabelPicture: "Take a photo",
            });
            if (!photo.webPath)
              throw new Error(
                "The photo could not open. Try the gallery upload.",
              );
            const response = await fetch(photo.webPath);
            if (!response.ok) throw new Error("The photo could not open.");
            await onPhoto(
              new File([await response.blob()], "snap.jpg", {
                type: "image/jpeg",
              }),
            );
          })()
            .catch(() =>
              setError(
                "No photo was added. You can retry or use the gallery upload.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <CameraIcon size={18} />
        {busy ? "Opening camera…" : label || "Camera or photo library"}
      </button>
      {error && <p role="status">{error}</p>}
    </>
  );
}
