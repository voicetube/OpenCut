"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Progress } from "./ui/progress";
import { Download, X, Info } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";

export type ExportFormat = "mp4" | "webm" | "mov";
export type ExportResolution = "original" | "1080p" | "720p" | "480p";
export type ExportFrameRate = 24 | 30 | 60;

interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: ExportOptions) => Promise<void>;
}

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  frameRate: ExportFrameRate;
  quality: number; // 1-100
  useBackend?: boolean; // Use backend FFmpeg for better caption support
}

export function ExportDialog({
  isOpen,
  onOpenChange,
  onExport,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [resolution, setResolution] = useState<ExportResolution>("original");
  const [frameRate, setFrameRate] = useState<ExportFrameRate>(30);
  const [quality, setQuality] = useState(80);
  const [useBackend, setUseBackend] = useState(true); // Default to backend for better caption support
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus("Preparing export...");

      // Create a progress handler
      (window as any).ffmpegProgressHandler = (progress: number) => {
        setExportProgress(Math.round(progress));
        setExportStatus(`Rendering video... ${Math.round(progress)}%`);
      };

      await onExport({
        format,
        resolution,
        frameRate,
        quality,
        useBackend,
      });

      toast.success("Video exported successfully!");
      onOpenChange(false);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to export video"
      );
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus("");
      delete (window as any).ffmpegProgressHandler;
    }
  };

  const handleCancel = () => {
    if (!isExporting) {
      onOpenChange(false);
    }
  };

  const getEstimatedFileSize = () => {
    // Rough estimation based on settings
    const baseSize = 100; // MB for 1 minute at 1080p
    const resolutionMultiplier =
      resolution === "original"
        ? 1.5
        : resolution === "1080p"
        ? 1
        : resolution === "720p"
        ? 0.5
        : 0.25;
    const qualityMultiplier = quality / 100;
    const formatMultiplier = format === "webm" ? 0.8 : 1;
    
    const estimatedSize = baseSize * resolutionMultiplier * qualityMultiplier * formatMultiplier;
    return `~${Math.round(estimatedSize)} MB/min`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>
            Configure export settings for your video
          </DialogDescription>
        </DialogHeader>

        {!isExporting ? (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="format" className="text-right">
                Format
              </Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as ExportFormat)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (H.264)</SelectItem>
                  <SelectItem value="webm">WebM (VP9)</SelectItem>
                  <SelectItem value="mov">MOV (ProRes)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="resolution" className="text-right">
                Resolution
              </Label>
              <Select
                value={resolution}
                onValueChange={(value) =>
                  setResolution(value as ExportResolution)
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original</SelectItem>
                  <SelectItem value="1080p">1080p (1920×1080)</SelectItem>
                  <SelectItem value="720p">720p (1280×720)</SelectItem>
                  <SelectItem value="480p">480p (854×480)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="framerate" className="text-right">
                Frame Rate
              </Label>
              <Select
                value={frameRate.toString()}
                onValueChange={(value) =>
                  setFrameRate(parseInt(value) as ExportFrameRate)
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 fps</SelectItem>
                  <SelectItem value="30">30 fps</SelectItem>
                  <SelectItem value="60">60 fps</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quality" className="text-right">
                Quality
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground w-12">
                    {quality}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated size: {getEstimatedFileSize()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="backend" className="text-right">
                Caption Mode
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="backend"
                    checked={useBackend}
                    onCheckedChange={setUseBackend}
                  />
                  <Label htmlFor="backend" className="font-normal">
                    {useBackend ? "Server rendering (with captions)" : "Browser rendering (fast)"}
                  </Label>
                </div>
                <div className="flex items-start gap-1">
                  <Info className="h-3 w-3 text-muted-foreground mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    {useBackend 
                      ? "Uses server-side FFmpeg for full caption support. Slower but embeds all text."
                      : "Uses browser-based rendering. Faster but may not include captions."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium mb-2">{exportStatus}</p>
              <Progress value={exportProgress} className="w-full" />
              <p className="text-xs text-muted-foreground mt-2">
                {exportProgress}% complete
              </p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              This may take a few minutes depending on your video length and
              settings
            </p>
          </div>
        )}

        <DialogFooter>
          {!isExporting ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled>
              <X className="mr-2 h-4 w-4" />
              Processing...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}