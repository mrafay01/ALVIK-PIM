"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Field";

export function UploadForm() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/import-review", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      router.push(`/admin/import-review/${data.batchId}`);
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <input type="file" name="file" accept=".xlsx,.xls" required className="text-[0.85rem] text-ink-soft" />
      <Button type="submit" variant="primary" disabled={uploading}>
        <span className="flex items-center gap-1.5">
          <Upload size={14} /> {uploading ? "Parsing…" : "Upload & Parse"}
        </span>
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
