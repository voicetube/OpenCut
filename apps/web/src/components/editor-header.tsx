"use client";

import { Button } from "./ui/button";
import {
  ChevronDown,
  ArrowLeft,
  Download,
  SquarePen,
  Trash,
  Sun,
} from "lucide-react";
import { useTimelineStore } from "@/stores/timeline-store";
import { HeaderBase } from "./header-base";
import { formatTimeCode } from "@/lib/time";
import { useProjectStore } from "@/stores/project-store";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import Link from "next/link";
import { RenameProjectDialog } from "./rename-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { useRouter } from "next/navigation";
import { FaDiscord } from "react-icons/fa6";
import { useTheme } from "next-themes";
import { usePlaybackStore } from "@/stores/playback-store";
import { TransitionUpIcon } from "./icons";
import { PanelPresetSelector } from "./panel-preset-selector";
import { ExportDialog, type ExportOptions } from "./export-dialog";
import { renderTimelineVideo } from "@/lib/ffmpeg-utils";
import { toast } from "sonner";
import { useMediaStore } from "@/stores/media-store";

export function EditorHeader() {
  const { getTotalDuration } = useTimelineStore();
  const { currentTime } = usePlaybackStore();
  const { activeProject, renameProject, deleteProject } = useProjectStore();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const handleNameSave = async (newName: string) => {
    console.log("handleNameSave", newName);
    if (activeProject && newName.trim() && newName !== activeProject.name) {
      try {
        await renameProject(activeProject.id, newName.trim());
        setIsRenameDialogOpen(false);
      } catch (error) {
        console.error("Failed to rename project:", error);
      }
    }
  };

  const handleDelete = () => {
    if (activeProject) {
      deleteProject(activeProject.id);
      setIsDeleteDialogOpen(false);
      router.push("/projects");
    }
  };

  const leftContent = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="h-auto py-1.5 px-2.5 flex items-center justify-center"
          >
            <ChevronDown className="text-muted-foreground" />
            <span className="text-[0.85rem] mr-2">{activeProject?.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40 z-100">
          <Link href="/projects">
            <DropdownMenuItem className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem
            className="flex items-center gap-1.5"
            onClick={() => setIsRenameDialogOpen(true)}
          >
            <SquarePen className="h-4 w-4" />
            Rename project
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="flex items-center gap-1.5"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash className="h-4 w-4" />
            Delete Project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href="https://discord.gg/zmR9N35cjK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <FaDiscord className="h-4 w-4" />
              Discord
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameProjectDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onConfirm={handleNameSave}
        projectName={activeProject?.name || ""}
      />
      <DeleteProjectDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        projectName={activeProject?.name || ""}
      />
    </div>
  );

  const centerContent = (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-foreground tabular-nums">
        {formatTimeCode(currentTime, "HH:MM:SS:FF", activeProject?.fps || 30)}
      </span>
      <span className="text-foreground/50">/</span>
      <span className="text-foreground/50 tabular-nums">
        {formatTimeCode(
          getTotalDuration(),
          "HH:MM:SS:FF",
          activeProject?.fps || 30
        )}
      </span>
    </div>
  );

  const rightContent = (
    <nav className="flex items-center gap-2">
      <PanelPresetSelector />
      <KeyboardShortcutsHelp />
      <ExportButton />
      <Button
        size="icon"
        variant="text"
        className="h-7"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Sun className="!size-[1.1rem]" />
        <span className="sr-only">{theme === "dark" ? "Light" : "Dark"}</span>
      </Button>
    </nav>
  );

  return (
    <HeaderBase
      leftContent={leftContent}
      centerContent={centerContent}
      rightContent={rightContent}
      className="bg-background h-[3.2rem] px-3 items-center mt-0.5"
    />
  );
}

function ExportButton() {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const { activeProject } = useProjectStore();
  const { tracks, getTotalDuration } = useTimelineStore();
  const { mediaItems } = useMediaStore();

  const handleExport = async (options: ExportOptions) => {
    try {
      // Check if timeline has content
      if (tracks.length === 0 || tracks.every(t => t.elements.length === 0)) {
        throw new Error("Timeline is empty. Add some content before exporting.");
      }

      if (options.useBackend) {
        // Use backend export for better caption support
        const formData = new FormData();
        
        // Add timeline data
        formData.append("timeline", JSON.stringify({
          tracks,
          totalDuration: getTotalDuration(),
        }));
        formData.append("options", JSON.stringify(options));
        formData.append("canvasSize", JSON.stringify(
          activeProject?.canvasSize || { width: 1920, height: 1080 }
        ));

        // Add media files
        for (const track of tracks) {
          for (const element of track.elements) {
            if (element.type === "media" && element.mediaId) {
              const mediaItem = mediaItems.find(m => m.id === element.mediaId);
              if (mediaItem && mediaItem.file) {
                formData.append(`media_${element.mediaId}`, mediaItem.file);
              }
            }
          }
        }

        // Send to backend
        const response = await fetch("/api/export-video", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Export failed");
        }

        // Get the video blob
        const videoBlob = await response.blob();

        // Create download link
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeProject?.name || "video"}_export.${options.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } else {
        // Use frontend export (faster but limited caption support)
        const progressHandler = (window as any).ffmpegProgressHandler;
        
        const videoBlob = await renderTimelineVideo({
          ...options,
          onProgress: progressHandler,
        });

        // Create download link
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeProject?.name || "video"}_export.${options.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (error) {
      console.error("Export failed:", error);
      throw error; // Re-throw to be handled by the dialog
    }
  };

  return (
    <>
      <button
        className="flex items-center gap-1.5 bg-[#38BDF8] text-white rounded-md px-[0.1rem] py-[0.1rem] cursor-pointer hover:brightness-95 transition-all duration-200"
        onClick={() => setIsExportDialogOpen(true)}
      >
        <div className="flex items-center gap-1.5 bg-linear-270 from-[#2567EC] to-[#37B6F7] rounded-[0.8rem] px-4 py-1 relative shadow-[0_1px_3px_0px_rgba(0,0,0,0.45)]">
          <TransitionUpIcon className="z-50" />
          <span className="text-[0.875rem] z-50">Export</span>
          <div className="absolute w-full h-full left-0 top-0 bg-linear-to-t from-white/0 to-white/50 z-10 rounded-[0.8rem] flex items-center justify-center">
            <div className="absolute w-[calc(100%-4px)] h-[calc(100%-4px)] top-[0.12rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] z-50 rounded-lg"></div>
          </div>
        </div>
      </button>
      
      <ExportDialog
        isOpen={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExport}
      />
    </>
  );
}
